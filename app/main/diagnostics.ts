import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { KeySource, Settings } from '../shared/types';
import { redactSecrets } from './api-key';
import type { ZipEntry } from './zip';

export type DiagnosticsInput = {
  app: { version: string; packaged: boolean; electron: string; chrome: string; node: string; locale: string };
  os: { platform: string; release: string; arch: string };
  hasClaude: boolean;
  keySource: KeySource;
  settings: Settings;
  defaultWorkRoot: string;
  logDir: string;
  crashDir: string;
  /** The user's home folder, replaced by ~ wherever it shows up (it usually carries their name). */
  home: string;
};

const README = `Lamplight Nook diagnostics

What is in here: the app's own logs from the last week, and a summary of
this computer and the app's settings.

What is NOT in here: the API key, what any commission was about, the files
commissions made, recordings of runs, and crash memory dumps (only their
names and sizes are listed). Your name and folders are replaced by
placeholders.
`;

/** Crash dumps by name and size only: they hold raw memory, so they never leave the computer. */
function listing(dir: string): { name: string; bytes: number }[] {
  if (!existsSync(dir)) return [];
  const out: { name: string; bytes: number }[] = [];
  const walk = (d: string, prefix: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, `${prefix}${name}/`);
      else if (name.endsWith('.dmp')) out.push({ name: `${prefix}${name}`, bytes: st.size });
    }
  };
  walk(dir, '');
  return out;
}

/** What goes into the diagnostics zip. Everything is text the user could read before sending it. */
export function diagnosticsEntries(input: DiagnosticsInput): ZipEntry[] {
  const { settings } = input;
  const clean = (text: string) => redactSecrets(input.home ? text.split(input.home).join('~') : text);
  const system = {
    app: input.app,
    os: input.os,
    claudeCode: input.hasClaude ? 'found' : 'missing',
    apiKey: input.keySource ?? 'none',
    settings: {
      ...settings,
      name: settings.name ? '(set)' : '(empty)',
      workRoot: settings.workRoot === input.defaultWorkRoot ? '(default)' : '(custom)',
    },
    crashDumps: listing(input.crashDir),
  };
  const logs = existsSync(input.logDir) ? readdirSync(input.logDir).filter((n) => n.endsWith('.log')).sort() : [];
  return [
    { name: 'README.txt', data: README },
    { name: 'system.json', data: clean(JSON.stringify(system, null, 2)) },
    ...logs.map((n) => ({ name: `logs/${n}`, data: clean(readFileSync(join(input.logDir, n), 'utf8')) })),
  ];
}
