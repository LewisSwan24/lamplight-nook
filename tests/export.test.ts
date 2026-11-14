import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { exportName, workEntries } from '../app/main/export';
import { MemoryStore } from '../app/main/memory';
import { zip } from '../app/main/zip';

// Bytes that are not text, so "byte for byte" means something.
const LOGO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a, 0x1a]);

/** A finished work's folder: a page, its styles and picture in subfolders, and a name in Chinese. */
function work() {
  const base = mkdtempSync(join(tmpdir(), 'lamplight-export-'));
  const folder = join(base, 'work');
  mkdirSync(join(folder, 'css'), { recursive: true });
  mkdirSync(join(folder, 'img', 'empty'), { recursive: true });
  writeFileSync(join(folder, 'index.html'), '<link rel="stylesheet" href="css/style.css"><img src="img/logo.png">\r\n');
  writeFileSync(join(folder, 'css', 'style.css'), 'body { color: red }\n');
  writeFileSync(join(folder, 'img', 'logo.png'), LOGO);
  writeFileSync(join(folder, '说明.md'), '# 小网页\n');
  return { base, folder };
}

/** Read a zip back the way an unzip tool does: name -> bytes. */
function unzip(buf: Buffer): Record<string, Buffer> {
  const end = buf.length - 22;
  let at = buf.readUInt32LE(end + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26);
    out[buf.subarray(at + 46, at + 46 + nameLen).toString('utf8')] = inflateRawSync(buf.subarray(start, start + size));
    at += 46 + nameLen;
  }
  return out;
}

describe('taking a work away (road-to-1.1.md A8)', () => {
  it('zips every file of a work in its own folder, in its subfolders, byte for byte', () => {
    const { folder } = work();
    const files = unzip(zip(workEntries(folder)));
    expect(Object.keys(files).sort()).toEqual(['css/style.css', 'img/logo.png', 'index.html', '说明.md']);
    expect(files['img/logo.png'].equals(LOGO)).toBe(true);
    expect(files['index.html'].toString('utf8')).toBe('<link rel="stylesheet" href="css/style.css"><img src="img/logo.png">\r\n');
  });

  it('leaves out a link that leads out of the folder', () => {
    const { base, folder } = work();
    mkdirSync(join(base, 'elsewhere'));
    writeFileSync(join(base, 'elsewhere', 'private.txt'), 'not the work');
    symlinkSync(join(base, 'elsewhere'), join(folder, 'out'), 'junction');
    expect(workEntries(folder).map((e) => e.name)).not.toContain('out/private.txt');
  });

  it('from a folder the user lent, zips only the files the commission touched', () => {
    const { folder } = work();
    writeFileSync(join(folder, 'notes.txt'), 'the user\'s own, never touched');
    const files = unzip(zip(workEntries(folder, ['index.html', 'img/logo.png'])));
    expect(Object.keys(files).sort()).toEqual(['img/logo.png', 'index.html']);
    expect(files['img/logo.png'].equals(LOGO)).toBe(true);
  });

  it('from a lent folder, skips a touched file that is gone since, and one reached through a link out of the folder', () => {
    const { base, folder } = work();
    mkdirSync(join(base, 'elsewhere'));
    writeFileSync(join(base, 'elsewhere', 'private.txt'), 'not the work');
    symlinkSync(join(base, 'elsewhere'), join(folder, 'out'), 'junction');
    rmSync(join(folder, 'css', 'style.css'));
    expect(workEntries(folder, ['index.html', 'css/style.css', 'out/private.txt']).map((e) => e.name)).toEqual(['index.html']);
  });

  it('names the file after the work, with nothing Windows refuses', () => {
    expect(exportName('家庭聚会签到：小网页', 'zip')).toBe('家庭聚会签到-小网页.zip');
    expect(exportName('Expense tracker: v2?', 'pdf')).toBe('Expense tracker- v2.pdf');
  });
});

const fresh = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-touched-')), 'memory.json'));
const lentMemo = (touched: string[]) => ({ title: 'site', result: 'done' as const, choices: {}, folder: '/w/site', form: { want: 'x', inPlace: '/w/site' }, touched });

describe('what a commission in a lent folder touched', () => {
  it('is written down, and each round of changes adds to it', () => {
    const store = fresh();
    const a = store.remember(lentMemo(['index.html', 'pages/contact.html']), []);
    store.revise(a.id, 'one more page', { result: 'done', choices: {}, touched: ['index.html', 'pages/about.html'] }, []);
    expect(store.find(a.id)?.touched).toEqual(['index.html', 'pages/about.html', 'pages/contact.html']);
  });

  it('once undone, is only what could not be put back', () => {
    const store = fresh();
    const a = store.remember(lentMemo(['index.html', 'pages/contact.html']), []);
    store.undone(a.id, []);
    expect(store.find(a.id)?.touched).toEqual([]);
    store.undone(a.id, ['linked/a.html']);
    expect(store.find(a.id)?.touched).toEqual(['linked/a.html']);
  });

  it('the shelf knows which works are web pages, so they can be saved as a PDF', () => {
    const store = fresh();
    store.remember({ ...lentMemo([]), title: 'notes', main: 'notes.md' }, []);
    store.remember({ ...lentMemo([]), title: 'page', main: 'pages/contact.html' }, []);
    store.remember({ ...lentMemo([]), title: 'nothing' }, []);
    expect(store.shopState().works.map((w) => [w.title, w.page])).toEqual([['nothing', false], ['page', true], ['notes', false]]);
  });
});
