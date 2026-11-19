/**
 * A calendar subscription (iCalendar, RFC 5545) read by the shop itself (road-to-1.3.md C5): the events between two days,
 * repeats unfolded. Read only: nothing here ever writes to a calendar. What it does not understand it leaves out rather
 * than guesses: an event without a start, a repeat rule it cannot follow beyond its first time.
 */

export const MAX_DAYS = 62;
export const MAX_EVENTS = 200;

/** The file is no calendar, or the days asked for are not a span it reads. Its message is for Claude. */
export class IcsError extends Error {}

/** One event as the staff are told of it: an all-day one by days (end the day after), a timed one by UTC instants. */
export type Occurrence = { start: string; end: string; allDay: boolean; title: string; location?: string };

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };
/** A start as written: a day, or a wall-clock time in a zone ('UTC' for a time ending in Z). */
type When = { allDay: true; wall: Wall } | { allDay: false; wall: Wall; zone: string };
type Rule = { freq: string; interval: number; count?: number; until?: When; byday: { n: number; day: number }[]; bymonthday?: number };
type Ev = { uid: string; start?: When; end?: When; durationMs?: number; title: string; location?: string; rule?: Rule; exdates: Set<string>; recurrenceId?: string; cancelled: boolean };

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_MS = 86_400_000;
/** A byte-order mark some servers put first (built from its code: a tool here strips the character itself). */
const BOM = String.fromCharCode(0xfeff);

const zoneKnown = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** How far a zone's clock is ahead of UTC at an instant, in ms. */
function offsetMs(utc: number, zone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(utc)).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(utc / 1000) * 1000;
}

/** The instant a wall-clock time in a zone stands for. */
function wallToUtc(w: Wall, zone: string): number {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  if (zone === 'UTC') return guess;
  const first = guess - offsetMs(guess, zone);
  return guess - offsetMs(first, zone);
}

/** A zone's wall clock at an instant. */
function utcToWall(utc: number, zone: string): Wall {
  const t = new Date(utc + (zone === 'UTC' ? 0 : offsetMs(utc, zone)));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const dayKey = (w: Wall) => `${pad(w.y, 4)}-${pad(w.mo)}-${pad(w.d)}`;
/** A day moved by n days (or months, or years), the time kept. Days past a month's end roll on, which the callers check. */
const addDays = (w: Wall, n: number): Wall => {
  const t = new Date(Date.UTC(w.y, w.mo - 1, w.d + n));
  return { ...w, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const weekday = (w: Wall) => new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay();
const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** Where an occurrence starts, as the key EXDATE and RECURRENCE-ID are matched by. */
const keyOf = (w: When, local: string) => (w.allDay ? dayKey(w.wall) : String(wallToUtc(w.wall, w.zone === 'local' ? local : w.zone)));
const utcOf = (w: When, local: string) => (w.allDay ? wallToUtc(w.wall, local) : wallToUtc(w.wall, w.zone === 'local' ? local : w.zone));

/** Text lines, long ones unfolded, split into name, parameters and value. */
function properties(text: string): { name: string; params: Record<string, string>; value: string }[] {
  return (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean).map((line) => {
    let colon = -1;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      else if (line[i] === ':' && !quoted) { colon = i; break; }
    }
    const head = colon < 0 ? line : line.slice(0, colon);
    const [name, ...rest] = head.split(';');
    const params = Object.fromEntries(rest.map((p) => {
      const eq = p.indexOf('=');
      return [p.slice(0, eq).toUpperCase(), p.slice(eq + 1).replace(/^"|"$/g, '')];
    }));
    return { name: name.toUpperCase(), params, value: colon < 0 ? '' : line.slice(colon + 1) };
  });
}

const unescape = (v: string) => v.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

/** A DTSTART-like value: a day, a UTC time, a time in a named zone, or a floating time (the computer's own). */
function when(value: string, params: Record<string, string>): When | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return undefined;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) };
  if (!m[4] || params.VALUE === 'DATE') return { allDay: true, wall };
  if (m[7]) return { allDay: false, wall, zone: 'UTC' };
  const tz = params.TZID;
  return { allDay: false, wall, zone: tz && zoneKnown(tz) ? tz : 'local' };
}

function duration(v: string): number | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return undefined;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 24 * 3600 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

/** A repeat rule, or undefined for one this reader cannot follow (the event then counts once). */
function rule(v: string): Rule | undefined {
  const p = Object.fromEntries(v.split(';').map((kv) => kv.split('=')).map(([k, x]) => [k.toUpperCase(), x ?? '']));
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(p.FREQ)) return undefined;
  const known = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'WKST']);
  if (Object.keys(p).some((k) => !known.has(k))) return undefined;
  const byday = (p.BYDAY ? p.BYDAY.split(',') : []).map((d) => /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d.toUpperCase()));
  if (byday.some((d) => !d)) return undefined;
  const days = byday.map((d) => ({ n: d![1] ? Number(d![1]) : 0, day: DAYS.indexOf(d![2]) }));
  if ((p.FREQ === 'WEEKLY' && days.some((d) => d.n)) || ((p.FREQ === 'DAILY' || p.FREQ === 'YEARLY') && (days.length || p.BYMONTHDAY))) return undefined;
  if (p.BYMONTHDAY && (p.FREQ !== 'MONTHLY' || !/^\d{1,2}$/.test(p.BYMONTHDAY) || days.length)) return undefined;
  return {
    freq: p.FREQ,
    interval: Math.max(1, Number(p.INTERVAL) || 1),
    ...(p.COUNT ? { count: Math.max(1, Number(p.COUNT) || 1) } : {}),
    ...(p.UNTIL ? { until: when(p.UNTIL, {}) } : {}),
    byday: days,
    ...(p.BYMONTHDAY ? { bymonthday: Number(p.BYMONTHDAY) } : {}),
  };
}

function parse(text: string): Ev[] {
  const props = properties(text);
  if (!props.some((p) => p.name === 'BEGIN' && p.value.toUpperCase() === 'VCALENDAR')) {
    throw new IcsError('That address did not give a calendar (no BEGIN:VCALENDAR). It may be a web page or an expired address.');
  }
  const events: Ev[] = [];
  let ev: Ev | null = null;
  let depth = 0;
  for (const { name, params, value } of props) {
    if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') { ev = { uid: '', title: '', exdates: new Set(), cancelled: false }; depth = 0; continue; }
    if (!ev) continue;
    // A reminder (VALARM) inside an event has properties of its own, which are not the event's.
    if (name === 'BEGIN') { depth++; continue; }
    if (name === 'END' && depth) { depth--; continue; }
    if (name === 'END' && value.toUpperCase() === 'VEVENT') { events.push(ev); ev = null; continue; }
    if (depth) continue;
    if (name === 'UID') ev.uid = value;
    else if (name === 'SUMMARY') ev.title = unescape(value);
    else if (name === 'LOCATION') ev.location = unescape(value);
    else if (name === 'DTSTART') ev.start = when(value, params);
    else if (name === 'DTEND') ev.end = when(value, params);
    else if (name === 'DURATION') ev.durationMs = duration(value);
    else if (name === 'RRULE') ev.rule = rule(value);
    else if (name === 'STATUS') ev.cancelled = value.toUpperCase() === 'CANCELLED';
    else if (name === 'RECURRENCE-ID') ev.recurrenceId = value + JSON.stringify(params);
    else if (name === 'EXDATE') for (const v of value.split(',')) { const w = when(v, params); if (w) ev.exdates.add(JSON.stringify(w)); }
  }
  return events;
}

/**
 * The starts of an event's occurrences, in order, as walls in its own zone (so a weekly 9:00 stays 9:00 across a clock
 * change), until `stop` (a UTC instant) or its count or end. `local` is the computer's zone.
 */
function* occurrences(ev: Ev & { start: When }, local: string, stop: number): Generator<When> {
  const r = ev.rule;
  const first = ev.start;
  const make = (wall: Wall): When => (first.allDay ? { allDay: true, wall } : { ...first, wall });
  if (!r) { yield first; return; }
  let n = 0;
  const untilUtc = r.until ? utcOf(r.until, local) : Infinity;
  const startUtc = utcOf(first, local);
  const take = function* (candidates: Wall[]): Generator<When, boolean> {
    for (const wall of candidates.sort((a, b) => Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(b.y, b.mo - 1, b.d))) {
      const w = make(wall);
      const t = utcOf(w, local);
      if (t < startUtc) continue;
      if (t > untilUtc || t > stop || (r.count !== undefined && n >= r.count)) return false;
      n++;
      yield w;
    }
    return true;
  };
  const s = first.wall;
  for (let step = 0; step < 100_000; step++) {
    let candidates: Wall[];
    if (r.freq === 'DAILY') candidates = [addDays(s, step * r.interval)];
    else if (r.freq === 'WEEKLY') {
      const monday = addDays(s, -((weekday(s) + 6) % 7) + step * 7 * r.interval);
      candidates = r.byday.length ? r.byday.map((b) => addDays(monday, (b.day + 6) % 7)) : [addDays(s, step * 7 * r.interval)];
    } else if (r.freq === 'MONTHLY') {
      const m0 = s.y * 12 + (s.mo - 1) + step * r.interval;
      const y = Math.floor(m0 / 12);
      const mo = (m0 % 12) + 1;
      if (r.byday.length) {
        candidates = r.byday.flatMap((b) => {
          const all = Array.from({ length: daysInMonth(y, mo) }, (_, i) => ({ ...s, y, mo, d: i + 1 })).filter((w) => weekday(w) === b.day);
          const pick = b.n > 0 ? all[b.n - 1] : b.n < 0 ? all[all.length + b.n] : undefined;
          return b.n ? (pick ? [pick] : []) : all;
        });
      } else {
        const d = r.bymonthday ?? s.d;
        candidates = d <= daysInMonth(y, mo) ? [{ ...s, y, mo, d }] : [];
      }
    } else {
      const y = s.y + step * r.interval;
      candidates = s.d <= daysInMonth(y, s.mo) ? [{ ...s, y }] : [];
    }
    if (!(yield* take(candidates))) return;
  }
}

/** A day "YYYY-MM-DD" as a wall, or undefined. */
function day(v: string): Wall | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  const w = { y: +m[1], mo: +m[2], d: +m[3], h: 0, mi: 0, s: 0 };
  return dayKey(addDays(w, 0)) === v ? w : undefined;
}

/**
 * The events between two days (both included, in `zone`, the computer's own by default), in order, at most MAX_EVENTS;
 * `more` when there were others. At most MAX_DAYS days.
 */
export function eventsBetween(text: string, from: string, to: string, opts: { zone?: string } = {}): { events: Occurrence[]; more: boolean } {
  const local = opts.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const a = day(from);
  const b = day(to);
  if (!a || !b) throw new IcsError('from and to are days written YYYY-MM-DD.');
  const span = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY_MS) + 1;
  if (span < 1) throw new IcsError('to comes before from.');
  if (span > MAX_DAYS) throw new IcsError(`At most ${MAX_DAYS} days at a time; ask for a shorter span.`);
  const lo = wallToUtc(a, local);
  const hi = wallToUtc(addDays(b, 1), local);
  const events = parse(text);
  const moved = new Map<string, Set<string>>();
  for (const ev of events) {
    if (!ev.recurrenceId) continue;
    const [value, params] = [ev.recurrenceId.replace(/\{.*$/, ''), JSON.parse(ev.recurrenceId.slice(ev.recurrenceId.indexOf('{'))) as Record<string, string>];
    const w = when(value, params);
    if (w) moved.set(ev.uid, (moved.get(ev.uid) ?? new Set()).add(keyOf(w, local)));
  }
  const found: (Occurrence & { at: number })[] = [];
  for (const ev of events) {
    if (!ev.start || ev.cancelled) continue;
    const start = ev.start;
    const exdates = new Set([...ev.exdates].map((x) => keyOf(JSON.parse(x) as When, local)));
    const skip = ev.recurrenceId ? new Set<string>() : moved.get(ev.uid) ?? new Set<string>();
    const length = ev.end ? utcOf(ev.end, local) - utcOf(start, local) : ev.durationMs ?? (start.allDay ? DAY_MS : 0);
    for (const w of occurrences({ ...ev, start }, local, hi)) {
      const key = keyOf(w, local);
      if (exdates.has(key) || skip.has(key)) continue;
      const at = utcOf(w, local);
      if (w.allDay) {
        const days = Math.max(1, Math.round(length / DAY_MS));
        const endDay = addDays(w.wall, days);
        if (at >= hi || wallToUtc(endDay, local) <= lo) continue;
        found.push({ start: dayKey(w.wall), end: dayKey(endDay), allDay: true, title: ev.title, ...(ev.location ? { location: ev.location } : {}), at });
      } else {
        const end = at + Math.max(0, length);
        if (at >= hi || (end <= lo && !(end === at && at >= lo))) continue;
        const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
        found.push({ start: iso(at), end: iso(end), allDay: false, title: ev.title, ...(ev.location ? { location: ev.location } : {}), at });
      }
    }
  }
  found.sort((x, y) => x.at - y.at);
  return { events: found.slice(0, MAX_EVENTS).map(({ at: _at, ...o }) => o), more: found.length > MAX_EVENTS };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The events as lines for Claude, in the computer's own time. */
export function eventsText(events: Occurrence[], zone: string, more = false): string {
  if (!events.length) return 'No events in those days.';
  const lines = events.map((e) => {
    const place = e.location ? ` (at ${e.location.replace(/\n/g, ', ')})` : '';
    if (e.allDay) {
      const s = day(e.start)!;
      const last = addDays(day(e.end)!, -1);
      const span = dayKey(last) === e.start ? '' : ` to ${dayKey(last)}`;
      return `${e.start} ${WEEKDAYS[weekday(s)]} all day${span} ${e.title}${place}`;
    }
    const s = utcToWall(Date.parse(e.start), zone);
    const t = utcToWall(Date.parse(e.end), zone);
    const endDay = dayKey(t) === dayKey(s) ? '' : `${dayKey(t)} `;
    return `${dayKey(s)} ${WEEKDAYS[weekday(s)]} ${pad(s.h)}:${pad(s.mi)}-${endDay}${pad(t.h)}:${pad(t.mi)} ${e.title}${place}`;
  });
  if (more) lines.push(`There are more events in those days than the ${MAX_EVENTS} shown; ask for fewer days.`);
  return lines.join('\n');
}
