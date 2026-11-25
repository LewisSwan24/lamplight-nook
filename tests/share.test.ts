import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { saveBytes } from '../app/main/folder-link';
import { scrub, shareBytes, shareFormats, singlePage } from '../app/main/share';

// Sharing a work (docs/plan-1.5.md E2): a format that suits the work, a page as one file with nothing from outside,
// and nothing in what goes out that points back at the computer.

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5ff0000000049454e44ae426082', 'hex');
const KEY = 'sk-ant-api03-AbCdEf_123-xyz';

/** The entries of a zip the shop wrote (deflate, no folders). */
function unzip(z: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = [];
  for (let at = 0; z.readUInt32LE(at) === 0x04034b50;) {
    const size = z.readUInt32LE(at + 18), nameLen = z.readUInt16LE(at + 26), extra = z.readUInt16LE(at + 28);
    const start = at + 30 + nameLen + extra;
    out.push({ name: z.toString('utf8', at + 30, at + 30 + nameLen), data: inflateRawSync(z.subarray(start, start + size)) });
    at = start + size;
  }
  return out;
}

function work() {
  const root = mkdtempSync(join(tmpdir(), 'lamplight-share-'));
  const folder = join(root, 'work');
  mkdirSync(join(folder, 'look'), { recursive: true });
  writeFileSync(join(root, 'outside.css'), 'h1::before { content: "FROMOUTSIDE"; }');
  writeFileSync(join(folder, 'look', 'look.css'), 'body { background: url(bg.png); } h1::after { content: "FROMSTYLE"; } @import url("https://far.example/x.css");');
  writeFileSync(join(folder, 'look', 'bg.png'), PNG);
  writeFileSync(join(folder, 'logo.png'), PNG);
  writeFileSync(join(folder, 'app.js'), 'window.FROMSCRIPT = 1;');
  writeFileSync(join(folder, 'index.html'), [
    '<!doctype html><html><head>',
    '<link rel="stylesheet" href="look/look.css">',
    `<link rel="stylesheet" href="${pathToFileURL(join(root, 'outside.css')).href}">`,
    '<link rel="stylesheet" href="http://far.example/far.css">',
    '<script src="//cdn.example/lib.js"></script>',
    '<script src="app.js"></script>',
    '</head><body><h1>Hello</h1>',
    '<img src="logo.png" alt="logo"><img src="https://far.example/pic.png" alt="far">',
    '<div style="background: url(\'https://far.example/bg.png\')"></div>',
    `<p>Made in ${folder}</p><a href="https://example.org/">a link</a>`,
    '</body></html>',
  ].join('\n'));
  return { root, folder };
}

describe('the format a work is shared in', () => {
  it('offers the one that suits the work first', () => {
    expect(shareFormats('index.html')).toEqual(['pdf', 'page', 'zip']);
    expect(shareFormats('report.docx')).toEqual(['file', 'zip']);
    expect(shareFormats('deck.pptx')).toEqual(['file', 'zip']);
    expect(shareFormats('chart.PNG')).toEqual(['file', 'zip']);
    expect(shareFormats('notes.md')).toEqual(['file', 'zip']);
    expect(shareFormats('tool.py')).toEqual(['zip']);
    expect(shareFormats(undefined)).toEqual(['zip']);
  });

  it('shares a small tool whole, though its main file is the note that comes with it', () => {
    expect(shareFormats('说明.md', 'tool')).toEqual(['zip']);
    expect(shareFormats('index.html', 'tool')).toEqual(['zip']);
  });
});

describe('a page as a single file', () => {
  it('carries its own pictures, styles and scripts, and nothing from the network or outside its folder', () => {
    const { folder } = work();
    const page = singlePage(folder, 'index.html');
    expect(page).toContain('FROMSTYLE');
    expect(page).toContain('FROMSCRIPT');
    expect(page).toContain('data:image/png;base64,');
    expect(page).not.toContain('FROMOUTSIDE');
    // Nothing that loads from anywhere: no tag that fetches from the network or a file, no url() or @import to one.
    // Written-in files are base64, which may hold a "//" of its own.
    const without = page.replace(/data:[^"')\s]+/g, '');
    expect(without).not.toMatch(/<(img|script|link|iframe|source|video|audio)\b[^>]*(https?:|\/\/|file:)/i);
    expect(without).not.toMatch(/url\(\s*["']?(https?:|\/\/|file:)/i);
    expect(page).not.toMatch(/@import/i);
    // An ordinary link is part of what the page says.
    expect(page).toContain('href="https://example.org/"');
  });
});

describe('what goes out', () => {
  it('has no folder path, home folder or key in a text file, and leaves every other file as it was', () => {
    const folder = 'C:\\Users\\someone\\Lamplight\\2026-11-22-120000-page';
    const text = Buffer.from(`at ${folder}\\index.html and ${folder.replaceAll('\\', '/')}/x and file:///C:/Users/someone/y with ${KEY}`);
    const out = scrub(text, 'notes.md', folder, 'C:\\Users\\someone').toString();
    expect(out).not.toContain('someone');
    expect(out).not.toContain('sk-ant');
    expect(scrub(PNG, 'logo.png', folder, 'C:\\Users\\someone').equals(PNG)).toBe(true);
    const plain = Buffer.from('nothing to hide');
    expect(scrub(plain, 'a.txt', folder, 'C:\\Users\\someone')).toBe(plain);
  });

  it('a shared page, file or zip carries no folder path or key', async () => {
    const { folder } = work();
    writeFileSync(join(folder, 'notes.md'), `key ${KEY} in ${folder}`);
    const page = await shareBytes({ folder, main: 'index.html', title: 'My page', as: 'page' });
    expect(page.name).toBe('My page.html');
    expect(page.data.toString()).not.toContain(folder);
    const file = await shareBytes({ folder, main: 'notes.md', title: 'Notes', as: 'file' });
    expect(file.name).toBe('Notes.md');
    expect(file.data.toString()).toBe('key  in ');
    const zipped = await shareBytes({ folder, main: 'index.html', title: 'My page', as: 'zip' });
    expect(zipped.name).toBe('My page.zip');
    const entries = unzip(zipped.data);
    expect(entries.map((e) => e.name).sort()).toEqual(['app.js', 'index.html', 'logo.png', 'look/bg.png', 'look/look.css', 'notes.md']);
    for (const e of entries) {
      expect(e.data.toString('latin1')).not.toContain(folder);
      expect(e.data.toString('latin1')).not.toContain('sk-ant');
    }
    expect(entries.find((e) => e.name === 'logo.png')!.data.equals(PNG)).toBe(true);
  });

  it('wipes the folder and keys from a text file written into a page too, where base64 would hide them', async () => {
    const { folder } = work();
    writeFileSync(join(folder, 'mark.svg'), `<svg xmlns="http://www.w3.org/2000/svg"><text>${folder} ${KEY}</text></svg>`);
    writeFileSync(join(folder, 'index.html'), '<!doctype html><html><body><img src="mark.svg" alt=""></body></html>');
    const page = (await shareBytes({ folder, main: 'index.html', title: 'Mark', as: 'page' })).data.toString();
    const svg = Buffer.from(/data:image\/svg\+xml;base64,([^"]+)/.exec(page)![1], 'base64').toString();
    expect(svg).toContain('<text>');
    expect(svg).not.toContain(folder);
    expect(svg).not.toContain('sk-ant');
  });
});

describe('saving into a connected cloud folder', () => {
  it('goes into its own subfolder under a free name, and never replaces anything', () => {
    const root = mkdtempSync(join(tmpdir(), 'lamplight-cloud-'));
    const a = saveBytes(root, 'From the shop', 'My page.pdf', Buffer.from('one'));
    const b = saveBytes(root, 'From the shop', 'My page.pdf', Buffer.from('two'));
    expect(a).not.toBe(b);
    expect(readdirSync(join(root, 'From the shop')).length).toBe(2);
    expect(readFileSync(a, 'utf8')).toBe('one');
  });

  it('refuses a subfolder that leads somewhere else', () => {
    const root = mkdtempSync(join(tmpdir(), 'lamplight-cloud-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'lamplight-elsewhere-'));
    symlinkSync(elsewhere, join(root, 'From the shop'), 'junction');
    expect(() => saveBytes(root, 'From the shop', 'x.pdf', Buffer.from('x'))).toThrow();
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});
