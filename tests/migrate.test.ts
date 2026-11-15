import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, migrate } from '../app/main/migrate';
import { MemoryStore } from '../app/main/memory';
import { projectSettled } from '../app/main/projects';
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
    writeFileSync(join(data, f), readFileSync(join(FIXTURES, version, f), 'utf8').split('{HOME}').join(JSON.stringify(home).slice(1, -1)));
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

describe('neighbours from before the shop kept count', () => {
  const at = (memory: unknown) => {
    const data = mkdtempSync(join(tmpdir(), 'lamplight-met-'));
    writeFileSync(join(data, 'data-version.json'), JSON.stringify({ data: 2 }));
    writeFileSync(join(data, 'memory.json'), JSON.stringify(memory));
    migrate(data, NOW);
    return JSON.parse(readFileSync(join(data, 'memory.json'), 'utf8')) as Memory;
  };

  it('counts them all as already known in a shop that was open before, so none is met for the first time on upgrade day', () => {
    const { shop } = at({ commissions: [], stuckNotes: [], shop: { done: 3, grown: [], told: [] } });
    expect(shop?.met?.map((m) => m.id).sort()).toEqual(['baker', 'granny', 'mechanic', 'postman', 'student']);
    expect(shop?.met?.every((m) => m.date === '')).toBe(true);
  });

  it('leaves a shop that has no history alone', () => {
    expect(at({ commissions: [], stuckNotes: [] }).shop).toBeUndefined();
  });
});

describe('every work becomes a project (1.2)', () => {
  const stat = (date: string, seconds: number, failure?: string) => ({ date, seconds, ...(failure ? { failure } : {}), helpers: {}, waits: 0, waitedSeconds: 0 });
  /** A 1.1 shop: a plain work, one changed three times, one that stopped, one in a lent folder, and one from 1.0 changed twice. */
  const shop11 = () => ({
    commissions: [
      { id: 'c1001', title: '签到页', date: '2026-11-02', result: 'done', choices: { '颜色？': '薄荷' }, folder: 'C:/works/a', main: 'index.html', summary: '做好了签到页', sessionId: 's1', rounds: [stat('2026-11-02', 80)] },
      { id: 'c1003', title: '记账表', date: '2026-11-03', result: 'failed', choices: {}, folder: 'C:/works/c', rounds: [stat('2026-11-03', 40, 'network')] },
      { id: 'c1004', title: 'Tidy my notes', date: '2026-11-04', result: 'done', choices: {}, folder: 'C:/mine', form: { want: 'tidy', inPlace: 'C:/mine' }, touched: ['a.md'], rounds: [stat('2026-11-04', 30)] },
      { id: 'c1000', title: '旧作品', date: '2026-11-05', result: 'done', choices: {}, folder: 'C:/works/old', asks: [{ ask: '大一点', date: '2026-10-01' }, { ask: '再亮一点', date: '2026-11-05' }], rounds: [stat('2026-11-05', 25)] },
      { id: 'c1002', title: '旅行攻略', date: '2026-11-06', result: 'done', choices: {}, folder: 'C:/works/b', summary: '第三轮改好了',
        asks: [{ ask: '加一天', date: '2026-11-04' }, { ask: '换个颜色', date: '2026-11-05' }, { ask: '加地图', date: '2026-11-06' }],
        rounds: [stat('2026-11-03', 100), stat('2026-11-04', 50), stat('2026-11-05', 20, 'budget'), stat('2026-11-06', 35)] },
    ],
    stuckNotes: [], shop: { done: 4, grown: [], told: [], met: [] }, greeted: 'c1002',
  });
  const at = () => {
    const data = mkdtempSync(join(tmpdir(), 'lamplight-projects-'));
    writeFileSync(join(data, 'data-version.json'), JSON.stringify({ data: 3 }));
    writeFileSync(join(data, 'memory.json'), JSON.stringify(shop11(), null, 2));
    writeFileSync(join(data, 'memory.last-good.json'), JSON.stringify(shop11(), null, 2));
    return data;
  };

  it('turns each into a project of one, keeping every commission as it was', () => {
    const data = at();
    const r = migrate(data, NOW);
    expect(r).toMatchObject({ from: 3, to: 4, backup: join(data, 'backup', '2026-11-04-v3') });
    expect(read(join(r.backup!, 'memory.json'))).toEqual(shop11());
    const after = read<Memory>(join(data, 'memory.json'));
    expect(after.projects.map((p) => [p.id, p.title, p.folder, p.commissions])).toEqual([
      ['p1001', '签到页', 'C:/works/a', ['c1001']], ['p1003', '记账表', 'C:/works/c', ['c1003']], ['p1004', 'Tidy my notes', 'C:/mine', ['c1004']],
      ['p1000', '旧作品', 'C:/works/old', ['c1000']], ['p1002', '旅行攻略', 'C:/works/b', ['c1002']],
    ]);
    expect(after.commissions.map(({ project, ...c }) => c)).toEqual(shop11().commissions);
    expect(after.commissions.map((c) => c.project)).toEqual(['p1001', 'p1003', 'p1004', 'p1000', 'p1002']);
    expect(after).toMatchObject({ stuckNotes: [], shop: shop11().shop, greeted: 'c1002' });
    // The spare copy goes the same way, so taking its place later brings no older notebook back.
    expect(read(join(data, 'memory.last-good.json'))).toEqual(after);
  });

  it('builds the timeline from the first round and every change, with how long each took', () => {
    const data = at();
    migrate(data, NOW);
    const p = (id: string) => read<Memory>(join(data, 'memory.json')).projects.find((x) => x.id === id)!;
    expect(p('p1001')).toEqual({ id: 'p1001', title: '签到页', folder: 'C:/works/a', created: '2026-11-02', commissions: ['c1001'], rounds: [{ n: 1, commission: 'c1001', date: '2026-11-02', summary: '做好了签到页', seconds: 80 }] });
    expect(p('p1002').created).toBe('2026-11-03');
    expect(p('p1002').rounds).toEqual([
      { n: 1, commission: 'c1002', date: '2026-11-03', seconds: 100 },
      { n: 2, commission: 'c1002', date: '2026-11-04', ask: '加一天', seconds: 50 },
      { n: 3, commission: 'c1002', date: '2026-11-05', ask: '换个颜色', seconds: 20, failure: 'budget' },
      { n: 4, commission: 'c1002', date: '2026-11-06', ask: '加地图', seconds: 35, summary: '第三轮改好了' },
    ]);
    // Changed under 1.0, then once more under 1.1: only that last round was timed.
    expect(p('p1000').rounds).toEqual([
      { n: 1, commission: 'c1000', date: '2026-10-01' },
      { n: 2, commission: 'c1000', date: '2026-10-01', ask: '大一点' },
      { n: 3, commission: 'c1000', date: '2026-11-05', ask: '再亮一点', seconds: 25 },
    ]);
    expect(p('p1000').rounds.some((r) => 'usd' in r)).toBe(false);
  });

  it('keeps a work that stopped as a stopped project, and a lent folder as lent', () => {
    const data = at();
    migrate(data, NOW);
    const { projects, commissions } = read<Memory>(join(data, 'memory.json'));
    const stopped = projects.find((x) => x.id === 'p1003')!;
    expect(stopped.rounds).toEqual([{ n: 1, commission: 'c1003', date: '2026-11-03', seconds: 40, failure: 'network' }]);
    expect(projectSettled(stopped, commissions)).toBe('stopped');
    expect(projects.find((x) => x.id === 'p1004')!.lent).toBe(true);
    expect(projects.filter((x) => x.lent).map((x) => x.id)).toEqual(['p1004']);
  });

  it('changes nothing the second time', () => {
    const data = at();
    migrate(data, NOW);
    const once = readFileSync(join(data, 'memory.json'), 'utf8');
    expect(migrate(data, NOW)).toEqual({ from: 4, to: 4, changes: [] });
    // Even with the version marker lost, running the step again finds nothing to do.
    writeFileSync(join(data, 'data-version.json'), JSON.stringify({ data: 3 }));
    expect(migrate(data, NOW).changes).toEqual([]);
    expect(readFileSync(join(data, 'memory.json'), 'utf8')).toBe(once);
  });

  it('gives every commission of the oldest shops a project', () => {
    for (const version of ['0.5.0', '0.6.1', '0.7.0']) {
      const { data, memory } = homeFrom(version);
      migrate(data, NOW);
      const after = new MemoryStore(join(data, 'memory.json')).get();
      expect(after.projects.map((p) => p.commissions)).toEqual(memory.commissions.map((c) => [c.id]));
      expect(after.commissions.every((c) => after.projects.some((p) => p.id === c.project))).toBe(true);
    }
  });
});

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
    expect(read<Memory>(file).shop).toMatchObject({ done: 25, grown: [], told: ['radio'] });
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
    const [job] = new PendingStore(join(data, 'pending.json')).load();
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
    expect(after.commissions.map((c) => c.title)).toEqual(['Make me a small', 'Write a letter to my landlord about moving out…', '做一个番茄钟小网页', 'expense tracker']);
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
