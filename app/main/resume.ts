import type { Job } from './pending';

/** A network failure up to this long after waking still came from the sleep: the connection it used died with it. */
export const AFTER_WAKE_MS = 2 * 60_000;
/** After waking, how long to wait for the network before giving up and showing the usual failure card. */
export const NETWORK_WAIT_MS = 10 * 60_000;

/** When the computer last went to sleep and woke up (road-to-1.2.md B7), from powerMonitor's suspend and resume. */
export class Sleep {
  sleptAt?: number;
  wokeAt?: number;

  suspend(at: number) {
    this.sleptAt = at;
    this.wokeAt = undefined;
  }

  resume(at: number) {
    this.wokeAt = at;
  }

  /** A failure at `at` happened while asleep, or soon after waking. */
  around(at: number): boolean {
    if (this.sleptAt === undefined || at < this.sleptAt) return false;
    return this.wokeAt === undefined || at <= this.wokeAt + AFTER_WAKE_MS;
  }
}

/** A round that failed for the network around a sleep is carried on by itself once the network is back: once, never again. */
export function resumeOnWake(job: Job, error: string | undefined, sleep: Sleep, at: number): boolean {
  return error === 'net' && !job.autoResumed && sleep.around(at);
}
