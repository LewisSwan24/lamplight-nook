import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatLedger, ledgerTable } from '../tools/ledger-table.mjs';

const work = join(tmpdir(), 'works');
const resume = join(work, '2026-10-28-1500-resume');
const trip = join(work, '2026-11-02-0900-trip');
const gone = join(work, '2026-11-03-1000-deleted');

/** A data folder like the app's: two months, a folder no longer in the notebook, and one forgotten entry. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  writeFileSync(join(dir, 'spend.json'), JSON.stringify([
    { key: `${resume}|s1`, usd: 0.31, month: '2026-10' },
    { key: '1|', usd: 0.5, month: '2026-10' },
    { key: `${trip}|s2`, usd: 0.6, month: '2026-10' },
    { key: `${trip}|s2`, usd: 0.45, month: '2026-11' },
    { key: `${gone}|s3`, usd: 0.123456, month: '2026-11' },
  ]));
  writeFileSync(join(dir, 'memory.json'), JSON.stringify({
    commissions: [
      { id: 'a', title: '简历', date: '2026-10-28', result: 'done', choices: {}, folder: resume, costUsd: 0.31, sessionId: 's1' },
      { id: 'b', title: '京都 | 三天', date: '2026-11-02', result: 'done', choices: {}, folder: trip, costUsd: 1.05, sessionId: 's2' },
    ],
    stuckNotes: [],
  }));
  return dir;
}

describe('the ledger table for checking against the Console', () => {
  it('lists each entry under its month with the work title, then month totals and a grand total', () => {
    const lines = ledgerTable(fixture()).split('\n');
    expect(lines[0]).toContain('Console');
    expect(lines[0]).toContain('第 7 节');
    expect(lines).toContain('| 2026-10 | 简历 | s1 | 0.3100 |');
    expect(lines).toContain('| 2026-10 | 京都 \| 三天 | s2 | 0.6000 |');
    expect(lines).toContain('| 2026-11 | 京都 \| 三天 | s2 | 0.4500 |');
    expect(lines).toContain('| 2026-10 | **合计** |  | **1.4100** |');
    expect(lines).toContain('| 2026-11 | **合计** |  | **0.5735** |');
    expect(lines.at(-1)).toBe('| **总计** |  |  | **1.9835** |');
    const rows = lines.filter((l) => l.startsWith('| 2026-'));
    expect(rows.findIndex((l) => l.includes('2026-11'))).toBeGreaterThan(rows.findIndex((l) => l.includes('**合计**')));
  });

  it('names a folder the notebook no longer has by its last part, and a forgotten entry as forgotten', () => {
    const table = ledgerTable(fixture());
    expect(table).toContain('| 2026-11 | 2026-11-03-1000-deleted | s3 | 0.1235 |');
    expect(table).toContain('| 2026-10 | （已忘记，第 1 个文件夹） |  | 0.5000 |');
  });

  it('keeps to one month when asked', () => {
    const table = ledgerTable(fixture(), '2026-11');
    expect(table).not.toContain('2026-10');
    expect(table).toContain('| **总计** |  |  | **0.5735** |');
  });

  it('formats without touching any file', () => {
    const table = formatLedger([{ key: '/w/a|s9', usd: 2, month: '2026-09' }], [{ folder: '/w/a', title: '小工具' }]);
    expect(table).toContain('| 2026-09 | 小工具 | s9 | 2.0000 |');
  });

  it('from the command line prints the table and writes nothing', () => {
    const dir = fixture();
    const before = readdirSync(dir).map((f) => `${f}:${statSync(join(dir, f)).mtimeMs}`);
    const out = execFileSync(process.execPath, ['tools/ledger-table.mjs', dir, '--month', '2026-10'], { encoding: 'utf8' });
    expect(out).toContain('| 2026-10 | 简历 | s1 | 0.3100 |');
    expect(out).not.toContain('2026-11');
    expect(readdirSync(dir).map((f) => `${f}:${statSync(join(dir, f)).mtimeMs}`)).toEqual(before);
  });
});
