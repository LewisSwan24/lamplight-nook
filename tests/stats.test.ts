import { describe, expect, it } from 'vitest';
import { monthStats } from '../app/shared/stats';
import type { CommissionMemo, Memory, RoundStat } from '../app/shared/types';

const round = (date: string, seconds: number, extra: Partial<RoundStat> = {}): RoundStat => ({ date, seconds, helpers: {}, waits: 0, waitedSeconds: 0, ...extra });
const work = (id: string, rounds?: RoundStat[]): CommissionMemo => ({ id, title: id, date: '2026-11-01', result: 'done', choices: {}, folder: `/w/${id}`, rounds });
const memory = (...commissions: CommissionMemo[]): Memory => ({ commissions, stuckNotes: [], projects: [] });

describe("the shop's ledger page for a month", () => {
  it('counts works and rounds in that month only, with the average time', () => {
    const m = memory(
      work('a', [round('2026-10-30', 100), round('2026-11-02', 60)]),
      work('b', [round('2026-11-05', 120), round('2026-11-06', 30)]),
      work('c', [round('2026-10-01', 500)]),
    );
    const s = monthStats(m, '2026-11');
    expect(s.works).toBe(2);
    expect(s.rounds).toBe(3);
    expect(s.averageSeconds).toBe(70);
  });

  it('lists why rounds did not finish, most common first, and sums the waiting', () => {
    const m = memory(work('a', [
      round('2026-11-02', 10, { failure: 'net' }),
      round('2026-11-03', 10, { failure: 'budget' }),
      round('2026-11-04', 10, { failure: 'net', waits: 2, waitedSeconds: 40 }),
      round('2026-11-05', 10, { waits: 1, waitedSeconds: 5 }),
    ]));
    const s = monthStats(m, '2026-11');
    expect(s.failures).toEqual([{ kind: 'net', n: 2 }, { kind: 'budget', n: 1 }]);
    expect(s.waits).toBe(3);
    expect(s.waitedSeconds).toBe(45);
  });

  it('says since when anything was kept, and nothing for works from before', () => {
    const s = monthStats(memory(work('old'), work('a', [round('2026-11-14', 10)]), work('b', [round('2026-11-20', 10)])), '2026-11');
    expect(s.since).toBe('2026-11-14');
    expect(monthStats(memory(work('old')), '2026-11')).toEqual({ works: 0, rounds: 0, averageSeconds: 0, failures: [], waits: 0, waitedSeconds: 0, since: undefined });
  });
});
