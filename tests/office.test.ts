import { linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeDocx } from '../app/main/office/docx';
import { imageFile, outputPath } from '../app/main/office/paths';
import { makePptx } from '../app/main/office/pptx';
import { previewHtml } from '../app/main/office/preview';
import { PDF_HINT, readDocument } from '../app/main/office/read';
import type { DocSpec, SheetSpec, SlideSpec } from '../app/main/office/specs';
import { readZip, ZipError } from '../app/main/office/unzip';
import { makeXlsx } from '../app/main/office/xlsx';
import { zip } from '../app/main/zip';

const FIXTURES = 'tests/fixtures/office';
const folder = () => mkdtempSync(join(tmpdir(), 'office-'));

/** A plain w x h PNG, one colour: enough for Word, PowerPoint and the size reader. */
function png(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A commission folder with a picture in it, and the file a writer made, saved there. */
function shop() {
  const dir = folder();
  mkdirSync(join(dir, 'pics'));
  writeFileSync(join(dir, 'pics', 'cat.png'), png(40, 20));
  return { dir, images: (rel: string) => imageFile(dir, rel), save: (name: string, buf: Buffer) => (writeFileSync(join(dir, name), buf), join(dir, name)) };
}

const doc: DocSpec = {
  title: 'Spring report',
  blocks: [
    { h: 1, text: 'Overview' },
    { p: 'Sales were **up** and *steady* this month.' },
    { list: ['Tea', 'Cake'] },
    { list: ['Open the door', 'Light the lamp'], ordered: true },
    { table: { head: ['Item', 'Count'], rows: [['Tea', '3'], ['Jam | small', '1']] } },
    { image: 'pics/cat.png', caption: 'The shop cat' },
    { pageBreak: true },
    { h: 2, text: 'Next steps' },
    { p: '这是一行中文。' },
    { h: 3, text: 'Small print' },
  ],
};

const sheet: SheetSpec = {
  sheets: [
    {
      name: 'Sales',
      columns: [{ header: 'Item', width: 20 }, { header: 'Amount', format: 'money' }, { header: 'When', format: 'date' }, { header: 'Share', format: 'percent' }],
      rows: [['Tea', 12.5, '2026-11-19', 0.25], ['Jam, small', 4, '2026-01-02', 0.5], ['Say "hi"', 1], ['Total', { f: '=SUM(B2:B4)' }]],
      freezeHeader: true,
    },
    { name: 'Notes', columns: [{ header: 'Line', format: 'text' }, { header: 'Count', format: 'number' }], rows: [['中文', 7]] },
  ],
};

const slides: SlideSpec = {
  title: 'Spring menu',
  accent: '#2F6FDE',
  slides: [
    { layout: 'title', title: 'Spring menu', bullets: ['Lamplight Nook'] },
    { layout: 'bullets', title: 'What is new', bullets: ['Lemon tart', 'Hot chocolate'], notes: 'Mention the tart first.' },
    { layout: 'two', title: 'Then and now', bullets: ['Old menu'], right: ['New menu', '中文'] },
    { layout: 'image', title: 'The cat', image: 'pics/cat.png' },
  ],
};

describe('writing and reading back', () => {
  it('a document keeps its headings, paragraphs, lists and table', async () => {
    const s = shop();
    const file = s.save('report.docx', await makeDocx(doc, s.images));
    expect(readDocument(file)).toBe([
      '# Spring report',
      '',
      '# Overview',
      '',
      'Sales were up and steady this month.',
      '',
      '- Tea',
      '- Cake',
      '- Open the door',
      '- Light the lamp',
      '',
      '| Item | Count |',
      '| --- | --- |',
      '| Tea | 3 |',
      '| Jam \\| small | 1 |',
      '',
      'The shop cat',
      '',
      '## Next steps',
      '',
      '这是一行中文。',
      '',
      '### Small print',
    ].join('\n'));
  });

  it('a workbook keeps every sheet, its cells and its formula', () => {
    const s = shop();
    const buf = makeXlsx(sheet);
    const file = s.save('sales.xlsx', buf);
    expect(readZip(buf).get('xl/worksheets/sheet1.xml')!().toString()).toContain('<f>SUM(B2:B4)</f>');
    expect(readDocument(file)).toBe([
      '## Sales',
      'Item,Amount,When,Share',
      'Tea,12.5,2026-11-19,0.25',
      '"Jam, small",4,2026-01-02,0.5',
      '"Say ""hi""",1',
      'Total,=SUM(B2:B4)',
      '',
      '## Notes',
      'Line,Count',
      '中文,7',
    ].join('\n'));
  });

  it('a deck keeps slide titles, bullets and speaker notes', async () => {
    const s = shop();
    const file = s.save('menu.pptx', await makePptx(slides, s.images));
    expect(readDocument(file)).toBe([
      '## Slide 1: Spring menu',
      'Lamplight Nook',
      '',
      '## Slide 2: What is new',
      'Lemon tart',
      'Hot chocolate',
      'Notes: Mention the tart first.',
      '',
      '## Slide 3: Then and now',
      'Old menu',
      'New menu',
      '中文',
      '',
      '## Slide 4: The cat',
    ].join('\n'));
  });

  it('refuses a formula that would fetch, run or reach another file, and keeps ordinary ones', () => {
    const sheet = (f: string): SheetSpec => ({ sheets: [{ name: 'S', columns: [{ header: 'A' }], rows: [[{ f }]] }] });
    for (const f of ['=WEBSERVICE("http://example.com")', "=cmd|'/c calc'!A0", '=[Book2.xlsx]Sheet1!A1', "='C:\\x\\[b.xlsx]S'!A1",
      '=FILTERXML(A1,"//a")', '=CALL("kernel32","WinExec","JCJ","calc",0)', '=REGISTER.ID("a","b")', '=RTD("x",,"y")', '=IMPORTXML("http://x","//a")']) {
      expect(() => makeXlsx(sheet(f)), f).toThrow(/formula/i);
    }
    for (const f of ['=SUM(B2:B20)', '=IF(A1>0,"yes","no")', '=Sheet2!A1*2', '=VLOOKUP(A1,Sheet2!A:B,2,FALSE)', '=HYPERLINK("https://example.com","site")']) {
      expect(() => makeXlsx(sheet(f)), f).not.toThrow();
    }
  });

  it('checks the formula exactly as it is written: hidden characters, quoted sheet names and open quotes', () => {
    const sheet = (f: string): SheetSpec => ({ sheets: [{ name: 'S', columns: [{ header: 'A' }], rows: [[{ f }]] }] });
    const ctrl = String.fromCharCode(1);
    for (const f of [
      `=WEB${ctrl}SERVICE("http://example.com")`,
      `=WEB${String.fromCharCode(0xfffe)}SERVICE("http://example.com")`,
      `='a"b'!A1&WEBSERVICE("http://example.com")&'c"d'!A1`,
      "='C:\\x\\[b.xlsx]S'!A1",
      '="a|b"&A1',
    ]) expect(() => makeXlsx(sheet(f)), JSON.stringify(f)).toThrow(/formula/i);
    for (const f of ["='My Sheet'!A1*2", "='It''s'!A1", '="say ""hi"""']) expect(() => makeXlsx(sheet(f)), f).not.toThrow();
  });

  it('a long sheet is cut at 2,000 rows and 50 columns, and says so', () => {
    const s = shop();
    const columns = Array.from({ length: 60 }, (_, i) => ({ header: `C${i + 1}` }));
    const rows = Array.from({ length: 2100 }, (_, r) => Array.from({ length: 60 }, (_, c) => r * 100 + c));
    const text = readDocument(s.save('wide.xlsx', makeXlsx({ sheets: [{ name: 'Big', columns, rows }] })));
    const lines = text.split('\n');
    expect(lines.filter((l) => /^\d/.test(l))).toHaveLength(1999); // 2,000 rows, the header among them
    expect(lines[1].split(',')).toHaveLength(50);
    expect(text).toContain('Showing the first 2000 of 2101 rows and 50 of 60 columns.');
  });

  it('a PDF is left to Read, and anything else is refused', () => {
    expect(readDocument('/w/c1/brief.pdf')).toBe(PDF_HINT);
    expect(PDF_HINT).toMatch(/Read tool.*pages/);
    expect(() => readDocument('/w/c1/notes.txt')).toThrow(/docx, \.xlsx and \.pptx/);
  });
});

describe('Office-saved files', () => {
  for (const name of ['sample.docx', 'sample.xlsx', 'sample.pptx']) {
    it(`reads ${name} as before`, () => {
      expect(readDocument(join(FIXTURES, name))).toMatchSnapshot();
    });
  }
});

describe('pictures come only from the commission folder', () => {
  it('takes one inside, by a path relative to the folder', () => {
    const s = shop();
    expect(imageFile(s.dir, 'pics/cat.png').subarray(1, 4).toString()).toBe('PNG');
  });

  it('refuses one outside, a way out with .., an absolute path and a link that leads out', () => {
    const s = shop();
    const outside = folder();
    writeFileSync(join(outside, 'secret.png'), png(2, 2));
    symlinkSync(outside, join(s.dir, 'door'), 'junction');
    expect(() => imageFile(s.dir, '../secret.png')).toThrow(/outside the commission folder/);
    expect(() => imageFile(s.dir, join(outside, 'secret.png'))).toThrow(/relative path/);
    expect(() => imageFile(s.dir, 'door/secret.png')).toThrow(/outside the commission folder/);
  });

  it('refuses what is not a picture', () => {
    const s = shop();
    writeFileSync(join(s.dir, 'notes.txt'), 'hi');
    expect(() => imageFile(s.dir, 'notes.txt')).toThrow(/\.png, \.jpg, \.jpeg or \.gif/);
  });

  it('a writer asked for a picture outside fails rather than reaching it', async () => {
    const s = shop();
    await expect(makeDocx({ blocks: [{ image: '../x.png' }] }, s.images)).rejects.toThrow(/outside the commission folder/);
    await expect(makePptx({ title: 't', slides: [{ layout: 'image', title: 't', image: '../x.png' }] }, s.images)).rejects.toThrow(/outside the commission folder/);
  });
});

describe('where a made file may go', () => {
  it('inside the folder, with the right extension, as a new file', () => {
    const dir = folder();
    expect(outputPath(dir, 'out/report.docx', '.docx', new Set())).toBe(resolve(dir, 'out/report.docx'));
    expect(outputPath(dir, 'Sales.XLSX', '.xlsx', new Set())).toBe(resolve(dir, 'Sales.XLSX'));
  });

  it('refuses a path out of the folder, a wrong extension and a file that was already there', () => {
    const dir = folder();
    writeFileSync(join(dir, 'mine.docx'), 'the user\'s own');
    expect(() => outputPath(dir, '../report.docx', '.docx', new Set())).toThrow(/outside the commission folder/);
    expect(() => outputPath(dir, join(folder(), 'report.docx'), '.docx', new Set())).toThrow(/outside the commission folder/);
    expect(() => outputPath(dir, 'report.xlsx', '.docx', new Set())).toThrow(/must end in \.docx/);
    expect(() => outputPath(dir, 'mine.docx', '.docx', new Set([join(dir, 'mine.docx')]))).toThrow(/already there/);
    // The same file under another spelling, or through a link: still the user's own.
    if (process.platform === 'win32') expect(() => outputPath(dir, 'MINE.DOCX', '.docx', new Set([join(dir, 'mine.docx')]))).toThrow(/already there/);
    linkSync(join(dir, 'mine.docx'), join(dir, 'alias.docx'));
    expect(() => outputPath(dir, 'alias.docx', '.docx', new Set([join(dir, 'mine.docx')]))).toThrow(/already there/);
    // What this round made itself may be written again.
    writeFileSync(join(dir, 'new.docx'), 'made this round');
    expect(outputPath(dir, 'new.docx', '.docx', new Set([join(dir, 'mine.docx')]))).toBe(join(dir, 'new.docx'));
  });
});

describe('unpacking limits', () => {
  const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `part${i}.xml`, data: '<a/>' }));

  it('refuses a package with too many entries before unpacking any', () => {
    expect(() => readZip(zip(entries(6)), { entries: 5, bytes: 1e6 })).toThrow(ZipError);
    expect(() => readZip(zip(entries(5)), { entries: 5, bytes: 1e6 })).not.toThrow();
    const dir = folder();
    writeFileSync(join(dir, 'many.docx'), zip(entries(5_001)));
    expect(() => readDocument(join(dir, 'many.docx'))).toThrow(/more than 5000/);
  });

  it('refuses a package that says it unpacks to too much, before unpacking any', () => {
    const big = zip([{ name: 'word/document.xml', data: Buffer.alloc(2 * 1024 * 1024) }]);
    expect(() => readZip(big, { entries: 10, bytes: 1024 * 1024 })).toThrow(/more than 1048576 bytes/);
  });

  it('stops an entry that unpacks to more than it says', () => {
    const real = Buffer.alloc(1024 * 1024);
    const lying = zip([{ name: 'word/document.xml', data: real }]);
    // Both headers claim 100 bytes.
    lying.writeUInt32LE(100, 22);
    lying.writeUInt32LE(100, lying.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
    const entry = readZip(lying).get('word/document.xml')!;
    expect(entry).toThrow(ZipError);
    expect(() => entry()).toThrow(/more than it says/);
  });

  it('refuses two entries of the same name, in any case, and a local header naming another entry', () => {
    expect(() => readZip(zip([{ name: 'word/a.xml', data: '<a/>' }, { name: 'Word/A.xml', data: '<b/>' }]))).toThrow(ZipError);
    const buf = zip([{ name: 'word/a.xml', data: '<a/>' }]);
    // The local header comes first, so the first match is its copy of the name.
    buf.write('word/b.xml', buf.indexOf('word/a.xml'), 'latin1');
    expect(() => readZip(buf).get('word/a.xml')!()).toThrow(ZipError);
  });

  it('a file that is not a zip is unreadable', () => {
    expect(() => readZip(Buffer.from('not a zip at all, just words'))).toThrow(/not a zip/);
  });
});

describe('previews', () => {
  it('are one self-contained page with the content, pictures inlined and no script or outside address', async () => {
    const s = shop();
    const pages = [[previewHtml('docx', doc, s.images), 'Overview'], [previewHtml('xlsx', sheet, s.images), 'Jam, small'], [previewHtml('pptx', slides, s.images), 'Spring menu']];
    for (const [html, expected] of pages) {
      expect(html).toContain(expected);
      expect(html).not.toMatch(/<script|https?:/i);
    }
    expect(previewHtml('docx', doc, s.images)).toContain('src="data:image/png;base64,');
    expect(previewHtml('pptx', { title: 't', slides: [{ layout: 'image', title: 'Cat', image: 'pics/cat.png' }] }, s.images)).toContain('src="data:image/png;base64,');
  });
});
