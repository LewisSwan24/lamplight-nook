import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prices, Provider } from '../shared/providers';
import type { ProviderSaveResult } from '../shared/types';
export type { ProviderSaveResult };
import { baseUrlProblem, cleanProvider, secretSlot } from '../shared/providers';
import { type Credentials, type KeyCrypto, HOST_VARS, knowSecret } from './api-key';
import type { Usage } from './prices';

/**
 * The keys of every provider the user has set up (plan-1.6.md F7), each encrypted with the OS on its own, so switching
 * from one to another and back loses none. The Anthropic key stays in the file 1.5 kept it in; the others are in `keys/`.
 * Every key read or written is made known to the redaction, so it never reaches a log or the diagnostics.
 */
export class ProviderKeys {
  constructor(private dir: string, private anthropicFile: string, private crypto: KeyCrypto) {}

  /** A slot's file: only letters, digits, dots and dashes, so a slot never names a file outside the folder. */
  private file(slot: string): string {
    if (slot === 'anthropic') return this.anthropicFile;
    return join(this.dir, 'keys', `${slot.replace(/[^a-z0-9.-]/gi, '').replace(/^\.+/, '') || 'compatible'}.bin`);
  }

  get(slot: string): string | null {
    const file = this.file(slot);
    if (!existsSync(file) || !this.crypto.isEncryptionAvailable()) return null;
    try {
      const key = this.crypto.decryptString(readFileSync(file));
      knowSecret(key);
      return key || null;
    } catch {
      return null;
    }
  }

  /** False when the OS cannot encrypt it; it is then not written anywhere. */
  set(slot: string, key: string): boolean {
    if (!this.crypto.isEncryptionAvailable()) return false;
    knowSecret(key);
    const file = this.file(slot);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(`${file}.tmp`, this.crypto.encryptString(key));
    renameSync(`${file}.tmp`, file);
    return true;
  }

  clear(slot: string) {
    rmSync(this.file(slot), { force: true });
  }
}

/** Never show a key in full. */
export const providerHint = (key: string) => `...${key.slice(-4)}`;

/** The credentials a run uses on this provider: its own key (Vertex keeps none of the shop's), or null without one. */
export function providerCredentials(p: Provider, key: (slot: string) => string | null): Credentials | null {
  const secret = key(secretSlot(p));
  if (p.kind === 'anthropic') return secret ? { source: 'stored', apiKey: secret } : null;
  if (p.kind === 'vertex') return { source: 'stored', provider: p };
  return secret ? { source: 'stored', apiKey: secret, provider: p } : null;
}

/** An AWS access key id, as the first half of a Bedrock key kept as `id:secret`. */
const ACCESS_KEY_ID = /^[A-Z0-9]{16,128}$/;

/**
 * The environment Claude Code runs with on a provider other than Anthropic: the machine's own Anthropic, Claude Code, AWS
 * and Google Cloud settings are all removed, and only what the chosen provider needs is put back, as each one's own
 * documentation sets Claude Code up.
 */
export function providerEnv(p: Provider, secret: string | null | undefined, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !HOST_VARS.test(name)));
  out.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
  if (p.kind === 'compatible') {
    const model = p.model ?? '';
    Object.assign(out, {
      ANTHROPIC_BASE_URL: p.baseUrl,
      // The key goes as a bearer token; an empty API key keeps Claude Code from sending one of its own (OpenRouter's page).
      ANTHROPIC_AUTH_TOKEN: secret ?? '',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_MODEL: model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: p.fastModel ?? model,
      CLAUDE_CODE_SUBAGENT_MODEL: model,
      // Nothing to Anthropic's own services from a session that is not Anthropic's.
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    });
  } else if (p.kind === 'bedrock') {
    out.CLAUDE_CODE_USE_BEDROCK = '1';
    if (p.region) out.AWS_REGION = p.region;
    const colon = secret?.indexOf(':') ?? -1;
    if (secret && colon > 0 && ACCESS_KEY_ID.test(secret.slice(0, colon))) {
      out.AWS_ACCESS_KEY_ID = secret.slice(0, colon);
      out.AWS_SECRET_ACCESS_KEY = secret.slice(colon + 1);
    } else if (secret) {
      out.AWS_BEARER_TOKEN_BEDROCK = secret;
    }
  } else if (p.kind === 'vertex') {
    out.CLAUDE_CODE_USE_VERTEX = '1';
    if (p.region) out.CLOUD_ML_REGION = p.region;
    if (p.project) out.ANTHROPIC_VERTEX_PROJECT_ID = p.project;
    if (p.credentialsFile) out.GOOGLE_APPLICATION_CREDENTIALS = p.credentialsFile;
  } else if (secret) {
    out.ANTHROPIC_API_KEY = secret;
  }
  return out;
}

export type PostFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

/**
 * Ask a compatible service for the smallest reply there is (one token), as the key is saved: `ok`, or which part is wrong.
 * `address` when nothing answers there or it has no such page, `key` when it refuses the key, `model` when it does not know
 * the model, `unknown` for anything else (busy, down). It costs the user a token or two on their own key.
 */
export async function checkProvider(p: Provider, key: string, fetch: PostFetch, timeoutMs = 15_000): Promise<'ok' | 'address' | 'key' | 'model' | 'unknown'> {
  try {
    const res = await fetch(`${p.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: p.model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 200 && res.status < 300) return 'ok';
    if (res.status === 401 || res.status === 403) return 'key';
    const body = await res.text().catch(() => '');
    // A JSON error that names the model is about the model; any other missing page is the wrong address.
    const json = /^\s*\{/.test(body);
    if ([400, 404, 422].includes(res.status) && json && /model/i.test(body)) return 'model';
    if (res.status === 404) return 'address';
    return 'unknown';
  } catch {
    return 'address';
  }
}

/**
 * What calls cost at the prices the user filled in for a compatible service (Q-F9). The page gives one price for input:
 * every input token is counted at it, read from the cache or not. That counts high rather than low, so a cap is reached
 * early rather than late.
 */
export function pricedUsd(calls: Usage[], prices: Prices): number {
  const tokens = (u: Usage) => ((u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) * prices.input + (u.output_tokens ?? 0) * prices.output;
  return calls.reduce((sum, u) => sum + tokens(u), 0) / 1_000_000;
}


/**
 * Save the provider chosen in settings, with the key typed for it, if any (plan-1.6.md F7). A compatible service is
 * checked with the smallest request first, with the key typed or the one kept for it before; refused, nothing is kept and
 * the user hears which part is wrong. Bedrock's key is kept unchecked, as Claude Code checks it. Vertex needs only its
 * key file, which must be there. Anthropic is only chosen here: its key is saved the way it always was. The caller puts
 * the provider it hands back into settings.
 */
export async function saveProvider(raw: Provider, typed: string, keys: ProviderKeys, fetch: PostFetch): Promise<ProviderSaveResult> {
  const problem = raw.kind === 'compatible' && raw.baseUrl ? baseUrlProblem(raw.baseUrl.trim()) : null;
  if (problem) return { ok: false, reason: problem };
  const p = cleanProvider(raw);
  if (!p) return { ok: false, reason: 'missing' };
  if (p.kind === 'anthropic') return { ok: true, verified: false, provider: p };
  if (p.kind === 'vertex') return p.credentialsFile && existsSync(p.credentialsFile) ? { ok: true, verified: false, provider: p } : { ok: false, reason: 'file' };
  const slot = secretSlot(p);
  const key = typed.trim() || keys.get(slot);
  if (!key) return { ok: false, reason: 'missing' };
  let verified = false;
  if (p.kind === 'compatible') {
    const verdict = await checkProvider(p, key, fetch);
    if (verdict === 'address' || verdict === 'key' || verdict === 'model') return { ok: false, reason: verdict };
    verified = verdict === 'ok';
  }
  if (typed.trim() && !keys.set(slot, key)) return { ok: false, reason: 'storage' };
  return { ok: true, verified, provider: p, hint: providerHint(key) };
}
