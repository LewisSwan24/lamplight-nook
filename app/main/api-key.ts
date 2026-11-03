import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KeySaveResult, KeySource } from '../shared/types';

/** What the OS offers to encrypt the key at rest (Electron's safeStorage: DPAPI on Windows, Keychain on macOS). */
export type KeyCrypto = {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(data: Buffer): string;
};

const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
const ANY_KEY = /sk-ant-[A-Za-z0-9_-]{8,}/g;

/** Trim what the user pasted (spaces, quotes, a "ANTHROPIC_API_KEY=" prefix) down to the key itself. */
export function cleanKey(raw: string): string {
  return raw.trim().replace(/^ANTHROPIC_API_KEY\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim();
}

export const looksLikeKey = (key: string) => KEY_SHAPE.test(key);

/** Never show a key in full: keep the prefix and the last four characters. */
export const keyHint = (key: string) => `sk-ant-...${key.slice(-4)}`;

/** Replace anything shaped like an Anthropic key in a piece of text. */
export const redactSecrets = (text: string) => text.replace(ANY_KEY, 'sk-ant-[redacted]');

/**
 * The user's own API key, encrypted with the OS and kept in the app's data folder.
 * It is only ever read in the main process and handed to Claude Code through its environment.
 */
export class KeyStore {
  constructor(private file: string, private crypto: KeyCrypto) {}

  get(): string | null {
    if (!existsSync(this.file) || !this.crypto.isEncryptionAvailable()) return null;
    try {
      const key = this.crypto.decryptString(readFileSync(this.file));
      return looksLikeKey(key) ? key : null;
    } catch {
      return null;
    }
  }

  /** False when the OS cannot encrypt it; the key is then not written anywhere. */
  set(key: string): boolean {
    if (!this.crypto.isEncryptionAvailable()) return false;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.crypto.encryptString(key));
    renameSync(tmp, this.file);
    return true;
  }

  clear() {
    rmSync(this.file, { force: true });
  }
}

export type Credentials = { source: Exclude<KeySource, null>; apiKey?: string };

/**
 * Which credentials a run uses: the key saved in the app, else ANTHROPIC_API_KEY from the environment.
 * A signed-in Claude subscription (LAMPLIGHT_DEV_SUBSCRIPTION=1) only counts in development:
 * Anthropic does not allow third-party products to use subscription logins.
 */
export function pickCredentials(stored: string | null, env: NodeJS.ProcessEnv, packaged: boolean): Credentials | null {
  if (stored) return { source: 'stored', apiKey: stored };
  if (env.ANTHROPIC_API_KEY) return { source: 'env', apiKey: env.ANTHROPIC_API_KEY };
  if (!packaged && env.LAMPLIGHT_DEV_SUBSCRIPTION === '1') return { source: 'subscription' };
  return null;
}

/** Variables from a surrounding Claude session (login, organization, host, endpoint) that would override the key. */
const HOST_SESSION_VAR = /^(ANTHROPIC_|CLAUDE_CODE_|CLAUDECODE$)/;

/**
 * The environment Claude Code runs with. With an API key, every other Anthropic or Claude Code setting is removed,
 * so a user's own Claude login, or the session that launched the app, can never be picked up by a shipped build.
 */
export function agentEnv(creds: Credentials, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = creds.apiKey ? Object.fromEntries(Object.entries(env).filter(([name]) => !HOST_SESSION_VAR.test(name))) : { ...env };
  if (creds.apiKey) out.ANTHROPIC_API_KEY = creds.apiKey;
  // Helpers and commands run while the staff wait for them: one commission, one result at the end.
  // Newer Claude Code may otherwise send a helper off in the background and report "done" before it is back.
  out.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
  return out;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number }>;

/** The cheapest call that proves a key works: list one model. Costs nothing. */
export async function checkKey(key: string, fetch: Fetch, timeoutMs = 10_000): Promise<'ok' | 'invalid' | 'unknown'> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      method: 'GET',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 200) return 'ok';
    if (res.status === 401 || res.status === 403) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Save a pasted key: check its shape, ask Anthropic whether it works, then store it encrypted.
 * When Anthropic can't be reached the key is kept anyway and the user is told it is not checked yet.
 */
export async function saveKey(raw: string, store: KeyStore, fetch: Fetch): Promise<KeySaveResult> {
  const key = cleanKey(raw);
  if (!looksLikeKey(key)) return { ok: false, reason: 'format' };
  const verdict = await checkKey(key, fetch);
  if (verdict === 'invalid') return { ok: false, reason: 'invalid' };
  if (!store.set(key)) return { ok: false, reason: 'storage' };
  return { ok: true, verified: verdict === 'ok', hint: keyHint(key) };
}
