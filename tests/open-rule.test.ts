import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DraftRecord } from '../app/main/drafts';
import { draftEml } from '../app/main/eml';
import { howToOpen } from '../app/main/open-rule';
import { readZip } from '../app/main/office/unzip';
import { zip } from '../app/main/zip';

const FIXTURES = 'tests/fixtures/office';
const dir = mkdtempSync(join(tmpdir(), 'open-rule-'));
const drafts = new DraftRecord(join(dir, 'drafts.json'));
/** A mail put on the record of drafts, as the draft tool does when it writes one (road-to-1.4.md). */
const howToOpenHere = (path: string) => howToOpen(path, drafts);
const ours = (text: string) => (drafts.add(text), text);

/** A copy of an Office-saved fixture with one more part, saved as `name`. */
function withPart(fixture: string, name: string, part: string, data: string): string {
  const parts = [...readZip(readFileSync(join(FIXTURES, fixture)))].map(([n, read]) => ({ name: n, data: read() }));
  const file = join(dir, name);
  writeFileSync(file, zip([...parts, { name: part, data: Buffer.from(data) }]));
  return file;
}

/** What opens with a click from the result card, the works shelf and an old version (road-to-1.3.md C1). */
describe('howToOpen', () => {
  it('opens pages, text, tables, pictures and PDFs as before, without looking inside', () => {
    for (const f of ['a.html', 'a.HTM', 'a.md', 'a.txt', 'a.csv', 'a.json', 'a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.pdf']) {
      expect(howToOpenHere(join(dir, f)), f).toEqual({ open: true });
    }
  });

  it('opens Word, Excel and PowerPoint files only once a look inside finds nothing that runs or reaches out', () => {
    for (const f of ['sample.docx', 'sample.xlsx', 'sample.pptx']) expect(howToOpenHere(join(FIXTURES, f)), f).toEqual({ open: true });
    expect(howToOpenHere(withPart('sample.docx', 'vba.docx', 'word/vbaProject.bin', 'macro'))).toEqual({ open: false, why: 'macros' });
    const broken = join(dir, 'broken.xlsx');
    writeFileSync(broken, 'not a zip');
    expect(howToOpenHere(broken)).toEqual({ open: false, why: 'unreadable' });
  });

  it('never opens the macro kinds or anything that runs, and gives no reason: they are simply not opened', () => {
    for (const f of ['a.docm', 'a.xlsm', 'a.pptm', 'a.exe', 'a.cmd', 'a.ps1', 'a.lnk', 'a.js', 'noext']) expect(howToOpenHere(join(dir, f)), f).toEqual({ open: false });
  });

  it('opens an email draft in the mail program and an event in the calendar program, only when they are plain (C5)', () => {
    const file = (name: string, text: string | Buffer) => (writeFileSync(join(dir, name), text), join(dir, name));
    expect(howToOpenHere(file('draft.eml', ours(draftEml({ to: ['a@example.com'], subject: '周会', body: 'Hello\nthere' }))))).toEqual({ open: true });
    const ev = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:1', 'DTSTART:20261120T090000Z', 'SUMMARY:Tea', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(howToOpenHere(file('EVENT.ICS', ev('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'END:VALARM')))).toEqual({ open: true });
    // What a calendar program writes for an ordinary event, time zone and all.
    const full = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//x//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Plans',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Shanghai', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800', 'TZNAME:CST', 'END:STANDARD', 'END:VTIMEZONE',
      'BEGIN:VEVENT', 'UID:2', 'DTSTAMP:20261120T000000Z', 'DTSTART;TZID=Asia/Shanghai:20261120T090000', 'DTEND;TZID=Asia/Shanghai:20261120T100000',
      'SUMMARY:读书会', 'DESCRIPTION:第一章，一段很长的说明', ' 折到了下一行', 'LOCATION:Room 2', 'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE;TZID=Asia/Shanghai:20261127T090000', 'STATUS:CONFIRMED',
      'TRANSP:OPAQUE', 'SEQUENCE:0', 'CATEGORIES:Reading', 'URL:https://example.com/club', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(howToOpenHere(file('full.ics', full))).toEqual({ open: true });
    expect(howToOpenHere(file('qp.eml', ours('To: a@example.com\r\nSubject: x\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nhi =E4=BD=A0 and a long line that goes on=\r\n and on\r\n')))).toEqual({ open: true });
    expect(howToOpenHere(file('ascii.eml', ours('To: a@example.com\r\nSubject: x\r\nContent-Type: text/plain; charset=us-ascii\r\n\r\nhi\r\n')))).toEqual({ open: true });
    // A mail with attachments, a page or no type of its own, and an event that brings a file or starts a program.
    const head = 'To: a@example.com\r\nSubject: x\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\n';
    for (const [name, text] of [
      ['multi.eml', `${head}Content-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nhi\r\n--b--\r\n`],
      ['page.eml', `${head}Content-Type: text/html; charset=utf-8\r\n\r\n<a href="http://x">hi</a>\r\n`],
      ['bare.eml', `${head}\r\nhi\r\n`],
      ['attached.eml', `${head}Content-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="a.exe"\r\n\r\nTVqQ\r\n`],
      ['text-attached.eml', `${head}Content-Type: text/plain\r\nContent-Disposition: attachment; filename="run.cmd"\r\n\r\nstart calc\r\n`],
      ['folded.eml', `${head}Content-Type:\r\n multipart/mixed; boundary="b"\r\n\r\n--b--\r\n`],
      ['attach.ics', ev('ATTACH:https://example.com/a.exe')],
      ['run.ics', ev('BEGIN:VALARM', 'ACTION:PROCEDURE', 'ATTACH;VALUE=URI:file:///C:/a.exe', 'END:VALARM')],
      ['folded.ics', ev('BEGIN:VALARM', 'ACTION:PROC', ' EDURE', 'END:VALARM')],
      // Read another way by the program that opens it: a second type, an attachment written into the text, line
      // breaks of a bare CR, another encoding, a NUL, or no calendar at all.
      ['two-types.eml', `${head}Content-Type: text/plain\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b--\r\n`],
      ['uuencoded.eml', `${head}Content-Type: text/plain; charset=utf-8\r\n\r\nSee below\r\nbegin 644 run.exe\r\nM35J0\r\nend\r\n`],
      ['cr.eml', `${head}Content-Type: text/plain\rContent-Disposition: attachment; filename="a.cmd"\r\r\nhi\r\n`],
      ['cr.ics', ev('ATTACH:https://example.com/a.exe').replace(/\r\n/g, '\r')],
      ['utf16.ics', Buffer.from(String.fromCharCode(0xfeff) + ev('ATTACH:https://example.com/a.exe'), 'utf16le')],
      ['nul.ics', ev('SUMMARY:a\u0000b')],
      ['notcal.ics', 'hello'],
      // Hidden one layer down: an attachment inside the base64 or quoted-printable text, another transfer encoding, a
      // bare CR anywhere, and calendar properties outside what the shop's events use.
      ['b64-uu.eml', `${head}Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('hi\r\nbegin 644 run.exe\r\nM35J0\r\nend\r\n').toString('base64')}\r\n`],
      ['qp-yenc.eml', `${head}Content-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nhi\r\n=3Dybegin line=3D128 size=3D4 name=3Drun.exe\r\n`],
      ['b64-mime.eml', `${head}Content-Type: text/plain\r\n\r\nhi\r\nbegin-base64 644 run.exe\r\nTVqQ\r\n====\r\n`],
      ['uue.eml', `${head}Content-Type: text/plain\r\nContent-Transfer-Encoding: x-uuencode\r\n\r\nM35J0\r\n`],
      ['bare-cr-body.eml', `${head}Content-Type: text/plain\r\n\r\nhi\rthere\r\n`],
      ['old-alarm.ics', ev('PALARM:20261120T085000Z;PT5M;2;C:\\a.exe')],
      ['attendee.ics', ev('ATTENDEE:mailto:someone@example.com')],
      ['audio.ics', ev('BEGIN:VALARM', 'ACTION:AUDIO', 'TRIGGER:-PT15M', 'END:VALARM')],
      ['no-version.ics', ev().replace('VERSION:2.0\r\n', '')],
      // Decoded another way by a looser program: another character set, two of them, a quoted-printable break with
      // spaces before it, an equals sign with nothing after, and base64 that goes on past its padding.
      ['utf7.eml', `${head}Content-Type: text/plain; charset=utf-7\r\n\r\n+AGI-egin 644 run.exe\r\n`],
      ['loose-charset.eml', `${head}Content-Type: text/plain; charset="utf-7\r\n\r\nhi\r\n`],
      ['two-charsets.eml', `${head}Content-Type: text/plain; charset=utf-8; charset="utf-7"\r\n\r\nhi\r\n`],
      ['qp-space.eml', `${head}Content-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nbeg= \r\nin 644 run.exe\r\nM35J0\r\n`],
      ['qp-bare.eml', `${head}Content-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nprice =ZZ\r\n`],
      ['b64-padded.eml', `${head}Content-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\naGk=\r\n${Buffer.from('begin 644 run.exe\r\nM35J0\r\nend\r\n').toString('base64')}\r\n`],
      ['todo.ics', ev().replace('BEGIN:VEVENT', 'BEGIN:VTODO').replace('END:VEVENT', 'END:VTODO')],
      ['no-body.eml', `${head}Content-Type: text/plain\r\nContent-Disposition: attachment; filename="a.cmd"`],
      ['two-encodings.eml', `${head}Content-Type: text/plain\r\nContent-Transfer-Encoding: 7bit\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('begin 644 run.exe\r\nM35J0\r\nend\r\n').toString('base64')}\r\n`],
    ] as [string, string | Buffer][]) expect(howToOpenHere(file(name, text)), name).toEqual({ open: false, why: 'notPlain' });
    expect(howToOpenHere(join(dir, 'missing.eml'))).toEqual({ open: false, why: 'unreadable' });
  });

  it("opens a mail only when the shop's draft tool wrote it, byte for byte; an event goes by its contents alone", () => {
    const file = (name: string, text: string) => (writeFileSync(join(dir, name), text), join(dir, name));
    // Plain, but written some other way: by the staff with their own tools, or put in the folder by anyone.
    const plainMail = 'To: a@example.com\r\nSubject: x\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhi\r\n';
    expect(howToOpenHere(file('theirs.eml', plainMail))).toEqual({ open: false, why: 'notOurs' });
    // The tool's own draft, changed afterwards.
    const mine = ours(draftEml({ to: ['a@example.com'], subject: 'Tea', body: 'At four' }));
    expect(howToOpenHere(file('mine.eml', mine))).toEqual({ open: true });
    expect(howToOpenHere(file('mine.eml', mine.replace('\r\n\r\n', '\r\nX-Note: changed\r\n\r\n')))).toEqual({ open: false, why: 'notOurs' });
    // Not plain is still said first, on the record or not.
    expect(howToOpenHere(file('page.eml', ours(plainMail.replace('text/plain', 'text/html'))))).toEqual({ open: false, why: 'notPlain' });
  });
});
