import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MISSED_RUN_HOURS, ScheduleStore, TICK_MS, due, nextTime, wakeIn } from '../app/main/schedule';
import type { Schedule } from '../app/shared/types';

/** A local date and time, as the user reads it on the wall. */
const at = (local: string) => new Date(local);
/** The local wall time of a moment, YYYY-MM-DDTHH:MM. */
const wall = (d: Date | null) => {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const slip = (every: Schedule['every'], next: string, over: Partial<Schedule> = {}): Schedule =>
  ({ id: 's1', project: 'p1', form: { want: 'A weekly report' }, every, next: at(next).toISOString(), enabled: true, ...over });

describe('when a scheduled commission is next due (road-to-1.2.md B6)', () => {
  const zone = process.env.TZ;
  // New Zealand: a long way from UTC, and its clocks go forward on 27 Sep 2026.
  beforeEach(() => { process.env.TZ = 'Pacific/Auckland'; });
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it('weekly: the next such weekday at that time, a week on once it has passed', () => {
    const monday9 = { kind: 'weekly', weekday: 1, time: '09:00' } as const;
    // Wednesday 18 Nov 2026.
    expect(wall(nextTime(monday9, at('2026-11-18T12:00')))).toBe('2026-11-23T09:00');
    // Monday morning before nine: today.
    expect(wall(nextTime(monday9, at('2026-11-23T08:59')))).toBe('2026-11-23T09:00');
    // On the dot counts as done: the next is a week on.
    expect(wall(nextTime(monday9, at('2026-11-23T09:00')))).toBe('2026-11-30T09:00');
    // Sunday evening.
    expect(wall(nextTime({ kind: 'weekly', weekday: 0, time: '20:30' }, at('2026-11-22T21:00')))).toBe('2026-11-29T20:30');
  });

  it('daily: today if it is still to come, tomorrow otherwise', () => {
    const nine = { kind: 'daily', time: '09:00' } as const;
    expect(wall(nextTime(nine, at('2026-11-18T08:00')))).toBe('2026-11-18T09:00');
    expect(wall(nextTime(nine, at('2026-11-18T09:30')))).toBe('2026-11-19T09:00');
  });

  it('once: that moment while it is still to come, then never again', () => {
    const once = { kind: 'once', at: '2026-11-20T15:00' } as const;
    expect(wall(nextTime(once, at('2026-11-18T08:00')))).toBe('2026-11-20T15:00');
    expect(nextTime(once, at('2026-11-20T15:00'))).toBeNull();
  });

  it('crosses into the next month and the next year', () => {
    expect(wall(nextTime({ kind: 'daily', time: '09:00' }, at('2026-11-30T10:00')))).toBe('2026-12-01T09:00');
    // Monday 30 Nov, then Monday 7 Dec.
    expect(wall(nextTime({ kind: 'weekly', weekday: 1, time: '09:00' }, at('2026-11-30T10:00')))).toBe('2026-12-07T09:00');
    expect(wall(nextTime({ kind: 'daily', time: '08:00' }, at('2026-12-31T23:00')))).toBe('2027-01-01T08:00');
  });

  it('goes by local midnight, not the one in Greenwich', () => {
    // Just before local midnight: midnight is the start of the next local day.
    expect(wall(nextTime({ kind: 'daily', time: '00:00' }, at('2026-11-18T23:59')))).toBe('2026-11-19T00:00');
    expect(wall(nextTime({ kind: 'daily', time: '00:30' }, at('2026-11-19T00:10')))).toBe('2026-11-19T00:30');
    // Monday in Auckland is still Sunday in UTC.
    expect(nextTime({ kind: 'weekly', weekday: 1, time: '09:00' }, at('2026-11-22T12:00'))!.getDay()).toBe(1);
    // The clocks go forward overnight: nine o'clock is still nine o'clock, 23 hours later.
    const next = nextTime({ kind: 'daily', time: '09:00' }, at('2026-09-26T09:00'))!;
    expect(wall(next)).toBe('2026-09-27T09:00');
    expect(next.getTime() - at('2026-09-26T09:00').getTime()).toBe(23 * 3600_000);
  });
});

describe('what a schedule does when the shop looks at the clock', () => {
  const daily = { kind: 'daily', time: '09:00' } as const;

  it('nothing before it is due, or while it is switched off', () => {
    expect(due(slip(daily, '2026-11-18T09:00'), at('2026-11-18T08:59'))).toEqual({ run: false, missed: [], next: at('2026-11-18T09:00').toISOString() });
    expect(due(slip(daily, '2026-11-18T09:00', { enabled: false }), at('2026-11-18T10:00')).run).toBe(false);
  });

  it('on time: runs, and the next is tomorrow', () => {
    expect(due(slip(daily, '2026-11-18T09:00'), at('2026-11-18T09:00'))).toEqual({ run: true, missed: [], next: at('2026-11-19T09:00').toISOString() });
  });

  it(`missed by up to ${MISSED_RUN_HOURS} hours: runs once, late`, () => {
    expect(MISSED_RUN_HOURS).toBe(12);
    expect(due(slip(daily, '2026-11-18T09:00'), at('2026-11-18T21:00'))).toEqual({ run: true, missed: [], next: at('2026-11-19T09:00').toISOString() });
  });

  it('missed by longer: skipped, and said which', () => {
    const weekly = { kind: 'weekly', weekday: 3, time: '09:00' } as const;
    expect(due(slip(weekly, '2026-11-18T09:00'), at('2026-11-18T21:01'))).toEqual({ run: false, missed: [at('2026-11-18T09:00').toISOString()], next: at('2026-11-25T09:00').toISOString() });
  });

  it('missed several times: only the latest runs, once, if it is recent; the rest are skipped', () => {
    // Closed from Monday to Wednesday morning: Monday's and Tuesday's are skipped, Wednesday's runs.
    const r = due(slip(daily, '2026-11-16T09:00'), at('2026-11-18T10:00'));
    expect(r.run).toBe(true);
    expect(r.missed).toEqual([at('2026-11-16T09:00').toISOString(), at('2026-11-17T09:00').toISOString()]);
    expect(r.next).toBe(at('2026-11-19T09:00').toISOString());
    // Closed for a week and back late in the evening: nothing runs, every one is skipped.
    const week = due(slip(daily, '2026-11-11T09:00'), at('2026-11-18T22:00'));
    expect(week.run).toBe(false);
    expect(week.missed).toHaveLength(8);
  });

  it('once: runs once and then has no next time; missed by long, it is skipped', () => {
    const once = { kind: 'once', at: '2026-11-18T09:00' } as const;
    expect(due(slip(once, '2026-11-18T09:00'), at('2026-11-18T09:01'))).toEqual({ run: true, missed: [], next: null });
    expect(due(slip(once, '2026-11-18T09:00'), at('2026-11-19T09:01'))).toEqual({ run: false, missed: [at('2026-11-18T09:00').toISOString()], next: null });
  });

  it('wakes at the next due time, an hour at most', () => {
    expect(TICK_MS).toBe(3600_000);
    const now = at('2026-11-18T08:59:30');
    expect(wakeIn([slip(daily, '2026-11-18T09:00')], now)).toBe(30_000);
    expect(wakeIn([slip(daily, '2026-11-19T09:00')], now)).toBe(TICK_MS);
    expect(wakeIn([slip(daily, '2026-11-18T09:00', { enabled: false })], now)).toBe(TICK_MS);
    expect(wakeIn([], now)).toBe(TICK_MS);
  });
});

describe('schedules.json', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'lamplight-schedules-')), 'schedules.json');

  it('keeps schedules across openings, changed and removed', () => {
    const f = file();
    const store = new ScheduleStore(f);
    expect(store.list()).toEqual([]);
    const s = slip({ kind: 'daily', time: '09:00' }, '2026-11-18T09:00');
    store.add(s);
    store.update('s1', { last: { at: '2026-11-18T09:00', result: 'done' } });
    expect(new ScheduleStore(f).list()).toEqual([{ ...s, last: { at: '2026-11-18T09:00', result: 'done' } }]);
    store.remove('s1');
    expect(new ScheduleStore(f).list()).toEqual([]);
  });

  it('leaves out what is not a schedule, and starts empty from a broken file', () => {
    const f = file();
    const s = slip({ kind: 'daily', time: '09:00' }, '2026-11-18T09:00');
    writeFileSync(f, JSON.stringify([s, { id: 3 }, null, { ...s, id: 's2', every: { kind: 'hourly' } }]));
    expect(new ScheduleStore(f).list()).toEqual([s]);
    writeFileSync(f, '{ not json');
    expect(new ScheduleStore(f).list()).toEqual([]);
    expect(readFileSync(f, 'utf8')).toBe('{ not json');
  });
});
