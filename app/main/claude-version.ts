import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import sdkPackage from '../../node_modules/@anthropic-ai/claude-agent-sdk/package.json';

/**
 * Which Claude Code the shop is talking to. The app does not ship Claude Code; it drives the copy on the
 * user's machine, which updates itself. The Agent SDK is built against one Claude Code version
 * (its package.json `claudeCodeVersion`), and that is the version the shop has been tried with.
 *
 * - `old`: an earlier minor or major version than that. Flags or messages the SDK relies on may be missing,
 *   so the user is told and offered the official update; they can still go ahead.
 * - `newer`: a later major version. Usually fine; only written to the log, so a failure can be traced.
 * - `ok`: the same major version, same minor or later.
 * - `unknown`: the version could not be read. Treated as fine.
 */
export type ClaudeCompat = 'ok' | 'old' | 'newer' | 'unknown';

type Version = [number, number, number];

/** "2.1.306 (Claude Code)" -> [2, 1, 306]; anything else -> null. */
export function parseVersion(text: string | undefined | null): Version | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compat(version: string | undefined | null, tested: string | undefined | null): ClaudeCompat {
  const v = parseVersion(version);
  const t = parseVersion(tested);
  if (!v || !t) return 'unknown';
  if (v[0] < t[0] || (v[0] === t[0] && v[1] < t[1])) return 'old';
  if (v[0] > t[0]) return 'newer';
  return 'ok';
}

/** The Claude Code version the Agent SDK in this build was made for (read at build time; the SDK does not export its package.json). */
export function testedVersion(): string | undefined {
  const v = (sdkPackage as { claudeCodeVersion?: unknown }).claudeCodeVersion;
  return typeof v === 'string' ? v : undefined;
}

export type ClaudeVersion = { version?: string; compat: ClaudeCompat; tested?: string };

const cache = new Map<string, { stamp: number; version?: string }>();

/**
 * Ask Claude Code its version (`claude --version`). `path` is what locateClaude() found: undefined means the
 * SDK's own copy (development), which is the tested version by definition. Cached until the file changes,
 * so an update is noticed without restarting.
 */
export async function claudeVersion(path: string | undefined, run: (file: string) => Promise<string> = versionOutput): Promise<ClaudeVersion> {
  const tested = testedVersion();
  if (path === undefined) return { version: tested, compat: tested ? 'ok' : 'unknown', tested };
  let stamp = 0;
  try { stamp = statSync(path).mtimeMs; } catch { /* checked again below */ }
  let hit = cache.get(path);
  if (!hit || hit.stamp !== stamp) {
    let version: string | undefined;
    try {
      const v = parseVersion(await run(path));
      version = v ? v.join('.') : undefined;
    } catch {
      version = undefined;
    }
    hit = { stamp, version };
    cache.set(path, hit);
  }
  return { version: hit.version, compat: compat(hit.version, tested), tested };
}

/**
 * The command that prints a version. A script goes through the node on PATH, which is what the SDK starts it with
 * (its `executable` option defaults to node); Windows cannot start a script alone, and the shipped app cannot act as Node.
 */
export function versionCommand(file: string): { file: string; args: string[] } {
  if (/\.[cm]?js$/i.test(file)) return { file: 'node', args: [file, '--version'] };
  return { file, args: ['--version'] };
}

function versionOutput(path: string): Promise<string> {
  const { file, args } = versionCommand(path);
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 8000, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}
