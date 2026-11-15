import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_START_USD, MONTH_CAP_DEFAULT, Reservations, startingMonthCap, warnings } from '../app/main/budget';
import { MemoryStore } from '../app/main/memory';
import { SettingsStore } from '../app/main/settings';
import { SpendLedger } from '../app/main/spend';
import { MONTH_CAP_CHOICES, PROJECT_CAP_CHOICES } from '../app/shared/types';

const dir = () => mkdtempSync(join(tmpdir(), 'lamplight-budget-'));
const caps = (roundUsd: number, monthUsd: number, projectUsd?: number) => ({ roundUsd, monthUsd, projectUsd });
const nothing = { month: 0, project: 0 };

describe('reserving at the start of a round', () => {
  it('gives the round the least of the round cap, what is left this month and what is left of the project', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(3, 20, 50), { month: 5, project: 10 })).toEqual({ usd: 3, by: 'round' });
    expect(r.reserve('r2', 'p2', caps(3, 30), { month: 25, project: 0 })).toEqual({ usd: 2, by: 'month' });
    expect(r.reserve('r3', 'p3', caps(10, 0, 20), { month: 400, project: 12.5 })).toEqual({ usd: 7.5, by: 'project' });
  });

  it('holds what it gave until the round is settled, then gives it back', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(3, 20), { month: 10, project: 0 })).toEqual({ usd: 3, by: 'round' });
    expect(r.held()).toBe(3);
    r.settle('r1');
    expect(r.held()).toBe(0);
    // What the round really cost is in the ledger by now; the next round counts from that.
    expect(r.reserve('r2', 'p1', caps(3, 20), { month: 18.2, project: 0 })).toEqual({ usd: 1.8, by: 'month' });
  });

  it('a project with a cap is held to what is left of it', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(3, 20, 5), { month: 4, project: 3.5 })).toEqual({ usd: 1.5, by: 'project' });
  });

  it('two rounds at once: the second only gets what the first did not hold', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(3, 10, 20), { month: 5, project: 0 })).toEqual({ usd: 3, by: 'round' });
    expect(r.reserve('r2', 'p2', caps(3, 10), { month: 5, project: 0 })).toEqual({ usd: 2, by: 'month' });
    expect(r.held()).toBe(5);
    // Nothing left this month for a third.
    expect(r.reserve('r3', 'p3', caps(3, 10), { month: 5, project: 0 })).toEqual({ refused: { cap: 'month', capUsd: 10, spentUsd: 5, leftUsd: 0 } });
  });

  it('only rounds of the same project count against its cap', () => {
    const r = new Reservations();
    r.reserve('r1', 'p1', caps(3, 0, 5), { month: 0, project: 0 });
    expect(r.reserve('r2', 'p2', caps(3, 0, 5), nothing)).toEqual({ usd: 3, by: 'round' });
    expect(r.reserve('r3', 'p1', caps(3, 0, 5), nothing)).toEqual({ usd: 2, by: 'project' });
    expect(r.held('p1')).toBe(5);
  });

  it('with no cap at all the round has no limit, and holds nothing anyone can count on', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(0, 0), { month: 400, project: 300 })).toEqual({ usd: undefined, by: null });
  });

  it('does not start with less than fifty cents left, and says which cap it is', () => {
    const r = new Reservations();
    expect(MIN_START_USD).toBe(0.5);
    expect(r.reserve('r1', 'p1', caps(3, 20), { month: 19.6, project: 0 })).toEqual({ refused: { cap: 'month', capUsd: 20, spentUsd: 19.6, leftUsd: expect.closeTo(0.4) } });
    expect(r.reserve('r2', 'p1', caps(3, 20, 10), { month: 5, project: 9.7 })).toEqual({ refused: { cap: 'project', capUsd: 10, spentUsd: 9.7, leftUsd: expect.closeTo(0.3) } });
    // Over the cap (Claude Code stops a little past it): nothing left, not less than nothing.
    expect(r.reserve('r3', 'p1', caps(3, 20), { month: 20.3, project: 0 })).toEqual({ refused: { cap: 'month', capUsd: 20, spentUsd: 20.3, leftUsd: 0 } });
    expect(r.held()).toBe(0);
    // Exactly fifty cents is enough to start.
    expect(r.reserve('r4', 'p1', caps(3, 20), { month: 19.5, project: 0 })).toEqual({ usd: 0.5, by: 'month' });
  });

  it('when both caps are short, names the one with less left', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(3, 20, 10), { month: 19.8, project: 9.6 })).toMatchObject({ refused: { cap: 'month' } });
    expect(r.reserve('r1', 'p1', caps(3, 20, 10), { month: 19.6, project: 9.8 })).toMatchObject({ refused: { cap: 'project' } });
  });

  it('gives whole cents, rounded down', () => {
    const r = new Reservations();
    expect(r.reserve('r1', 'p1', caps(3, 20), { month: 18.4567, project: 0 })).toEqual({ usd: 1.54, by: 'month' });
  });
});

describe('a new month', () => {
  it('starts afresh at local midnight', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 19.8, new Date(2026, 10, 30, 23, 59));
    const r = new Reservations();
    expect(r.reserve('r1', undefined, caps(3, 20), { month: ledger.thisMonth(new Date(2026, 10, 30, 23, 59, 30)), project: 0 })).toMatchObject({ refused: { cap: 'month' } });
    expect(r.reserve('r2', undefined, caps(3, 20), { month: ledger.thisMonth(new Date(2026, 11, 1, 0, 0, 1)), project: 0 })).toEqual({ usd: 3, by: 'round' });
  });

  it('is warned about afresh', () => {
    expect(warnings(caps(3, 20), { month: 17, project: 0 }, ['2026-11'], '2026-12')).toEqual([{ cap: 'month', key: '2026-12', capUsd: 20, spentUsd: 17, leftUsd: 3 }]);
  });
});

describe('warning before a cap is reached', () => {
  it('says so once the month passes eight tenths of its cap', () => {
    expect(warnings(caps(3, 20), { month: 15.9, project: 0 }, [], '2026-11')).toEqual([]);
    expect(warnings(caps(3, 20), { month: 16, project: 0 }, [], '2026-11')).toEqual([{ cap: 'month', key: '2026-11', capUsd: 20, spentUsd: 16, leftUsd: 4 }]);
  });

  it('only once a month', () => {
    expect(warnings(caps(3, 20), { month: 18, project: 0 }, ['2026-11'], '2026-11')).toEqual([]);
  });

  it('once for each project, apart from the month', () => {
    expect(warnings(caps(3, 20, 10), { month: 16.5, project: 8.5 }, [], '2026-11', 'p1')).toEqual([
      { cap: 'month', key: '2026-11', capUsd: 20, spentUsd: 16.5, leftUsd: 3.5 },
      { cap: 'project', key: 'p1', capUsd: 10, spentUsd: 8.5, leftUsd: 1.5 },
    ]);
    expect(warnings(caps(3, 20, 10), { month: 16.5, project: 8.5 }, ['2026-11'], '2026-11', 'p1')).toEqual([{ cap: 'project', key: 'p1', capUsd: 10, spentUsd: 8.5, leftUsd: 1.5 }]);
    expect(warnings(caps(3, 20, 10), { month: 1, project: 9 }, ['p1'], '2026-11', 'p1')).toEqual([]);
  });

  it('nothing to warn about without a cap; past the cap there is nothing left', () => {
    expect(warnings(caps(3, 0), { month: 400, project: 400 }, [], '2026-11', 'p1')).toEqual([]);
    expect(warnings(caps(3, 20), { month: 20.4, project: 0 }, [], '2026-11')).toEqual([{ cap: 'month', key: '2026-11', capUsd: 20, spentUsd: 20.4, leftUsd: 0 }]);
  });

  it('what was said is kept in the notebook', () => {
    const file = join(dir(), 'memory.json');
    const m = new MemoryStore(file);
    m.budgetSaid(['2026-11', 'p1']);
    m.budgetSaid(['p1']);
    expect(new MemoryStore(file).get().budgetSaid).toEqual(['2026-11', 'p1']);
  });
});

describe('a project cap', () => {
  it('is set on the project, kept, and only one of the choices', () => {
    expect(PROJECT_CAP_CHOICES).toEqual([0, 5, 10, 20, 50]);
    const file = join(dir(), 'memory.json');
    const m = new MemoryStore(file);
    const c = m.remember({ title: 'Page', choices: {}, result: 'done', folder: 'C:/w/page' }, []);
    expect(m.setProjectCap(c.project!, 10)).toBe(true);
    expect(new MemoryStore(file).get().projects[0].capUsd).toBe(10);
    expect(m.setProjectCap(c.project!, 7)).toBe(false);
    expect(m.setProjectCap('p0', 10)).toBe(false);
    // No limit is the same as never having set one.
    expect(m.setProjectCap(c.project!, 0)).toBe(true);
    expect(new MemoryStore(file).get().projects[0]).not.toHaveProperty('capUsd');
  });
});

describe('the monthly cap for someone upgrading', () => {
  const now = new Date(2026, 10, 15);
  it('is the default unless a recent month went over it', () => {
    expect(MONTH_CAP_DEFAULT).toBe(20);
    expect(startingMonthCap([], now)).toBe(20);
    expect(startingMonthCap([{ month: '2026-10', usd: 20 }, { month: '2026-09', usd: 12 }], now)).toBe(20);
  });

  it('goes one step up when one of the last three months, or this one, cost more', () => {
    expect(startingMonthCap([{ month: '2026-08', usd: 20.01 }], now)).toBe(50);
    expect(startingMonthCap([{ month: '2026-11', usd: 25 }], now)).toBe(50);
    // One step, however much it was.
    expect(startingMonthCap([{ month: '2026-10', usd: 400 }], now)).toBe(50);
  });

  it('a month longer ago does not count', () => {
    expect(startingMonthCap([{ month: '2026-07', usd: 90 }], now)).toBe(20);
    expect(startingMonthCap([{ month: '2025-11', usd: 90 }], now)).toBe(20);
  });
});

describe('the monthly cap in settings', () => {
  const fresh = () => join(dir(), 'settings.json');

  it('offers 10, 20, 50, 100 or none, and starts at 20', () => {
    expect(MONTH_CAP_CHOICES).toEqual([10, 20, 50, 100, 0]);
    expect(new SettingsStore(fresh(), '/docs').get().monthCapUsd).toBe(20);
  });

  it('saves a choice and refuses anything else', () => {
    const file = fresh();
    expect(new SettingsStore(file, '/docs').update({ monthCapUsd: 50 }).monthCapUsd).toBe(50);
    expect(new SettingsStore(file, '/docs').update({ monthCapUsd: 30 }).monthCapUsd).toBe(50);
    expect(new SettingsStore(file, '/docs').update({ monthCapUsd: 0 }).monthCapUsd).toBe(0);
    expect(new SettingsStore(file, '/docs').get().monthCapUsd).toBe(0);
  });

  it('settings from before it get the cap their spending calls for, decided once and kept', () => {
    const file = fresh();
    writeFileSync(file, JSON.stringify({ name: 'Lin', onboarded: true, budgetUsd: 5 }));
    const s = new SettingsStore(file, '/docs', () => 50);
    expect(s.get().monthCapUsd).toBe(50);
    expect(s.raisedMonthCap).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).monthCapUsd).toBe(50);
    const again = new SettingsStore(file, '/docs', () => 100);
    expect(again.get().monthCapUsd).toBe(50);
    expect(again.raisedMonthCap).toBe(false);
  });

  it('settings from before it that stay at the default are not raised', () => {
    const file = fresh();
    writeFileSync(file, JSON.stringify({ name: 'Lin', onboarded: true }));
    const s = new SettingsStore(file, '/docs', () => 20);
    expect(s.get().monthCapUsd).toBe(20);
    expect(s.raisedMonthCap).toBe(false);
  });

  it('a broken value in the file is decided again', () => {
    const file = fresh();
    writeFileSync(file, JSON.stringify({ monthCapUsd: 'lots' }));
    expect(new SettingsStore(file, '/docs', () => 50).get().monthCapUsd).toBe(50);
  });
});
