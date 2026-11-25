import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PostcardWall } from '../app/main/postcard';
import { DEFAULT_FURNISHING } from '../app/shared/furnish';
import { KEPT_MAX, keepPostcard, makePostcard, postcardText, wallCards } from '../app/shared/postcard';
import type { ShopDays } from '../app/shared/types';

// The post office keeps the postcards that were opened (plan-1.6.md F2): a little card on its wall for each, newest first,
// that opens the visit again. Only who sent it and what their shop looks like, as in E3: no dates, nothing more.

const furnish = { cafe: DEFAULT_FURNISHING, study: DEFAULT_FURNISHING };
const days: ShopDays = { done: 12, grown: [{ id: 'painting', date: '2026-01-02' }], told: [], met: [] };
const from = (name: string, done = 12) => makePostcard(name, { scene: 'cafe', furnish }, { ...days, done });
const home = () => mkdtempSync(join(tmpdir(), 'nook-wall-'));

describe('keeping postcards', () => {
  it('puts the newest first, and a card opened again moves to the front instead of hanging twice', () => {
    const a = from('Ann');
    const b = from('Bo');
    expect(keepPostcard([], a)).toEqual([a]);
    expect(keepPostcard([a], b)).toEqual([b, a]);
    expect(keepPostcard([b, a], from('Ann'))).toEqual([a, b]);
  });

  it('keeps a newer card from the same friend as well: their shop has moved on since', () => {
    expect(keepPostcard([from('Ann', 12)], from('Ann', 30)).map((c) => c.done)).toEqual([30, 12]);
  });

  it(`keeps ${KEPT_MAX} at most, letting the oldest go`, () => {
    let wall: ReturnType<typeof from>[] = [];
    for (let i = 0; i < KEPT_MAX + 3; i++) wall = keepPostcard(wall, from(`Friend ${i}`));
    expect(wall).toHaveLength(KEPT_MAX);
    expect(wall[0].name).toBe(`Friend ${KEPT_MAX + 2}`);
    expect(wall.at(-1)!.name).toBe('Friend 3');
  });

  it('shows the wall only who sent each one and where their shop is', () => {
    expect(wallCards([from('Ann'), from('Bo')])).toEqual([{ name: 'Ann', home: 'cafe' }, { name: 'Bo', home: 'cafe' }]);
  });
});

describe('the wall on disk', () => {
  it('reads back what it kept, newest first', () => {
    const dir = home();
    const wall = new PostcardWall(dir);
    expect(wall.cards()).toEqual([]);
    wall.keep(from('Ann'));
    wall.keep(from('Bo'));
    expect(new PostcardWall(dir).cards().map((c) => c.name)).toEqual(['Bo', 'Ann']);
    expect(new PostcardWall(dir).card(1)).toEqual(from('Ann'));
    expect(new PostcardWall(dir).card(5)).toBeNull();
  });

  it('writes the postcards as they came, with no dates', () => {
    const dir = home();
    new PostcardWall(dir).keep(from('Ann'));
    const text = readFileSync(join(dir, 'postcards.json'), 'utf8');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(JSON.parse(text)).toEqual({ version: 1, cards: [JSON.parse(postcardText(from('Ann')))] });
  });

  it('starts empty from a broken file, and lets go of any card that would not open now', () => {
    const dir = home();
    writeFileSync(join(dir, 'postcards.json'), 'not json');
    expect(new PostcardWall(dir).cards()).toEqual([]);
    const good = JSON.parse(postcardText(from('Ann')));
    writeFileSync(join(dir, 'postcards.json'), JSON.stringify({ version: 1, cards: [{ ...good, home: 'castle' }, good, 'text'] }));
    expect(new PostcardWall(dir).cards()).toEqual([from('Ann')]);
  });
});
