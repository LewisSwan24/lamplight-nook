import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const shop = pathToFileURL(join(__dirname, '..', 'tools', 'sim', 'shop.mjs')).href;

/** Run a snippet against shop.mjs in its own node process and return what it printed. */
function inChild(body: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(shop)});\n${body}`], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout.trim().split('\n')[0]);
}

describe('throwaway folders', () => {
  it('removes every sim home once the process ends', () => {
    const homes: string[] = inChild('console.log(JSON.stringify([m.freshHome().home, m.freshHome({ "settings.json": {} }).home]));');
    for (const h of homes) expect(existsSync(h)).toBe(false);
  });

  it('keeps them with SIM_KEEP_HOME=1', () => {
    const [h]: string[] = inChild('console.log(JSON.stringify([m.freshHome().home]));', { SIM_KEEP_HOME: '1' });
    expect(existsSync(h)).toBe(true);
  });

  it('copies no node into the home for "not installed", and still finds no claude', () => {
    const r = inChild('const { existsSync } = await import("node:fs"); const h = m.freshHome(); const p = m.pathWithoutClaude(h); console.log(JSON.stringify({ shim: existsSync(h.home + "/.sim-bin"), path: p }));');
    expect(r.shim).toBe(false);
    for (const d of r.path.split(process.platform === 'win32' ? ';' : ':')) {
      for (const n of ['claude', 'claude.exe', 'claude.cmd']) expect(existsSync(join(d, n))).toBe(false);
    }
  });

  it('unit tests write their temp folders into one folder per run', () => {
    expect(basename(tmpdir())).toMatch(/^lamplight-vitest-/);
  });
});
