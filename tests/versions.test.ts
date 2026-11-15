import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VersionStore } from '../app/main/versions';

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'lamplight-versions-'));
  const work = join(base, 'work');
  mkdirSync(join(work, 'img'), { recursive: true });
  writeFileSync(join(work, 'mine.txt'), 'the user\'s own file');
  const keep = new Set([join(work, 'mine.txt')]);
  writeFileSync(join(work, 'index.html'), 'v1');
  writeFileSync(join(work, 'img', 'a.png'), 'pixels');
  return { store: new VersionStore(join(base, 'versions')), work, keep };
}
const read = (p: string) => readFileSync(p, 'utf8');

describe('previous versions', () => {
  it('puts the previous version back and keeps the newer one for going back again', () => {
    const { store, work, keep } = setup();
    expect(store.save('c1', work, keep)).toBe(true);
    // A round of changes: index.html changed, a new file added, a folder removed.
    writeFileSync(join(work, 'index.html'), 'v2');
    writeFileSync(join(work, 'extra.css'), 'new');
    expect(store.restore('c1', work, keep)).toBe(true);
    expect(read(join(work, 'index.html'))).toBe('v1');
    expect(existsSync(join(work, 'extra.css'))).toBe(false);
    expect(read(join(work, 'img', 'a.png'))).toBe('pixels');
    // And back to the changed one: nothing the shop made is lost.
    expect(store.restore('c1', work, keep)).toBe(true);
    expect(read(join(work, 'index.html'))).toBe('v2');
    expect(read(join(work, 'extra.css'))).toBe('new');
  });

  it('never copies or touches what was in the folder before the shop started', () => {
    const { store, work, keep } = setup();
    store.save('c1', work, keep);
    writeFileSync(join(work, 'mine.txt'), 'edited by the user meanwhile');
    store.restore('c1', work, keep);
    expect(read(join(work, 'mine.txt'))).toBe('edited by the user meanwhile');
  });

  it('has nothing to restore before a save, after forgetting, or when the shop made nothing', () => {
    const { store, work, keep } = setup();
    expect(store.restore('c1', work, keep)).toBe(false);
    store.save('c1', work, keep);
    store.clear();
    expect(store.has('c1')).toBe(false);
    const empty = mkdtempSync(join(tmpdir(), 'lamplight-empty-'));
    expect(store.save('c2', empty, new Set())).toBe(false);
    expect(readdirSync(empty)).toEqual([]);
  });

  it('refuses ids that are not notebook ids', () => {
    const { store, work, keep } = setup();
    expect(() => store.save('../x', work, keep)).toThrow();
    expect(() => store.save('p../1', work, keep)).toThrow();
  });

  it('keeps versions under a project number as well as a commission number', () => {
    const { store, work, keep } = setup();
    store.save('p123', work, keep);
    expect(store.has('p123')).toBe(true);
  });
});
