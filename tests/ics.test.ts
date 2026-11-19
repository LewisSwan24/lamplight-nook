import { describe, expect, it } from 'vitest';
import { eventsBetween, eventsText, IcsError, MAX_DAYS, MAX_EVENTS } from '../app/main/ics';

/** A calendar file around some VEVENT lines, with CRLF line ends as the standard has them. */
const cal = (...events: string[][]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
  ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

const SH = { zone: 'Asia/Shanghai' };
const starts = (text: string, from: string, to: string, opts = SH) => eventsBetween(text, from, to, opts).events.map((e) => e.start);

describe('a calendar subscription read by the shop (road-to-1.3.md C5)', () => {
  it('reads titles and places, unfolding long lines and unescaping commas, semicolons and line breaks', () => {
    const text = cal(['UID:a', 'DTSTART:20261120T010000Z', 'DTEND:20261120T020000Z', 'SUMMARY:Book club\\, autumn\\; part one', ' and two', 'LOCATION:Room 2\\nLibrary']);
    expect(eventsBetween(text, '2026-11-20', '2026-11-20', SH).events).toEqual([
      { start: '2026-11-20T01:00:00Z', end: '2026-11-20T02:00:00Z', allDay: false, title: 'Book club, autumn; part oneand two', location: 'Room 2\nLibrary' },
    ]);
  });

  it('keeps an all-day event as days, its end the day after', () => {
    const text = cal(['UID:b', 'DTSTART;VALUE=DATE:20261123', 'DTEND;VALUE=DATE:20261125', 'SUMMARY:Trip']);
    const [e] = eventsBetween(text, '2026-11-24', '2026-11-24', SH).events;
    expect(e).toMatchObject({ start: '2026-11-23', end: '2026-11-25', allDay: true, title: 'Trip' });
    expect(eventsText(eventsBetween(text, '2026-11-23', '2026-11-30', SH).events, SH.zone)).toMatch(/2026-11-23 .* all day .*Trip/);
  });

  it('places a time with a time zone at the right moment, summer and winter, and a floating time in the computer\'s zone', () => {
    const text = cal(
      ['UID:c', 'DTSTART;TZID=America/New_York:20261120T090000', 'DTEND;TZID=America/New_York:20261120T100000', 'SUMMARY:Winter'],
      ['UID:d', 'DTSTART;TZID=America/New_York:20260715T090000', 'DURATION:PT90M', 'SUMMARY:Summer'],
      ['UID:e', 'DTSTART:20261121T090000', 'DTEND:20261121T093000', 'SUMMARY:Floating'],
    );
    const all = eventsBetween(text, '2026-07-01', '2026-08-31', SH).events.concat(eventsBetween(text, '2026-11-01', '2026-11-30', SH).events);
    expect(all.map((e) => [e.title, e.start, e.end])).toEqual([
      ['Summer', '2026-07-15T13:00:00Z', '2026-07-15T14:30:00Z'],
      ['Winter', '2026-11-20T14:00:00Z', '2026-11-20T15:00:00Z'],
      ['Floating', '2026-11-21T01:00:00Z', '2026-11-21T01:30:00Z'],
    ]);
  });

  it('a zone this computer does not know counts as the computer\'s own', () => {
    const text = cal(['UID:f', 'DTSTART;TZID=China Standard Time:20261120T090000', 'DTEND;TZID=China Standard Time:20261120T100000', 'SUMMARY:Outlook']);
    expect(starts(text, '2026-11-20', '2026-11-20')).toEqual(['2026-11-20T01:00:00Z']);
  });

  it('repeats every week on the days given, by count, until a date or every other week, keeping the wall clock across a clock change', () => {
    const weekly = (rule: string) => cal(['UID:g', 'DTSTART;TZID=America/New_York:20261019T090000', 'DTEND;TZID=America/New_York:20261019T100000', `RRULE:${rule}`, 'SUMMARY:Stand-up']);
    expect(starts(weekly('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-19T13:00:00Z', '2026-10-21T13:00:00Z', '2026-10-26T13:00:00Z', '2026-10-28T13:00:00Z',
    ]);
    expect(starts(weekly('FREQ=WEEKLY;UNTIL=20261103T000000Z'), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-19T13:00:00Z', '2026-10-26T13:00:00Z', '2026-11-02T14:00:00Z',
    ]);
    expect(starts(weekly('FREQ=WEEKLY;INTERVAL=2;COUNT=3'), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-19T13:00:00Z', '2026-11-02T14:00:00Z', '2026-11-16T14:00:00Z',
    ]);
  });

  it('repeats daily, monthly and yearly too', () => {
    const rep = (rule: string, start = '20261130T020000Z') => cal(['UID:h', `DTSTART:${start}`, 'DURATION:PT1H', `RRULE:${rule}`, 'SUMMARY:x']);
    expect(starts(rep('FREQ=DAILY;COUNT=3'), '2026-11-01', '2026-12-31')).toEqual(['2026-11-30T02:00:00Z', '2026-12-01T02:00:00Z', '2026-12-02T02:00:00Z']);
    expect(starts(rep('FREQ=MONTHLY;COUNT=2', '20261015T020000Z'), '2026-11-01', '2026-12-31')).toEqual(['2026-11-15T02:00:00Z']);
    expect(starts(rep('FREQ=MONTHLY;BYDAY=2TU', '20261013T020000Z'), '2026-11-01', '2026-12-31')).toEqual(['2026-11-10T02:00:00Z', '2026-12-08T02:00:00Z']);
    expect(starts(rep('FREQ=YEARLY', '20201120T020000Z'), '2026-11-01', '2026-11-30')).toEqual(['2026-11-20T02:00:00Z']);
  });

  it('leaves out an excepted day, a cancelled event and the occurrence a moved one replaces', () => {
    const text = cal(
      ['UID:i', 'DTSTART:20261116T010000Z', 'DTEND:20261116T020000Z', 'RRULE:FREQ=DAILY;COUNT=5', 'EXDATE:20261117T010000Z,20261118T010000Z', 'SUMMARY:Daily'],
      ['UID:i', 'RECURRENCE-ID:20261119T010000Z', 'DTSTART:20261119T060000Z', 'DTEND:20261119T070000Z', 'SUMMARY:Daily, moved'],
      ['UID:j', 'DTSTART:20261116T030000Z', 'DTEND:20261116T040000Z', 'STATUS:CANCELLED', 'SUMMARY:Off'],
    );
    expect(eventsBetween(text, '2026-11-16', '2026-11-22', SH).events.map((e) => [e.start, e.title])).toEqual([
      ['2026-11-16T01:00:00Z', 'Daily'], ['2026-11-19T06:00:00Z', 'Daily, moved'], ['2026-11-20T01:00:00Z', 'Daily'],
    ]);
  });

  it(`reads at most ${MAX_DAYS} days and ${MAX_EVENTS} events, and says when there were more`, () => {
    expect(() => eventsBetween(cal(), '2026-01-01', '2026-03-04', SH)).toThrow(IcsError);
    expect(() => eventsBetween(cal(), '2026-01-01', '2026-03-04', SH)).toThrow(/62 days/);
    expect(() => eventsBetween(cal(), '2026-03-04', '2026-03-01', SH)).toThrow(IcsError);
    const many = cal(...Array.from({ length: MAX_EVENTS + 5 }, (_, i) => [`UID:m${i}`, 'DTSTART:20261120T010000Z', 'DTEND:20261120T020000Z', `SUMMARY:e${i}`]));
    const r = eventsBetween(many, '2026-11-20', '2026-11-20', SH);
    expect(r.events).toHaveLength(MAX_EVENTS);
    expect(r.more).toBe(true);
    expect(eventsText(r.events, SH.zone, r.more)).toMatch(/more/);
  });

  it('reads old repeating events quickly, and stops on a calendar that would keep it counting for minutes', () => {
    const old = cal(...Array.from({ length: 300 }, (_, i) => [`UID:o${i}`, 'DTSTART;TZID=America/New_York:19700101T090000', 'DURATION:PT1H', 'RRULE:FREQ=DAILY', `SUMMARY:o${i}`]));
    let t = Date.now();
    const r = eventsBetween(old, '2026-11-20', '2026-11-26', SH);
    expect(r.events).toHaveLength(MAX_EVENTS);
    expect(r.more).toBe(true);
    expect(Date.now() - t).toBeLessThan(3000);
    // A count has to be walked from the first one, so many long counts from long ago are refused rather than counted.
    const counted = cal(...Array.from({ length: 2000 }, (_, i) => [`UID:c${i}`, 'DTSTART:19700101T090000Z', 'DURATION:PT1H', 'RRULE:FREQ=DAILY;COUNT=100000', `SUMMARY:c${i}`]));
    t = Date.now();
    expect(() => eventsBetween(counted, '2026-11-20', '2026-11-26', SH)).toThrow(/too many repeats/);
    expect(Date.now() - t).toBeLessThan(5000);
    // A rule no month fits ends at the days asked for, without counting on.
    expect(eventsBetween(cal(['UID:n', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=35', 'SUMMARY:never']), '2026-11-20', '2026-11-26', SH).events).toEqual([]);
  }, 20_000);

  it('refuses what is not a calendar', () => {
    for (const bad of ['hello', '<html>not found</html>', 'BEGIN:VCARD\r\nEND:VCARD']) expect(() => eventsBetween(bad, '2026-11-20', '2026-11-20', SH)).toThrow(IcsError);
    // An event without a start is skipped, not a reason to refuse the rest.
    expect(eventsBetween(cal(['UID:z', 'SUMMARY:No start']), '2026-11-20', '2026-11-20', SH).events).toEqual([]);
  });
});
