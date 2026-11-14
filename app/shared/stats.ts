import type { Memory } from './types';

export type MonthStats = {
  /** Works with at least one round this month. */
  works: number;
  rounds: number;
  averageSeconds: number;
  /** Why rounds did not finish, most common first. */
  failures: { kind: string; n: number }[];
  waits: number;
  waitedSeconds: number;
  /** The first day anything was kept; works from before 1.1 have nothing. */
  since?: string;
};

/** The notebook's ledger page for one month (YYYY-MM), from the rounds kept on each work. */
export function monthStats(memory: Memory, month: string): MonthStats {
  const all = memory.commissions.flatMap((c) => (c.rounds ?? []).map((r) => ({ id: c.id, r })));
  const here = all.filter(({ r }) => r.date.startsWith(`${month}-`));
  const failures = new Map<string, number>();
  for (const { r } of here) if (r.failure) failures.set(r.failure, (failures.get(r.failure) ?? 0) + 1);
  const total = here.reduce((s, { r }) => s + r.seconds, 0);
  return {
    works: new Set(here.map(({ id }) => id)).size,
    rounds: here.length,
    averageSeconds: here.length ? Math.round(total / here.length) : 0,
    failures: [...failures].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n),
    waits: here.reduce((s, { r }) => s + r.waits, 0),
    waitedSeconds: here.reduce((s, { r }) => s + r.waitedSeconds, 0),
    since: all.map(({ r }) => r.date).sort()[0],
  };
}
