import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectVersions } from '../app/main/project-versions';
import { VersionStore, entriesIn } from '../app/main/versions';

function setup(cap?: number) {
  const base = mkdtempSync(join(tmpdir(), 'lamplight-pv-'));
  const work = join(base, 'work');
  mkdirSync(join(work, 'img'), { recursive: true });
  writeFileSync(join(work, 'mine.txt'), 'the user\'s own file');
  const keep = new Set([join(work, 'mine.txt')]);
  writeFileSync(join(work, 'index.html'), 'v1');
  writeFileSync(join(work, 'img', 'a.png'), Buffer.from([0, 1, 2, 255, 13, 10]));
  const root = join(base, 'versions');
  return { base, root, store: new ProjectVersions(root, cap), work, keep };
}
const objects = (root: string) => readdirSync(join(root, 'objects')).length;
/** Every file under a folder, by path inside it, with its bytes. */
const contents = (dir: string, but: string[] = []) => Object.fromEntries(entriesIn(dir).filter((p) => !p.endsWith('/') && !but.includes(p)).map((p) => [p, readFileSync(join(dir, p)).toString('base64')]));
const put = (dir: string, rel: string, body: string | Buffer) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
};

describe('project versions', () => {
  it('keeps the same content once, however many rounds and files have it', () => {
    const { root, store, work, keep } = setup();
    store.save('p1', 1, work, { keep });
    expect(objects(root)).toBe(2);
    // Round 2 changes one file and adds a copy of another: only the changed content is new.
    writeFileSync(join(work, 'index.html'), 'v2');
    writeFileSync(join(work, 'copy.png'), readFileSync(join(work, 'img', 'a.png')));
    store.save('p1', 2, work, { keep });
    expect(objects(root)).toBe(3);
    expect(Object.keys(store.files('p1', 2)).sort()).toEqual(['copy.png', 'img/a.png', 'index.html']);
    // The user's own file is never kept.
    expect(store.files('p1', 1)['mine.txt']).toBeUndefined();
  });

  it('drops the oldest rounds past the cap, keeping round 1 and the latest, and their content goes too', () => {
    const { root, store, work, keep } = setup(1000);
    const pruned: number[] = [];
    for (let n = 1; n <= 5; n++) {
      writeFileSync(join(work, `round-${n}.bin`), Buffer.alloc(300, n));
      rmSync(join(work, `round-${n - 1}.bin`), { force: true });
      pruned.push(...store.save('p1', n, work, { keep }));
    }
    expect(store.has('p1', 1)).toBe(true);
    expect(store.has('p1', 5)).toBe(true);
    expect(pruned).toEqual([2, 3]);
    expect(store.rounds('p1')).toEqual([1, 4, 5]);
    expect(store.size('p1')).toBeLessThanOrEqual(1000);
    // Rounds 2 and 3's own files are gone from the store; what round 1 and 4 still use is not.
    expect(objects(root)).toBe(5);
  });

  it('does not count or drop another project\'s rounds', () => {
    const { base, store, work, keep } = setup(1000);
    writeFileSync(join(work, 'big.bin'), Buffer.alloc(800, 7));
    store.save('p1', 1, work, { keep });
    const p1 = contents(work, ['mine.txt']);
    for (let n = 1; n <= 3; n++) {
      writeFileSync(join(work, 'big.bin'), Buffer.alloc(800, 7 + n));
      store.save('p2', n, work, { keep });
    }
    expect(store.rounds('p2')).toEqual([1, 3]);
    expect(store.rounds('p1')).toEqual([1]);
    store.extract('p1', 1, join(base, 'p1'));
    expect(contents(join(base, 'p1'))).toEqual(p1);
  });

  it('does not keep a file over 50MB, and going back leaves it where it is', () => {
    const { store, work, keep } = setup();
    const fd = openSync(join(work, 'video.bin'), 'w');
    ftruncateSync(fd, 51 * 1024 * 1024);
    closeSync(fd);
    store.save('p1', 1, work, { keep });
    expect(Object.keys(store.files('p1', 1)).sort()).toEqual(['img/a.png', 'index.html']);
    writeFileSync(join(work, 'index.html'), 'v2');
    store.putBack('p1', 1, work, { keep });
    expect(existsSync(join(work, 'video.bin'))).toBe(true);
    expect(readFileSync(join(work, 'index.html'), 'utf8')).toBe('v1');
  });

  it('puts an earlier round back byte for byte and loses nothing: the later rounds are all still there', () => {
    const { store, work, keep } = setup();
    store.save('p1', 1, work, { keep });
    const round1 = contents(work, ['mine.txt']);
    writeFileSync(join(work, 'index.html'), 'v2');
    put(work, 'pages/about.html', 'about');
    store.save('p1', 2, work, { keep });
    const round2 = contents(work, ['mine.txt']);
    rmSync(join(work, 'img'), { recursive: true });
    writeFileSync(join(work, 'index.html'), 'v3');
    store.save('p1', 3, work, { keep });
    const round3 = contents(work, ['mine.txt']);
    writeFileSync(join(work, 'mine.txt'), 'edited by the user meanwhile');

    store.putBack('p1', 1, work, { keep });
    expect(contents(work, ['mine.txt'])).toEqual(round1);
    expect(existsSync(join(work, 'pages'))).toBe(false);
    expect(readFileSync(join(work, 'mine.txt'), 'utf8')).toBe('edited by the user meanwhile');
    for (const [n, was] of [[2, round2], [3, round3]] as const) {
      const out = join(work, '..', `out-${n}`);
      store.extract('p1', n, out);
      expect(contents(out)).toEqual(was);
    }
    store.putBack('p1', 3, work, { keep });
    expect(contents(work, ['mine.txt'])).toEqual(round3);
  });

  it('copies a round into a new folder byte for byte, leaving the project as it was', () => {
    const { base, store, work, keep } = setup();
    writeFileSync(join(work, 'data.bin'), Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
    store.save('p1', 1, work, { keep });
    const round1 = contents(work, ['mine.txt']);
    writeFileSync(join(work, 'index.html'), 'v2');
    const now = contents(work);
    const fork = join(base, 'fork');
    store.extract('p1', 1, fork);
    expect(contents(fork)).toEqual(round1);
    expect(contents(work)).toEqual(now);
  });

  it('keeps only what a commission touched in a lent folder, and goes back through the originals', () => {
    const { root, store, work } = setup();
    const lent = new VersionStore(root);
    // The user's folder: their page and a big picture of theirs the shop never touches.
    put(work, 'photo.raw', Buffer.alloc(5000, 3));
    lent.keepOriginal(work, join(work, 'index.html'));
    writeFileSync(join(work, 'index.html'), 'changed in round 1');
    put(work, 'pages/contact.html', 'made in round 1');
    const touched1 = ['index.html', 'pages/contact.html'];
    store.save('p1', 1, work, { touched: touched1 });
    expect(Object.keys(store.files('p1', 1)).sort()).toEqual(touched1);
    expect(objects(root)).toBe(2);

    // Round 2 changes the user's mine.txt as well and makes another page.
    lent.keepOriginal(work, join(work, 'mine.txt'));
    writeFileSync(join(work, 'mine.txt'), 'changed in round 2');
    put(work, 'pages/more.html', 'made in round 2');
    writeFileSync(join(work, 'index.html'), 'changed in round 2');
    const touched2 = ['index.html', 'mine.txt', 'pages/contact.html', 'pages/more.html'];
    store.save('p1', 2, work, { touched: touched2 });

    store.putBack('p1', 1, work, { touched: touched2, original: (rel) => lent.originalOf(work, rel) });
    expect(readFileSync(join(work, 'index.html'), 'utf8')).toBe('changed in round 1');
    expect(readFileSync(join(work, 'mine.txt'), 'utf8')).toBe('the user\'s own file');
    expect(existsSync(join(work, 'pages', 'more.html'))).toBe(false);
    expect(readFileSync(join(work, 'pages', 'contact.html'), 'utf8')).toBe('made in round 1');
    expect(readFileSync(join(work, 'photo.raw')).length).toBe(5000);
  });

  it('takes in the previous version kept the old way, on the first save', () => {
    const { root, store, work, keep } = setup();
    const old = new VersionStore(root);
    old.save('c7', work, keep);
    const before = contents(work, ['mine.txt']);
    writeFileSync(join(work, 'index.html'), 'v2');
    expect(store.takeOld('c7', 'p7', 2)).toBe(true);
    expect(old.has('c7')).toBe(false);
    const out = join(work, '..', 'old');
    store.extract('p7', 2, out);
    expect(contents(out)).toEqual(before);
    expect(store.takeOld('c7', 'p7', 2)).toBe(false);
  });

  it('refuses ids and rounds that are not the notebook\'s', () => {
    const { store, work, keep } = setup();
    expect(() => store.save('c1', 1, work, { keep })).toThrow();
    expect(() => store.save('p../1', 1, work, { keep })).toThrow();
    expect(() => store.save('p1', 1.5, work, { keep })).toThrow();
  });
});
