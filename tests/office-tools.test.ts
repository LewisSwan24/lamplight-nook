import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { nookName, toolsByName, type ToolCtx } from '../app/main/nook-tools';
import { MAX_PREVIEW_RUNS, officeServer, prunePreviews, thumbSource } from '../app/main/office/tools';
import { readDocument } from '../app/main/office/read';
import { zip } from '../app/main/zip';

const FIXTURES = 'tests/fixtures/office';

/** A commission folder with one file of the user's in it, the data folder's previews, and the server for a round. */
function round(run = 'r1760000000000') {
  const root = mkdtempSync(join(tmpdir(), 'office-tools-'));
  const workDir = join(root, 'work');
  const previews = join(root, 'previews');
  mkdirSync(join(workDir, 'materials'), { recursive: true });
  copyFileSync(join(FIXTURES, 'sample.docx'), join(workDir, 'materials', 'sample.docx'));
  writeFileSync(join(workDir, 'mine.docx'), 'theirs');
  const printed: [string, string][] = [];
  const server = officeServer({ previews, toPdf: async (folder, file) => { printed.push([folder, file]); return Buffer.from('%PDF-1.7 test'); } });
  const ctx: ToolCtx = { run, workDir, signal: new AbortController().signal, preexisting: new Set([join(workDir, 'mine.docx'), join(workDir, 'materials', 'sample.docx')]) };
  const call = (tool: string, input: unknown) => server.tools.find((t) => t.name === tool)!.run(input, ctx);
  const said = async (tool: string, input: unknown) => ((await call(tool, input)).content[0] as { text: string }).text;
  return { root, workDir, previews, printed, server, ctx, call, said };
}

const doc = { title: 'Notice', blocks: [{ h: 1 as const, text: 'Opening hours' }, { p: 'We open at **nine**.' }] };
const sheet = { sheets: [{ name: 'Costs', columns: [{ header: 'Item' }, { header: 'Amount', format: 'money' as const }], rows: [['Tea', 3], ['Cake', 4], ['Total', { f: 'SUM(B2:B3)' }]] }] };
const deck = { title: 'Spring', slides: [{ layout: 'title' as const, title: 'Spring menu' }, { layout: 'bullets' as const, title: 'New', bullets: ['Lemon tart'] }] };

describe('the shop\'s office server (road-to-1.3.md C1)', () => {
  it('is nook-office with five tools: read_document reads, the make_ tools make', () => {
    const { server } = round();
    expect(server.name).toBe('office');
    expect(server.connection).toBeUndefined();
    expect(Object.fromEntries(server.tools.map((t) => [t.name, t.kind]))).toEqual({ read_document: 'read', make_docx: 'make', make_xlsx: 'make', make_pptx: 'make', make_pdf: 'make' });
    expect([...toolsByName([server]).keys()]).toContain(nookName('office', 'make_docx'));
  });

  it('read_document hands back the text of a file in the commission folder, as readDocument reads it', async () => {
    const { said, workDir } = round();
    expect(await said('read_document', { file: 'materials/sample.docx' })).toBe(readDocument(join(workDir, 'materials', 'sample.docx')));
  });

  it('read_document reads nothing outside the commission folder', async () => {
    const { call } = round();
    await expect(call('read_document', { file: resolve(FIXTURES, 'sample.docx') })).rejects.toThrow(/outside the commission folder/);
    await expect(call('read_document', { file: '../work2/a.docx' })).rejects.toThrow(/outside the commission folder/);
  });

  it('read_document says when a file is too big to read, or cannot be read at all', async () => {
    const { said, workDir } = round();
    writeFileSync(join(workDir, 'many.docx'), zip(Array.from({ length: 5_001 }, (_, i) => ({ name: `part${i}.xml`, data: '<a/>' }))));
    writeFileSync(join(workDir, 'broken.xlsx'), 'not a zip at all');
    expect(await said('read_document', { file: 'many.docx' })).toMatch(/too big to read/);
    expect(await said('read_document', { file: 'broken.xlsx' })).toMatch(/cannot be read/);
  });

  it('make_docx, make_xlsx and make_pptx write the file in the folder, keep a preview page for the card and name the file', async () => {
    const { said, workDir, previews } = round();
    expect(await said('make_docx', { file: 'notice.docx', ...doc })).toMatch(/notice\.docx/);
    expect(await said('make_xlsx', { file: 'out/costs.xlsx', ...sheet })).toMatch(/costs\.xlsx/);
    expect(await said('make_pptx', { file: 'spring.pptx', ...deck })).toMatch(/spring\.pptx/);
    expect(readDocument(join(workDir, 'notice.docx'))).toContain('Opening hours');
    expect(readDocument(join(workDir, 'out', 'costs.xlsx'))).toContain('=SUM(B2:B3)');
    expect(readDocument(join(workDir, 'spring.pptx'))).toContain('Spring menu');
    const run = join(previews, 'r1760000000000');
    expect(readdirSync(run).sort()).toEqual(['costs.xlsx.html', 'notice.docx.html', 'spring.pptx.html']);
    expect(readFileSync(join(run, 'notice.docx.html'), 'utf8')).toContain('Opening hours');
  });

  it('the make_ tools never write outside the folder or over a file that was there before the round', async () => {
    const { call, root, workDir } = round();
    await expect(call('make_docx', { file: join(root, 'away.docx'), ...doc })).rejects.toThrow(/outside the commission folder/);
    await expect(call('make_docx', { file: 'mine.docx', ...doc })).rejects.toThrow(/already there/);
    expect(readFileSync(join(workDir, 'mine.docx'), 'utf8')).toBe('theirs');
    await expect(call('make_xlsx', { file: 'costs.csv', ...sheet })).rejects.toThrow(/must end in \.xlsx/);
  });

  it('make_pdf saves a page in the folder as a PDF, printed from that folder, and its preview is that page', async () => {
    const { said, call, workDir, previews, printed, root } = round();
    writeFileSync(join(workDir, 'cv.html'), '<h1>CV</h1>');
    expect(await said('make_pdf', { page: 'cv.html', file: 'cv.pdf' })).toMatch(/cv\.pdf/);
    expect(printed).toEqual([[workDir, join(workDir, 'cv.html')]]);
    expect(readFileSync(join(workDir, 'cv.pdf'), 'utf8')).toBe('%PDF-1.7 test');
    expect(readFileSync(join(previews, 'r1760000000000', 'cv.pdf.page'), 'utf8')).toBe(join(workDir, 'cv.html'));
    writeFileSync(join(root, 'away.html'), 'x');
    await expect(call('make_pdf', { page: join(root, 'away.html'), file: 'away.pdf' })).rejects.toThrow(/outside the commission folder/);
    await expect(call('make_pdf', { page: 'cv.html', file: join(root, 'cv.pdf') })).rejects.toThrow(/outside the commission folder/);
    expect(printed.length).toBe(1);
  });

  it('labels every call in a plain sentence naming the file, in both languages', () => {
    const { server } = round();
    for (const S of Object.values(LOCALES)) {
      for (const k of ['readDocument', 'makeDocx', 'makeXlsx', 'makePptx', 'makePdf']) expect((S.ui.office as Record<string, string>)[k], k).toContain('{file}');
    }
    for (const t of server.tools) expect(t.label({ file: 'notice.docx', page: 'cv.html' }), t.name).toContain('notice.docx');
  });
});

describe('what the result card\'s thumbnail is taken from (C1)', () => {
  it('a page is photographed where it is, a picture shrunk, and a made Office file or PDF through its preview', async () => {
    const { said, workDir, previews, ctx } = round();
    writeFileSync(join(workDir, 'cv.html'), '<h1>CV</h1>');
    await said('make_docx', { file: 'notice.docx', ...doc });
    await said('make_pdf', { page: 'cv.html', file: 'cv.pdf' });
    const src = (main: string) => thumbSource(join(workDir, main), workDir, previews, ctx.run);
    expect(src('index.html')).toEqual({ page: join(workDir, 'index.html'), folder: workDir });
    expect(src('photo.PNG')).toEqual({ image: join(workDir, 'photo.PNG') });
    expect(src('notice.docx')).toEqual({ page: join(previews, ctx.run, 'notice.docx.html'), folder: join(previews, ctx.run), preview: true });
    expect(src('cv.pdf')).toEqual({ page: join(workDir, 'cv.html'), folder: workDir });
    // Handed over, or written some other way this round: no picture, just the name.
    expect(src('materials/sample.docx')).toBeNull();
    expect(thumbSource(join(workDir, 'notice.docx'), workDir, previews, 'r1')).toBeNull();
    expect(src('notes.md')).toBeNull();
  });

  it('keeps the previews of the newest runs only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'previews-'));
    for (let i = 0; i < MAX_PREVIEW_RUNS + 3; i++) {
      mkdirSync(join(dir, `r17600000000${String(i).padStart(2, '0')}`));
      writeFileSync(join(dir, `r17600000000${String(i).padStart(2, '0')}`, 'a.docx.html'), 'x');
    }
    prunePreviews(dir);
    const left = readdirSync(dir).sort();
    expect(left.length).toBe(MAX_PREVIEW_RUNS);
    expect(left[0]).toBe('r1760000000003');
    expect(existsSync(join(dir, 'r1760000000000'))).toBe(false);
  });
});
