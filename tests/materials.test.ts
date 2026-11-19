import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('copies into the materials folder and leaves the originals alone', () => {
    const src = home();
    const a = join(src, 'one', 'draft.md'); mkdirSync(join(src, 'one')); writeFileSync(a, 'first');
    const b = join(src, 'draft.md'); writeFileSync(b, 'second');
    const work = home();
    expect(copyMaterials(work, [a, b])).toEqual(['draft.md', 'draft (2).md']);
    expect(readdirSync(join(work, materialsDir())).sort()).toEqual(['draft (2).md', 'draft.md']);
    expect(readFileSync(join(work, materialsDir(), 'draft (2).md'), 'utf8')).toBe('second');
    expect(readFileSync(a, 'utf8')).toBe('first');
    expect(copyMaterials(work, [])).toEqual([]);
  });

  it('tells Claude where the material is and not to change it', () => {
    expect(materialsSteps(undefined)).toEqual([]);
    const prompt = commissionPrompt({ want: 'Make a page from my sketch', materials: ['/x/sketch.png', '/y/sketch.png'] });
    expect(prompt).toContain(`"${materialsDir()}": "sketch.png", "sketch (2).png"`);
    expect(prompt).toMatch(/Do not change, move or delete anything/);
    expect(commissionPrompt({ want: 'Plain' })).not.toContain(materialsDir());
  });
});
