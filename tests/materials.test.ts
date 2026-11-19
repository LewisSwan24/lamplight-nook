import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commissionPrompt } from '../app/main/commission';
import { MAX_MATERIALS, MAX_MATERIAL_BYTES, copyMaterials, materialNames, materialsDir, materialsSteps, sortHandOver } from '../app/main/materials';

const made: string[] = [];
const home = () => {
  const d = mkdtempSync(join(tmpdir(), 'materials-'));
  made.push(d);
  return d;
};
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5 });
});

describe('handing over files', () => {
  it('takes files, refuses folders, missing and oversized ones, and says why', () => {
    const d = home();
    writeFileSync(join(d, 'shot.png'), 'png');
    mkdirSync(join(d, 'photos'));
    writeFileSync(join(d, 'huge.bin'), Buffer.alloc(MAX_MATERIAL_BYTES + 1));
    const r = sortHandOver([join(d, 'shot.png'), join(d, 'photos'), join(d, 'gone.txt'), join(d, 'huge.bin'), join(d, 'shot.png')]);
    expect(r.items.map((m) => [m.name, m.size])).toEqual([['shot.png', 3]]);
    expect(r.refused).toEqual([
      { name: 'photos', why: 'folder' },
      { name: 'gone.txt', why: 'missing' },
      { name: 'huge.bin', why: 'too-big' },
    ]);
  });

  it('counts what the form already holds against the limit, and skips what is already there', () => {
    const d = home();
    const paths = Array.from({ length: MAX_MATERIALS + 1 }, (_, i) => { const p = join(d, `f${i}.txt`); writeFileSync(p, 'x'); return p; });
    const first = sortHandOver(paths.slice(0, 3));
    const second = sortHandOver(paths, first.items);
    expect(second.items).toHaveLength(MAX_MATERIALS - 3);
    expect(second.refused).toEqual([{ name: `f${MAX_MATERIALS}.txt`, why: 'too-many' }]);
  });

  it('names copies after the originals, numbering ones with the same name', () => {
    expect(materialNames(['/a/notes.txt', '/b/notes.txt', '/c/Notes.txt', '/d/photo.png'])).toEqual(['notes.txt', 'notes (2).txt', 'Notes (3).txt', 'photo.png']);
  });

  it('copies into the materials folder and leaves the originals alone', async () => {
    const src = home();
    const a = join(src, 'one', 'draft.md'); mkdirSync(join(src, 'one')); writeFileSync(a, 'first');
    const b = join(src, 'draft.md'); writeFileSync(b, 'second');
    const work = home();
    expect(await copyMaterials(work, [a, b])).toEqual(['draft.md', 'draft (2).md']);
    expect(readdirSync(join(work, materialsDir())).sort()).toEqual(['draft (2).md', 'draft.md']);
    expect(readFileSync(join(work, materialsDir(), 'draft (2).md'), 'utf8')).toBe('second');
    expect(readFileSync(a, 'utf8')).toBe('first');
    expect(await copyMaterials(work, [])).toEqual([]);
  });

  it('refuses pictures nothing here can open, and says so', () => {
    const d = home();
    const names = ['phone.HEIC', 'live.heif', 'fax.tif', 'scan.tiff', 'shot.png', 'old.bmp', 'new.avif'];
    for (const n of names) writeFileSync(join(d, n), n);
    const r = sortHandOver(names.map((n) => join(d, n)));
    expect(r.items.map((m) => m.name)).toEqual(['shot.png', 'old.bmp', 'new.avif']);
    expect(r.refused).toEqual(['phone.HEIC', 'live.heif', 'fax.tif', 'scan.tiff'].map((name) => ({ name, why: 'picture' })));
  });

  it('puts a PNG copy beside a picture Claude cannot look at, and tells Claude to look at that', async () => {
    const src = home();
    const paths = ['scan.bmp', 'scan.png', 'art.AVIF', 'notes.txt'].map((n) => { writeFileSync(join(src, n), n); return join(src, n); });
    const work = home();
    const converted: string[][] = [];
    const names = await copyMaterials(work, paths, async (from, to) => {
      converted.push([readFileSync(from, 'utf8'), basename(to)]);
      writeFileSync(to, 'png');
    });
    expect(names).toEqual(['scan.bmp', 'scan.png', 'art.AVIF', 'notes.txt']);
    expect(converted).toEqual([['scan.bmp', 'scan (2).png'], ['art.AVIF', 'art.png']]);
    expect(readdirSync(join(work, materialsDir())).sort()).toEqual(['art.AVIF', 'art.png', 'notes.txt', 'scan (2).png', 'scan.bmp', 'scan.png']);
    const steps = materialsSteps(paths).join('\n');
    expect(steps).toContain('"scan.bmp" is in "scan (2).png"');
    expect(steps).toContain('"art.AVIF" is in "art.png"');
    expect(materialsSteps(['/a/one.png']).join('\n')).not.toMatch(/PNG copy/);
  });

  it('carries on without the PNG copy of a picture that will not open, and Claude is told to say so', async () => {
    const src = home();
    const paths = ['broken.bmp', 'fine.avif'].map((n) => { writeFileSync(join(src, n), n); return join(src, n); });
    const work = home();
    const names = await copyMaterials(work, paths, async (from, to) => {
      if (from.endsWith('broken.bmp')) throw new Error('could not decode');
      writeFileSync(to, 'png');
    });
    expect(names).toEqual(['broken.bmp', 'fine.avif']);
    expect(readdirSync(join(work, materialsDir())).sort()).toEqual(['broken.bmp', 'fine.avif', 'fine.png']);
    expect(materialsSteps(paths).join('\n')).toMatch(/If one of those copies is missing, that picture could not be opened: say so/);
  });

  it('tells Claude where the material is and not to change it', () => {
    expect(materialsSteps(undefined)).toEqual([]);
    const prompt = commissionPrompt({ want: 'Make a page from my sketch', materials: ['/x/sketch.png', '/y/sketch.png'] });
    expect(prompt).toContain(`"${materialsDir()}": "sketch.png", "sketch (2).png"`);
    expect(prompt).toMatch(/Do not change, move or delete anything/);
    expect(commissionPrompt({ want: 'Plain' })).not.toContain(materialsDir());
  });
});
