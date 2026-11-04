import type { BoardStep } from './board';
import { fill, type LOCALES } from './i18n';
import { formatUsd } from './money';

/** The running card's words, in whichever language the shop is in. */
type Run = (typeof LOCALES)['en']['ui']['run'];

/** How long the work has taken, in whole minutes. */
export function elapsedLine(startedAt: number, now: number, R: Run): string {
  const minutes = Math.floor((now - startedAt) / 60_000);
  if (minutes < 1) return R.progressJustStarted;
  if (minutes < 60) return fill(R.progressMinutes, { n: minutes });
  return fill(R.progressHours, { h: Math.floor(minutes / 60), m: minutes % 60 });
}

/** The limit on this round, or null when there is none. */
export function capLine(budgetUsd: number, R: Run): string | null {
  return budgetUsd > 0 ? fill(R.progressCap, { cap: formatUsd(budgetUsd) }) : null;
}

/** The heading over the steps. Only a plan the staff made themselves is counted: a guess has no real total. */
export function planLine(steps: BoardStep[], real: boolean, R: Run): string {
  if (!steps.length) return R.progressNoPlan;
  if (!real) return R.progressGuess;
  return fill(R.progressPlanCount, { done: steps.filter((s) => s.status === 'done').length, total: steps.length });
}
