import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commissionDir, interimPermission, isInside } from '../app/main/agent-runner';
import { MAX_RECORDINGS, pruneRecordings, Recorder, truncateDeep } from '../app/main/recorder';
import { strings } from '../app/shared/i18n';

describe('recorder', () => {
  it('truncates long text and drops credential-like fields', () => {
    const out = truncateDeep({ text: 'a'.repeat(3000), apiKey: 'sk-xxx', nested: { Authorization: 'x', ok: 1 } }) as Record<string, any>;
    expect(out.text.length).toBeLessThan(2100);
    expect(out.apiKey).toBeUndefined();
    expect(out.nested).toEqual({ ok: 1 });
  });

  it('writes one JSON object per line', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'lamplight-')), 'r', 'events.jsonl');
    const r = new Recorder(p);
    r.write({ t: 1, source: 'hook', name: 'A', payload: {} });
    r.write({ t: 2, source: 'message', name: 'B', payload: {} });
    const lines = readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.name)).toEqual(['A', 'B']);
  });
});

describe('records of runs', () => {
  it('keeps the newest ones and lets the rest go', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lamplight-rec-'));
    for (let i = 10; i < 70; i++) writeFileSync(join(dir, `17000000000${i}-commission.jsonl`), '{}');
    pruneRecordings(dir);
    const left = readdirSync(dir).sort();
    expect(left).toHaveLength(MAX_RECORDINGS);
    expect(left.at(-1)).toBe('1700000000069-commission.jsonl');
    expect(left[0]).toBe(`17000000000${70 - MAX_RECORDINGS}-commission.jsonl`);
  });

  it('has nothing to do when there are none yet', () => {
    expect(() => pruneRecordings(join(tmpdir(), 'lamplight-no-such-folder'))).not.toThrow();
  });
});

describe('interim permissions', () => {
  const dir = join(tmpdir(), 'commission');
  const allow = interimPermission(dir);
  const opts = { signal: new AbortController().signal } as any;

  it('allows writes inside the commission folder and denies them outside', async () => {
    expect((await allow('Write', { file_path: join(dir, 'a.html') }, opts))?.behavior).toBe('allow');
    expect((await allow('Write', { file_path: join(dir, '..', 'b.txt') }, opts))?.behavior).toBe('deny');
    expect((await allow('Edit', { file_path: 'relative.txt' }, opts))?.behavior).toBe('allow');
  });

  it('allows read-only tools and denies Bash', async () => {
    expect((await allow('Read', { file_path: '/etc/hosts' }, opts))?.behavior).toBe('allow');
    expect((await allow('Bash', { command: 'rm -rf /' }, opts))?.behavior).toBe('deny');
  });

  it('isInside rejects paths that escape the folder', () => {
    expect(isInside(dir, join(dir, 'x', 'y'))).toBe(true);
    expect(isInside(dir, `${dir}-evil/x`)).toBe(false);
  });

  it('names commission folders by date and time', () => {
    const d = commissionDir('/work', 'ledger', new Date(2026, 9, 21, 10, 30, 5));
    expect(d).toBe(join('/work', '2026-10-21-103005-ledger'));
  });
});

