/** Rounds under way at once at most (road-to-1.2.md Q-B2). */
export const MAX_RUNS = 2;

/** Why a round is still in the queue: no free place, its project is at work, or not enough money left under a cap. */
export type Wait = 'slot' | 'project' | 'money';

/**
 * A round waiting for its turn. `folder` is where it will work (absent for a new commission, whose folder is made when it
 * starts, so it is never the same work as anything); `by` says who asked for it, the user or a schedule (B6).
 */
export type Ticket = { id: string; folder?: string; project?: string; by: 'user' | 'schedule'; waits?: Wait };

/** A round under way. One stopped by its budget or the network holds no place (rule 4); one waiting for an answer does. */
export type Active = { id: string; folder: string; project?: string; stopped?: boolean };

let lastId = 0;
/** A round's run id, r and the time, one more than the last when two come in the same millisecond. */
export function runId(now: number): string {
  lastId = Math.max(now, lastId + 1);
  return `r${lastId}`;
}

/**
 * The rounds waiting to start (road-to-1.2.md B5). Five rules: one round per project at a time, overlapping lent
 * folders counting as one; first come first served, what the user started before scheduled work; a waiting round can be
 * called off for nothing; a stopped round holds no place; short of money a round stays in the queue, marked so.
 */
export class RunQueue<T extends Ticket = Ticket> {
  private line: T[] = [];

  get queued(): readonly T[] {
    return this.line;
  }

  /** In line: after the other rounds the user started, ahead of any scheduled ones (rule 2). */
  add(t: T) {
    const at = t.by === 'user' ? this.line.findIndex((x) => x.by === 'schedule') : -1;
    if (at < 0) this.line.push(t);
    else this.line.splice(at, 0, t);
  }

  /** Called off while waiting: nothing was held or spent for it yet (rule 3). */
  cancel(id: string): T | undefined {
    const i = this.line.findIndex((t) => t.id === id);
    return i < 0 ? undefined : this.line.splice(i, 1)[0];
  }

  /**
   * The rounds that may start now, in order, taken out of the queue; the rest are marked with why they wait. `same` says
   * whether two folders are the same work; `afford` holds the money for a round about to start, or says there is not
   * enough, and is asked again each time the queue moves.
   */
  take(active: Active[], same: (a: string, b: string) => boolean, afford: (t: T) => boolean): T[] {
    const busy = active.filter((a) => !a.stopped);
    const started: T[] = [];
    const ahead: T[] = [];
    for (const t of this.line) {
      const sameWork = (other: { folder?: string }) => Boolean(t.folder && other.folder && same(t.folder, other.folder));
      if (busy.some(sameWork) || started.some(sameWork) || ahead.some(sameWork)) t.waits = 'project';
      else if (busy.length + started.length >= MAX_RUNS) t.waits = 'slot';
      else if (!afford(t)) t.waits = 'money';
      else {
        delete t.waits;
        started.push(t);
        continue;
      }
      ahead.push(t);
    }
    this.line = ahead;
    return started;
  }
}
