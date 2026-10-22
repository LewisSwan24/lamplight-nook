/** A commission counts as long after this; then Adeng says how it is going now and then (plan M3.5). */
export const LONG_TASK_MS = 20 * 60_000;
/** At most one progress line this often. */
export const PROGRESS_GAP_MS = 10 * 60_000;

/** Is it time for a progress line? lastSaidAt: when Adeng last said one in this commission. */
export function progressDue(startedAt: number, lastSaidAt: number | undefined, now: number): boolean {
  if (now - startedAt < LONG_TASK_MS) return false;
  return lastSaidAt === undefined || now - lastSaidAt >= PROGRESS_GAP_MS;
}
