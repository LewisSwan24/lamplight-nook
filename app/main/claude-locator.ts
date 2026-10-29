import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * The app does not ship Claude Code; it uses the copy installed on the user's machine.
 * Development installs still have the SDK's own platform binary, which the SDK finds by itself.
 */
export type ClaudeLookup = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
  exists: (path: string) => boolean;
  /** True when the SDK's platform package is installed (development checkouts). */
  sdkBinary: boolean;
};

/** Where an installed Claude Code may live, most specific first. */
export function claudeCandidates({ platform, env, home }: Pick<ClaudeLookup, 'platform' | 'env' | 'home'>): string[] {
  const exe = platform === 'win32' ? 'claude.exe' : 'claude';
  const list: string[] = [];
  if (env.LAMPLIGHT_CLAUDE_PATH) list.push(env.LAMPLIGHT_CLAUDE_PATH);
  // The native installer puts the binary here on every platform.
  list.push(join(home, '.local', 'bin', exe));
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) list.push(join(dir, exe));
  // A global npm install ships the native binary inside the package; the claude.cmd shim cannot be spawned directly.
  if (platform === 'win32' && env.APPDATA) list.push(join(env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', exe));
  return list;
}

/**
 * The path to pass as pathToClaudeCodeExecutable: undefined lets the SDK use its own binary,
 * null means Claude Code is not installed.
 */
export function findClaude(lookup: ClaudeLookup): string | undefined | null {
  if (!lookup.env.LAMPLIGHT_CLAUDE_PATH && lookup.sdkBinary) return undefined;
  return claudeCandidates(lookup).find((p) => lookup.exists(p)) ?? null;
}

function sdkBinaryInstalled(): boolean {
  try {
    createRequire(import.meta.url).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
    return true;
  } catch {
    return false;
  }
}

export function locateClaude(): string | undefined | null {
  return findClaude({ platform: process.platform, env: process.env, home: homedir(), exists: existsSync, sdkBinary: sdkBinaryInstalled() });
}

/** The official one-line installer (code.claude.com/docs/en/setup); no administrator rights needed. */
export function installCommand(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash';
}
