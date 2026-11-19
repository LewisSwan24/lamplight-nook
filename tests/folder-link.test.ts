import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FolderLinkError, listLinked, MAX_READ_BYTES, readLinked, saveCopy, undoCopy } from '../app/main/folder-link';

/** A synced folder with a little of everything, a commission folder, and somewhere outside both. */
function place() {
  const top = mkdtempSync(join(tmpdir(), 'folder-link-'));
  const root = join(top, 'OneDrive');
  const work = join(top, 'work');
  const away = join(top, 'away');
  for (const d of [join(root, 'Docs', 'Old', 'Older'), join(root, '.git'), work, away]) mkdirSync(d, { recursive: true });
  writeFileSync(join(root, 'notes.md'), '# Notes\nTea on Friday.\n');
  writeFileSync(join(root, 'Docs', 'plan.txt'), 'the plan');
  writeFileSync(join(root, 'Docs', 'Old', 'two-deep.txt'), 'deep');
  writeFileSync(join(root, 'Docs', 'Old', 'Older', 'three-deep.txt'), 'deeper');
  writeFileSync(join(root, '.env'), 'TOKEN=1');
  writeFileSync(join(root, 'api-key.txt'), 'sk-1');
  writeFileSync(join(root, 'Docs', 'id_rsa'), 'private');
  writeFileSync(join(root, 'scan.pdf'), '%PDF-1.7 test');
  copyFileSync('tests/fixtures/office/sample.docx', join(root, 'Docs', 'report.docx'));
  writeFileSync(join(away, 'secret-plans.txt'), 'not yours');
  // A junction needs no special rights on Windows, unlike a symbolic link.
  symlinkSync(away, join(root, 'Shortcut'), 'junction');
  writeFileSync(join(work, 'poster.png'), 'png bytes');
  return { root, work, away };
}

describe('a synced folder the staff may look in and save a copy to (road-to-1.3.md C5)', () => {
  it('lists two levels, without hidden files, links or names that look like keys', () => {
    const { root } = place();
    const lines = listLinked(root).trim().split('\n').map((l) => l.split('\t')[0]);
    expect(lines).toEqual(['Docs/', 'Docs/Old/', 'Docs/plan.txt', 'Docs/report.docx', 'notes.md', 'scan.pdf']);
  });

  it('reads text as it is, an Office file as its text, and copies a PDF or a picture in for Read', () => {
    const { root, work } = place();
    expect(readLinked(root, 'notes.md', work, 'from-folder')).toEqual({ text: '# Notes\nTea on Friday.\n' });
    expect((readLinked(root, 'Docs/report.docx', work, 'from-folder') as { text: string }).text.length).toBeGreaterThan(20);
    expect(readLinked(root, 'scan.pdf', work, 'from-folder')).toEqual({ copied: 'from-folder/scan.pdf' });
    expect(readLinked(root, 'scan.pdf', work, 'from-folder')).toEqual({ copied: 'from-folder/scan (2).pdf' });
    expect(readFileSync(join(work, 'from-folder', 'scan.pdf'), 'utf8')).toBe('%PDF-1.7 test');
  });

  it('reads nothing hidden, key-like, too big, outside the folder or through a link out of it', () => {
    const { root, work, away } = place();
    writeFileSync(join(root, 'huge.txt'), Buffer.alloc(MAX_READ_BYTES + 1));
    for (const rel of ['.env', '.git/config', 'api-key.txt', 'Docs/id_rsa', 'huge.txt', '../away/secret-plans.txt', join(away, 'secret-plans.txt'), 'Shortcut/secret-plans.txt', 'Docs', 'missing.txt']) {
      expect(() => readLinked(root, rel, work, 'from-folder'), rel).toThrow(FolderLinkError);
    }
  });

  it('saves a copy into its own subfolder, numbered instead of replacing anything, and only from the commission folder', () => {
    const { root, work, away } = place();
    mkdirSync(join(root, 'Lamplight Nook'));
    writeFileSync(join(root, 'Lamplight Nook', 'poster.png'), 'the user\'s own');
    const first = saveCopy(root, 'Lamplight Nook', work, 'poster.png');
    const second = saveCopy(root, 'Lamplight Nook', work, 'poster.png');
    expect([first, second]).toEqual([join(root, 'Lamplight Nook', 'poster (2).png'), join(root, 'Lamplight Nook', 'poster (3).png')]);
    expect(readFileSync(join(root, 'Lamplight Nook', 'poster.png'), 'utf8')).toBe('the user\'s own');
    expect(readFileSync(first, 'utf8')).toBe('png bytes');
    for (const rel of ['../away/secret-plans.txt', join(away, 'secret-plans.txt'), 'missing.png']) {
      expect(() => saveCopy(root, 'Lamplight Nook', work, rel), rel).toThrow(FolderLinkError);
    }
  });

  it('refuses to save when its subfolder leads out of the synced folder', () => {
    const { root, work, away } = place();
    symlinkSync(away, join(root, '小灯屋'), 'junction');
    expect(() => saveCopy(root, '小灯屋', work, 'poster.png')).toThrow(FolderLinkError);
    expect(readdirSync(away)).toEqual(['secret-plans.txt']);
  });

  it('undo deletes only a copy it saved, in its own subfolder', () => {
    const { root, work } = place();
    const made = saveCopy(root, 'Lamplight Nook', work, 'poster.png');
    expect(undoCopy(root, 'Lamplight Nook', join(root, 'notes.md'))).toBe(false);
    expect(undoCopy(root, 'Lamplight Nook', join(root, 'Lamplight Nook'))).toBe(false);
    expect(undoCopy(root, 'Lamplight Nook', made)).toBe(true);
    expect(existsSync(made)).toBe(false);
    expect(existsSync(join(root, 'notes.md'))).toBe(true);
    expect(undoCopy(root, 'Lamplight Nook', made)).toBe(false);
  });
});
