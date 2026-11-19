import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
});
