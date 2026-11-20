import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript build script without type declarations
import { exportTo, importFrom, packBuilt } from '../scripts/pack-assets.mjs';

// The pictures and sounds built from the purchased packs are git-ignored here and kept in a private repository,
// which the release workflow copies in (README, "Art and licenses").

const put = (root: string, rel: string, text = rel) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

// A small repository shaped like this one: one ignored pack-built sprite, one hand-drawn sprite listed back in,
// a raw pack under vendor/, and code.
const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-assets-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  put(root, '.gitignore', 'assets/vendor/\nassets/sprites/*.png\n!assets/sprites/tools.png\nassets/audio/click.ogg\n');
  put(root, 'assets/sprites/cafe.png');
  put(root, 'assets/sprites/tools.png');
  put(root, 'assets/audio/click.ogg');
  put(root, 'assets/audio/door.ogg');
  put(root, 'assets/vendor/1_Interiors/raw.png');
  put(root, 'app/main.ts');
  return root;
};

describe('the pack-built assets (private repository)', () => {
  it('lists only the ignored files under assets/, never the raw packs or anything tracked', () => {
    expect(packBuilt(repo())).toEqual(['assets/audio/click.ogg', 'assets/sprites/cafe.png']);
  });

  it('exports them into the private checkout and drops ones the app no longer has', () => {
    const root = repo();
    const out = mkdtempSync(join(tmpdir(), 'pack-out-'));
    put(out, 'README.md', 'kept');
    put(out, 'assets/sprites/old.png');
    exportTo(root, out);
    expect(readFileSync(join(out, 'assets/sprites/cafe.png'), 'utf8')).toBe('assets/sprites/cafe.png');
    expect(existsSync(join(out, 'assets/audio/click.ogg'))).toBe(true);
    expect(existsSync(join(out, 'assets/sprites/old.png'))).toBe(false);
    expect(existsSync(join(out, 'assets/sprites/tools.png'))).toBe(false);
    expect(existsSync(join(out, 'assets/vendor'))).toBe(false);
    expect(readFileSync(join(out, 'README.md'), 'utf8')).toBe('kept');
  });

  it('imports them into a clean checkout', () => {
    const from = mkdtempSync(join(tmpdir(), 'pack-in-'));
    put(from, 'assets/sprites/cafe.png', 'new cafe');
    const root = repo();
    importFrom(from, root);
    expect(readFileSync(join(root, 'assets/sprites/cafe.png'), 'utf8')).toBe('new cafe');
  });

  it('refuses a file this repository tracks or does not ignore, and changes nothing', () => {
    const root = repo();
    for (const rel of ['assets/sprites/tools.png', 'assets/audio/door.ogg', 'assets/vendor/1_Interiors/raw.png']) {
      const from = mkdtempSync(join(tmpdir(), 'pack-in-'));
      put(from, 'assets/sprites/cafe.png', 'new cafe');
      put(from, rel, 'changed');
      expect(() => importFrom(from, root)).toThrow(rel);
      expect(readFileSync(join(root, rel), 'utf8')).toBe(rel);
      expect(readFileSync(join(root, 'assets/sprites/cafe.png'), 'utf8')).toBe('assets/sprites/cafe.png');
    }
  });

  it('never copies anything from outside assets/ in the private checkout', () => {
    const root = repo();
    const from = mkdtempSync(join(tmpdir(), 'pack-in-'));
    put(from, 'assets/sprites/cafe.png', 'new cafe');
    put(from, 'app/main.ts', 'changed');
    importFrom(from, root);
    expect(readFileSync(join(root, 'app/main.ts'), 'utf8')).toBe('app/main.ts');
  });

  it('refuses an empty private checkout rather than building without art', () => {
    expect(() => importFrom(mkdtempSync(join(tmpdir(), 'pack-in-')), repo())).toThrow(/no pack-built files/);
  });
});
