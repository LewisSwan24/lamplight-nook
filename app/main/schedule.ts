import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Schedule, ScheduleEvery } from '../shared/types';

/** The timer in the main process wakes this often at most, and at each due time in between (road-to-1.2.md B6). */
export const TICK_MS = 3600_000;
/** A due time missed by up to this many hours (the shop closed, the computer asleep) still runs, once. */
export const MISSED_RUN_HOURS = 12;

/** A local HH:MM on the day of `d`. */
function onDay(d: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

/** `d` moved on by whole local days, so a time of day stays the same across a change of the clocks. */
function addDays(d: Date, days: number, time: string): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return onDay(out, time);
}

/** The first due time strictly after `after`, in local time; null for a one-off that has had its time. */
export function nextTime(every: ScheduleEvery, after: Date): Date | null {
  if (every.kind === 'once') {
    const at = new Date(every.at);
    return at > after ? at : null;
  }
  if (every.kind === 'daily') {
    const today = onDay(after, every.time);
    return today > after ? today : addDays(after, 1, every.time);
  }
  const ahead = (every.weekday - after.getDay() + 7) % 7;
  const that = addDays(after, ahead, every.time);
  return that > after ? that : addDays(after, ahead + 7, every.time);
}

/**
 * What a schedule does now: `run` once if it is due (the latest due time no more than MISSED_RUN_HOURS ago), the due
 * times it `missed` and skips, and when it is due `next` (null when a one-off is used up). `held`: a round of it was
 * interrupted and waits to be carried on (B7), so it does not run again and nothing counts as missed.
 */
export function due(s: Schedule, now: Date, held = false): { run: boolean; missed: string[]; next: string | null } {
  const first = new Date(s.next);
  if (!s.enabled || first > now) return { run: false, missed: [], next: s.next };
  if (held) return { run: false, missed: [], next: nextTime(s.every, now)?.toISOString() ?? null };
  const times = [first];
  for (let t = nextTime(s.every, first); t && t <= now; t = nextTime(s.every, t)) times.push(t);
  const latest = times.at(-1)!;
  const run = now.getTime() - latest.getTime() <= MISSED_RUN_HOURS * 3600_000;
  const missed = (run ? times.slice(0, -1) : times).map((t) => t.toISOString());
  return { run, missed, next: nextTime(s.every, now)?.toISOString() ?? null };
}

/** How long until the timer should look again: the next due time, an hour at most. */
export function wakeIn(list: Schedule[], now: Date): number {
  const soonest = Math.min(...list.filter((s) => s.enabled).map((s) => new Date(s.next).getTime() - now.getTime()));
  return Math.max(0, Math.min(TICK_MS, soonest));
}

const EVERY = new Set(['weekly', 'daily', 'once']);
const isSchedule = (s: Schedule | null) => Boolean(s && typeof s.id === 'string' && s.form && typeof s.form.want === 'string' && EVERY.has(s.every?.kind) && typeof s.next === 'string');

/** The scheduled commissions, kept in schedules.json in the data folder. A broken file reads as none and is left as it is. */
export class ScheduleStore {
  private items: Schedule[];

  constructor(private file: string) {
    this.items = this.read();
  }

  list(): Schedule[] {
    return this.items.map((s) => ({ ...s }));
  }

  add(s: Schedule) {
    this.items.push(s);
    this.write();
  }

  update(id: string, patch: Partial<Schedule>) {
    this.items = this.items.map((s) => (s.id === id ? { ...s, ...patch } : s));
    this.write();
  }

  remove(id: string) {
    this.items = this.items.filter((s) => s.id !== id);
    this.write();
  }

  private read(): Schedule[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(isSchedule) : [];
    } catch {
      return [];
    }
  }

  private write() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.items, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
