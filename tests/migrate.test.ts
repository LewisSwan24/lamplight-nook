import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, migrate } from '../app/main/migrate';
import { MemoryStore } from '../app/main/memory';
import { PendingStore } from '../app/main/pending';
import { SettingsStore } from '../app/main/settings';
import { grownBy } from '../app/shared/growth';
import type { Memory } from '../app/shared/types';

const FIXTURES = join(__dirname, 'fixtures', 'userdata');
const NOW = new Date('2026-11-04T09:00:00Z');

/**
 * A home with one version's real data folder in it (tests/fixtures/userdata/<version>, captured by
 * tools/sim/legacy.mjs), and the commission folders it points at. Folders are created with an index.html
 * unless they are listed in `missing`.
 */
function homeFrom(version: string, missing: string[] = []) {
  const home = mkdtempSync(join(tmpdir(), 'lamplight-upgrade-'));
  const data = join(home, 'data');
  mkdirSync(data);
  for (const f of readdirSync(join(FIXTURES, version))) {
    writeFileSync(join(data, f), readFileSync(join(FIXTURES, version, f), 'utf8').split('{HOME}').join(home));
  }
  const memory = JSON.parse(readFileSync(join(data, 'memory.json'), 'utf8')) as Memory;
  for (const c of memory.commissions) {
    if (missing.includes(c.id)) continue;
    mkdirSync(c.folder, { recursive: true });
    writeFileSync(join(c.folder, 'check.js'), '// not the work');
    writeFileSync(join(c.folder, 'index.html'), '<!doctype html>');
  }
  return { home, data, memory };
}

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

describe('upgrading the data folder', () => {
  for (const version of ['0.5.0', '0.6.1']) {
    it(`counts the work finished with ${version} and keeps every notebook entry`, () => {
      const { data, memory } = homeFrom(version);
      const finished = memory.commissions.filter((c) => c.result === 'done').length;
      expect(memory.shop).toBeUndefined();

      const r = migrate(data, NOW);
      expect(r).toMatchObject({ from: 1, to: DATA_VERSION });

      const after = new MemoryStore(join(data, 'memory.json'));
      const shop = after.shopState();
      expect(shop.done).toBe(finished);
      expect(shop.grown.map((g) => g.id)).toEqual(grownBy(finished));
      expect(shop.grown.every((g) => g.date === '2026-11-04')).toBe(true);
      expect(after.get().commissions.map((c) => c.id)).toEqual(memory.commissions.map((c) => c.id));
      expect(shop.works.every((w) => w.hasMain)).toBe(true);
    });
  }

  it('raises a 0.7.0 count that started from zero, keeping what the shop already gathered', () => {
    const { data, memory } = homeFrom('0.7.0');
    const finished = memory.commissions.filter((c) => c.result === 'done').length;
    expect(memory.shop!.done).toBeLessThan(finished);
    const first = memory.shop!.grown[0];

    migrate(data, NOW);
    const shop = new MemoryStore(join(data, 'memory.json')).shopState();
    expect(shop.done).toBe(finished);
    expect(shop.grown[0]).toEqual(first);
    expect(new Set(shop.grown.map((g) => g.id))).toEqual(new Set(grownBy(finished)));
  });

  it('never lowers a count that is already ahead of the notebook', () => {
    const { data } = homeFrom('0.7.0');
    const file = join(data, 'memory.json');
    const m = read<Memory>(file);
    m.shop = { done: 25, grown: [], told: ['radio'] };
    writeFileSync(file, JSON.stringify(m));
    migrate(data, NOW);
    expect(read<Memory>(file).shop).toEqual({ done: 25, grown: [], told: ['radio'] });
  });

  it('finds the main piece of work for old entries, and leaves entries whose folder is gone', () => {
    const { data, memory } = homeFrom('0.6.1');
    const [page, gone, research] = memory.commissions;
    // The research commission wrote a summary, not a page; another folder was deleted by the user.
    rmSync(join(research.folder, 'index.html'));
    writeFileSync(join(research.folder, 'summary.md'), '# notes');
    rmSync(gone.folder, { recursive: true });

    migrate(data, NOW);
    const after = read<Memory>(join(data, 'memory.json')).commissions;
    expect(after.find((c) => c.id === page.id)!.main).toBe('index.html');
    expect(after.find((c) => c.id === research.id)!.main).toBe('summary.md');
    expect(after.find((c) => c.id === gone.id)!.main).toBeUndefined();
  });

  it('keeps a copy of every data file as it was, and leaves settings, spending and the unfinished job alone', () => {
    const { data } = homeFrom('0.7.0');
    const before = Object.fromEntries(['settings.json', 'memory.json', 'spend.json', 'pending.json'].map((f) => [f, readFileSync(join(data, f), 'utf8')]));

    const r = migrate(data, NOW);
    expect(r.backup).toBe(join(data, 'backup', '2026-11-04-v1'));
    for (const [f, text] of Object.entries(before)) expect(readFileSync(join(r.backup!, f), 'utf8')).toBe(text);
    for (const f of ['settings.json', 'spend.json', 'pending.json']) expect(readFileSync(join(data, f), 'utf8')).toBe(before[f]);

    const settings = new SettingsStore(join(data, 'settings.json'), join(data, 'docs')).get();
    expect(settings).toMatchObject({ name: '小林', budgetUsd: 5, language: 'zh-CN', onboarded: true });
    const job = new PendingStore(join(data, 'pending.json')).load();
    expect(job?.form.template).toBe('research');
    expect(job?.sessionId).toBeTruthy();
  });

  it('runs once: a second start changes nothing and makes no second copy', () => {
    const { data } = homeFrom('0.5.0');
    migrate(data, NOW);
    const memory = readFileSync(join(data, 'memory.json'), 'utf8');
    const r = migrate(data, new Date('2026-11-05T09:00:00Z'));
    expect(r).toEqual({ from: DATA_VERSION, to: DATA_VERSION, changes: [] });
    expect(readFileSync(join(data, 'memory.json'), 'utf8')).toBe(memory);
    expect(readdirSync(join(data, 'backup'))).toEqual(['2026-11-04-v1']);
  });

  it('only marks a first start, without a backup', () => {
    const data = join(mkdtempSync(join(tmpdir(), 'lamplight-first-')), 'data');
    const r = migrate(data, NOW);
    expect(r).toEqual({ from: 1, to: DATA_VERSION, backup: undefined, changes: [] });
    expect(read(join(data, 'data-version.json'))).toEqual({ data: DATA_VERSION });
    expect(existsSync(join(data, 'backup'))).toBe(false);
  });

  it('leaves a broken notebook as it is instead of failing to start', () => {
    const data = mkdtempSync(join(tmpdir(), 'lamplight-broken-'));
    writeFileSync(join(data, 'memory.json'), '{ not json');
    const r = migrate(data, NOW);
    expect(r.to).toBe(DATA_VERSION);
    expect(readFileSync(join(data, 'memory.json'), 'utf8')).toBe('{ not json');
  });

  it('gives English titles from before 0.8.1 their spaces back, and moves their stuck notes along', () => {
    const data = mkdtempSync(join(tmpdir(), 'lamplight-titles-'));
    const memory = {
      commissions: [
        { id: 'c1', title: 'Make-me-a-small-', date: '2026-10-30', result: 'done', choices: {}, folder: '/gone/1' },
        { id: 'c2', title: 'Write-a-letter-t', date: '2026-11-01', result: 'done', choices: {}, folder: '/gone/2',
          form: { want: 'Write a letter to my landlord about moving out at the end of next month.', template: 'letter' } },
        { id: 'c3', title: '做一个番茄钟小网页', date: '2026-11-01', result: 'done', choices: {}, folder: '/gone/3' },
        { id: 'c4', title: 'expense tracker', date: '2026-11-01', result: 'done', choices: {}, folder: '/gone/4' },
      ],
      stuckNotes: [{ commission: 'Make-me-a-small-', note: 'node check.js', date: '2026-10-30' }],
    };
    writeFileSync(join(data, 'memory.json'), JSON.stringify(memory));
    migrate(data, NOW);
    const after = read<Memory>(join(data, 'memory.json'));
    expect(after.commissions.map((c) => c.title)).toEqual(['Make me a small', 'Write a letter to my landlord about moving out', '做一个番茄钟小网页', 'expense tracker']);
    expect(after.stuckNotes[0].commission).toBe('Make me a small');
  });

  it('forgets the copy kept aside too when the notebook is cleared', () => {
    const { data } = homeFrom('0.5.0');
    const r = migrate(data, NOW);
    expect(existsSync(join(r.backup!, 'memory.json'))).toBe(true);
    new MemoryStore(join(data, 'memory.json')).clear();
    expect(existsSync(join(data, 'memory.json'))).toBe(false);
    expect(existsSync(join(r.backup!, 'memory.json'))).toBe(false);
    expect(existsSync(join(r.backup!, 'settings.json'))).toBe(true);
  });
});
