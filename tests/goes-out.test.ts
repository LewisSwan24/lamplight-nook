import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { shareBytes } from '../app/main/share';
import { DEFAULT_FURNISHING } from '../app/shared/furnish';
import { makePostcard, postcardText } from '../app/shared/postcard';
import type { ShopState } from '../app/shared/types';

// What leaves the computer (docs/plan-1.5.md E6): a shared work and a postcard, taken apart, carry no key, no folder
// path, nothing from the commission slip and nothing about the connections.

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5ff0000000049454e44ae426082', 'hex');
const KEY = 'sk-ant-api03-Secret_Key-1234567890';
const WANT = 'a page about grandmother Rosa and her plum dumplings';
const CALENDAR = 'https://calendar.example/private/a1b2c3/basic.ics';
const SYNCED_LABEL = 'Family Dropbox';

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

/** A shop with a key, a work folder, a slip and two connections, and a work that used all of them. */
function shop() {
  const root = mkdtempSync(join(tmpdir(), 'lamplight-goes-out-'));
  const synced = join(root, 'Dropbox', 'Family');
  const folder = join(root, 'Lamplight Nook', 'Rosa page');
  for (const dir of [synced, join(folder, 'materials'), join(folder, 'from-synced-folder'), join(folder, '网盘文件夹')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(folder, 'index.html'), [
    '<!doctype html><html><body><h1>Rosa</h1>',
    '<img src="materials/rosa.png" alt=""><img src="from-synced-folder/holiday.png" alt="">',
    `<p>Built in ${folder} with ${KEY}</p>`,
    '</body></html>',
  ].join('\n'));
  writeFileSync(join(folder, 'materials', 'rosa.png'), PNG);
  writeFileSync(join(folder, 'from-synced-folder', 'holiday.png'), PNG);
  writeFileSync(join(folder, '网盘文件夹', 'tax-2025.png'), PNG);
  // What a tidy-a-folder commission is given to work from: the user's own folder, listed.
  writeFileSync(join(folder, 'file-list.txt'), 'Family/\n  tax-2025.pdf\n  passport-scan.jpg\n');
  writeFileSync(join(folder, '文件清单.txt'), 'Family/\n  bank-statement.pdf\n');
  return { root, synced, folder };
}

/** None of what must stay behind, anywhere in these bytes. */
function carriesNothing(bytes: Buffer, s: ReturnType<typeof shop>) {
  const text = bytes.toString('utf8');
  for (const secret of [KEY, WANT, CALENDAR, SYNCED_LABEL, s.folder, s.folder.replaceAll('\\', '/'), s.synced, 'passport-scan', 'bank-statement', 'tax-2025']) {
    expect(text, `carries ${secret}`).not.toContain(secret);
  }
}

describe('a shared work', () => {
  it('as one page carries the work, and nothing else', async () => {
    const s = shop();
    const out = await shareBytes({ folder: s.folder, main: 'index.html', title: 'Rosa page', as: 'page' });
    carriesNothing(out.data, s);
    expect(out.data.toString('utf8')).toContain('<h1>Rosa</h1>');
  });

  it('as it is carries the work, and nothing else', async () => {
    const s = shop();
    carriesNothing((await shareBytes({ folder: s.folder, main: 'index.html', title: 'Rosa page', as: 'file' })).data, s);
  });

  it('as a zip leaves out the folder listing and what the connections read in', async () => {
    const s = shop();
    const entries = unzip((await shareBytes({ folder: s.folder, main: 'index.html', title: 'Rosa page', as: 'zip' })).data);
    expect(entries.map((e) => e.name).sort()).toEqual(['index.html', 'materials/rosa.png']);
    for (const e of entries) carriesNothing(e.data, s);
  });
});

describe('a postcard', () => {
  it('carries how the shop looks, and nothing else', () => {
    const s = shop();
    const state: ShopState = {
      done: 4, grown: [{ id: 'painting', date: '2026-11-01' }], told: ['town-move'], met: [{ id: 'baker', date: '2026-11-02' }],
      town: { shops: {}, street: [], stories: {}, staff: { laoshi: ['2026-11-20'] } }, today: '2026-11-22',
      crew: { adeng: 4, xiaoju: 2, laoshi: 3, qingdai: 1, xiaodou: 0, aqian: 0, xiaozhe: 0, xiaoding: 1, guiyi: 0, axin: 0 },
      bonds: { 'adeng+laoshi': 2 }, recall: { adeng: [{ title: 'A recalled title', date: '2026-11-01' }] },
      works: [{ id: 'c1', title: 'Rosa page', date: '2026-11-03', icon: 'page', rounds: 2, hasMain: true, page: true, want: WANT, project: 'p1', shop: 'workshop' }],
    };
    const settings = { scene: 'cafe' as const, furnish: { cafe: DEFAULT_FURNISHING, study: DEFAULT_FURNISHING }, workRoot: s.folder, lan: true, lanPort: 47800 };
    const text = postcardText(makePostcard('Sam', settings, state));
    carriesNothing(Buffer.from(text), s);
    expect(text).not.toMatch(/Rosa|47800|workRoot|c1|p1|A recalled title/);
  });
});
