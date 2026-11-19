// Vitest global setup: the tests' temp folders (mkdtempSync(join(tmpdir(), ...)) all over tests/) go into one
// folder per run, removed when the run ends. Workers and the processes they start inherit the variables.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VARS = ['TEMP', 'TMP', 'TMPDIR'] as const;

export default function setup() {
  const root = mkdtempSync(join(tmpdir(), 'lamplight-vitest-'));
  const before = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) process.env[k] = root;
  return () => {
    for (const k of VARS) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Never fail a run over tidying up.
    }
  };
}
