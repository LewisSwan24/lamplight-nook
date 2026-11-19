import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { NotOpened } from '../shared/types';
import { officeSafe } from './office/safe';

/**
 * Kinds of file the shop opens with a click. The staff write files, and a page or a file they read could talk
 * them into writing a program, a script or a shortcut; opening that would run it. Anything else is shown in
 * its folder instead, for the user to decide. Word, Excel and PowerPoint files come in only in their kinds without
 * macros, never .docm, .xlsm or .pptm (road-to-1.3.md C1).
 */
const OPENABLE = new Set(['.html', '.htm', '.md', '.txt', '.csv', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.xlsx', '.pptx', '.eml', '.ics']);
/** Office opens these and runs what they bring, so each is looked inside first. */
const OFFICE = new Set(['.docx', '.xlsx', '.pptx']);

/** Lines, with their folded continuations joined back, as mail headers and calendar files fold them. */
const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

/**
 * The calendar properties an ordinary event uses, its time zone and a reminder on screen included. Anything else (an
 * attachment, an invitation to others, the old vCalendar alarms that start a program) keeps the file in its folder.
 */
const CALENDAR_PROPERTIES = new Set(['BEGIN', 'END', 'VERSION', 'PRODID', 'CALSCALE', 'METHOD', 'X-WR-CALNAME', 'X-WR-TIMEZONE',
  'UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'DESCRIPTION', 'LOCATION', 'GEO', 'URL', 'CATEGORIES', 'CLASS',
  'STATUS', 'TRANSP', 'PRIORITY', 'SEQUENCE', 'CREATED', 'LAST-MODIFIED', 'COMMENT', 'RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID',
  'TZID', 'TZNAME', 'TZOFFSETFROM', 'TZOFFSETTO', 'TZURL', 'ACTION', 'TRIGGER', 'REPEAT']);
const CALENDAR_PARTS = new Set(['VCALENDAR', 'VEVENT', 'VTIMEZONE', 'STANDARD', 'DAYLIGHT', 'VALARM']);
/** The ways a file can be written into the text of a mail, which some mail programs turn back into an attachment. */
const INLINE_FILE = /^(begin\s+[0-7]+\s|begin-base64\s|=ybegin\s|\(This file must be converted with BinHex)/im;

/** A mail's text as its mail program shows it, once its transfer encoding is undone; undefined for any other encoding. */
function mailText(encoding: string | undefined, body: string): string | undefined {
  const e = (encoding ?? '7bit').trim().toLowerCase();
  if (e === '7bit' || e === '8bit') return body;
  if (e === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (e === 'quoted-printable') {
    return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  }
  return undefined;
}

/**
 * Whether a mail or calendar file is as plain as the shop's own (road-to-1.3.md C5), read the strict way so a program
 * that reads it more loosely finds nothing more: valid UTF-8 with no NUL, which rules out UTF-16 and the other encodings,
 * and no CR but in a CRLF line end. A mail has exactly one type, plain text, no disposition, a transfer encoding of the
 * usual kinds, and no file written into its text, once that is decoded. A calendar is version 2.0 and holds only events,
 * time zones and reminders on screen, with the properties those use.
 * Undefined when it cannot be read.
 */
function plain(path: string, ext: string): boolean | undefined {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return undefined;
  }
  const raw = bytes.toString('utf8');
  if (raw.includes('\u0000') || raw.includes('\ufffd') || /\r(?!\n)/.test(raw)) return false;
  const lines = unfold(raw.startsWith('\ufeff') ? raw.slice(1) : raw);
  if (ext === '.ics') {
    const props = lines.filter((l) => l.trim()).map((l) => {
      const m = /^([A-Za-z0-9-]+)[;:]/.exec(l);
      return { name: m?.[1].toUpperCase(), value: l.slice(l.indexOf(':') + 1).trim().toUpperCase() };
    });
    return props.some((q) => q.name === 'VERSION' && q.value === '2.0')
      && props.every((q) => !!q.name && CALENDAR_PROPERTIES.has(q.name)
        && (q.name !== 'BEGIN' && q.name !== 'END' || CALENDAR_PARTS.has(q.value))
        && (q.name !== 'ACTION' || q.value === 'DISPLAY'));
  }
  const end = lines.indexOf('');
  if (end < 0) return false;
  const head = lines.slice(0, end);
  const header = (name: string) => head.filter((l) => new RegExp(`^${name}\\s*:`, 'i').test(l));
  const types = header('content-type');
  const encodings = header('content-transfer-encoding');
  if (types.length !== 1 || !/^content-type\s*:\s*text\/plain\s*(;|$)/i.test(types[0]) || header('content-disposition').length || encodings.length > 1) return false;
  const text = mailText(encodings[0]?.slice(encodings[0].indexOf(':') + 1), lines.slice(end + 1).join('\r\n'));
  return text !== undefined && !INLINE_FILE.test(text);
}

/**
 * Whether a click opens the file or only shows it in its folder: the result card, the works shelf and an old version
 * all go by this. An Office file that failed the look inside says why, for the card.
 */
export function howToOpen(path: string): { open: true } | { open: false; why?: NotOpened } {
  const ext = extname(path).toLowerCase();
  if (!OPENABLE.has(ext)) return { open: false };
  if (ext === '.eml' || ext === '.ics') {
    const ok = plain(path, ext);
    return ok ? { open: true } : { open: false, why: ok === undefined ? 'unreadable' : 'notPlain' };
  }
  if (!OFFICE.has(ext)) return { open: true };
  const look = officeSafe(path);
  return look.ok ? { open: true } : { open: false, why: look.reason };
}
