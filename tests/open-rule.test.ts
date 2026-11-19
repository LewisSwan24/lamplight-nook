import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { draftEml } from '../app/main/eml';
import { howToOpen } from '../app/main/open-rule';
import { readZip } from '../app/main/office/unzip';
import { zip } from '../app/main/zip';

const FIXTURES = 'tests/fixtures/office';
const dir = mkdtempSync(join(tmpdir(), 'open-rule-'));

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
      expect(howToOpen(join(dir, f)), f).toEqual({ open: true });
    }
  });

  it('opens Word, Excel and PowerPoint files only once a look inside finds nothing that runs or reaches out', () => {
    for (const f of ['sample.docx', 'sample.xlsx', 'sample.pptx']) expect(howToOpen(join(FIXTURES, f)), f).toEqual({ open: true });
    expect(howToOpen(withPart('sample.docx', 'vba.docx', 'word/vbaProject.bin', 'macro'))).toEqual({ open: false, why: 'macros' });
    const broken = join(dir, 'broken.xlsx');
    writeFileSync(broken, 'not a zip');
    expect(howToOpen(broken)).toEqual({ open: false, why: 'unreadable' });
  });

  it('never opens the macro kinds or anything that runs, and gives no reason: they are simply not opened', () => {
    for (const f of ['a.docm', 'a.xlsm', 'a.pptm', 'a.exe', 'a.cmd', 'a.ps1', 'a.lnk', 'a.js', 'noext']) expect(howToOpen(join(dir, f)), f).toEqual({ open: false });
  });

  it('opens an email draft in the mail program and an event in the calendar program, only when they are plain (C5)', () => {
    const file = (name: string, text: string) => (writeFileSync(join(dir, name), text), join(dir, name));
    expect(howToOpen(file('draft.eml', draftEml({ to: ['a@example.com'], subject: '周会', body: 'Hello\nthere' })))).toEqual({ open: true });
    const ev = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:1', 'DTSTART:20261120T090000Z', 'SUMMARY:Tea', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(howToOpen(file('EVENT.ICS', ev('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'END:VALARM')))).toEqual({ open: true });
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
    ]) expect(howToOpen(file(name, text)), name).toEqual({ open: false, why: 'notPlain' });
    expect(howToOpen(join(dir, 'missing.eml'))).toEqual({ open: false, why: 'unreadable' });
  });
});
