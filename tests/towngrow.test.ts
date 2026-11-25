import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import town from '../assets/sprites/town.json';
import { MemoryStore } from '../app/main/memory';
import { FRONT_GROWTH, ROOM_GROWTH, STREET_GROWTH, frontGrown, roomGrown, streetGrown, townCounts, townNews } from '../app/shared/towngrow';
import { FRONTS, streetArea } from '../app/renderer/game/town';
import { hitsFeet } from '../app/renderer/game/path';
import { parseLines, pickLine } from '../app/renderer/translator/lines';

// The town grows with the work (road-to-1.4.md D5): the street by everything done, each front and each shop along the
// street by its own count.

const fresh = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-towngrow-')), 'memory.json'));
const DAY = new Date('2026-11-21T10:00:00Z');

describe('what grows on the street', () => {
  it('comes in order with everything done: lamps, a bench, flowers, a stall, a park, a fountain', () => {
    expect(STREET_GROWTH.map((g) => [g.id, g.at])).toEqual([['lamps', 3], ['bench', 6], ['flowers', 10], ['stall', 20], ['park', 40], ['fountain', 70]]);
    expect(streetGrown(0)).toEqual([]);
    expect(streetGrown(10)).toEqual(['lamps', 'bench', 'flowers']);
    expect(streetGrown(30)).toEqual(['lamps', 'bench', 'flowers', 'stall']);
    expect(streetGrown(100)).toEqual(['lamps', 'bench', 'flowers', 'stall', 'park', 'fountain']);
  });

  it('gives a front a pot, a new sign and flags as its own shop does more', () => {
    expect(FRONT_GROWTH.map((g) => [g.id, g.at])).toEqual([['pot', 2], ['sign', 8], ['bunting', 20]]);
    expect(frontGrown(1)).toEqual([]);
    expect(frontGrown(2)).toEqual(['pot']);
    expect(frontGrown(19)).toEqual(['pot', 'sign']);
    expect(frontGrown(20)).toEqual(['pot', 'sign', 'bunting']);
  });

  it('gives each shop along the street four pieces of its own, at one, three, eight and twenty', () => {
    for (const shop of ['print', 'studio', 'workshop', 'bakery', 'post'] as const) expect(ROOM_GROWTH[shop].map((g) => g.at)).toEqual([1, 3, 8, 20]);
    expect(roomGrown('print', 0)).toEqual([]);
    expect(roomGrown('print', 3)).toEqual(['proof', 'ivy']);
    expect(roomGrown('workshop', 20)).toEqual(['gear', 'ivy', 'clock', 'blueprint']);
    expect(roomGrown('bakery', 8)).toEqual(['wheat', 'ivy', 'pin']);
    expect(roomGrown('bakery', 20)).toEqual(['wheat', 'ivy', 'pin', 'garland']);
    expect(roomGrown('post', 20)).toEqual(['stamp', 'ivy', 'horn', 'map']);
  });
});

describe('counting by shop', () => {
  it('counts a street shop’s work there and in the total; the home shop’s own is what is left', () => {
    const store = fresh();
    for (let i = 0; i < 3; i++) store.finished(DAY, 'print');
    store.finished(DAY, 'studio');
    store.finished(DAY, 'home');
    const state = store.shopState();
    expect(state.done).toBe(5);
    expect(state.town!.shops.print).toEqual({ done: 3, grown: [{ id: 'proof', date: '2026-11-21' }, { id: 'ivy', date: '2026-11-21' }] });
    expect(state.town!.shops.studio!.done).toBe(1);
    expect(townCounts(state, 'cafe')).toEqual({ total: 5, shops: { cafe: 1, study: 0, print: 3, studio: 1, workshop: 0, bakery: 0, post: 0 } });
    expect(townCounts(state, 'study').shops).toEqual({ cafe: 0, study: 1, print: 3, studio: 1, workshop: 0, bakery: 0, post: 0 });
  });

  it('still counts the home shop’s finished works the way it always has', () => {
    const store = fresh();
    expect(store.finished(DAY, 'print')).toEqual(['painting']);
    expect(store.finished(DAY)).toEqual(['plant']);
  });

  it('writes down the day each street piece came, and catches up quietly on ones due before', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lamplight-towngrow-')), 'memory.json');
    // Upgraded with nine done and nothing written down for the street yet.
    writeFileSync(file, JSON.stringify({ commissions: [], stuckNotes: [], shop: { done: 9, grown: [], told: ['town-move'], town: { shops: {}, street: [], stories: {} } } }));
    const store = new MemoryStore(file);
    const before = townCounts(store.shopState(), 'cafe');
    store.finished(DAY);
    const state = store.shopState();
    expect(state.town!.street.map((g) => g.id)).toEqual(['lamps', 'bench', 'flowers']);
    expect(townNews(before, townCounts(state, 'cafe')).map((n) => n.line)).toEqual(['grow_street_flowers']);
  });

  it('leaves the town alone in a shop whose upgrade has not gone through', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lamplight-towngrow-')), 'memory.json');
    writeFileSync(file, JSON.stringify({ commissions: [], stuckNotes: [], shop: { done: 4, grown: [], told: [] } }));
    const store = new MemoryStore(file);
    store.finished(DAY, 'print');
    expect(store.shopState().done).toBe(5);
    expect(store.shopState().town).toBeUndefined();
  });
});

describe('what is worth a word', () => {
  const counts = (total: number, shops: Partial<Record<'cafe' | 'study' | 'print' | 'studio' | 'workshop' | 'bakery' | 'post', number>>) =>
    ({ total, shops: { cafe: 0, study: 0, print: 0, studio: 0, workshop: 0, bakery: 0, post: 0, ...shops } });

  it('names the new street piece, the new thing at a front and the new piece inside a shop', () => {
    expect(townNews(counts(9, { cafe: 2, print: 7 }), counts(10, { cafe: 2, print: 8 }))).toEqual([
      { line: 'grow_street_flowers' }, { line: 'grow_front_sign', shop: 'print' }, { line: 'grow_print_typecase' },
    ]);
    expect(townNews(counts(4, { cafe: 4 }), counts(5, { cafe: 5 }))).toEqual([]);
  });

  it('has a line for every one of them, in both languages', () => {
    for (const file of ['lines/cafe.yaml', 'lines/en/cafe.yaml']) {
      const grow = parseLines(readFileSync(file, 'utf8')).grow;
      const ids = [
        ...STREET_GROWTH.map((g) => `grow_street_${g.id}`),
        ...FRONT_GROWTH.map((g) => `grow_front_${g.id}`),
        ...Object.entries(ROOM_GROWTH).flatMap(([shop, pieces]) => pieces.map((g) => `grow_${shop}_${g.id}`)),
      ];
      for (const id of ids) {
        const turns = pickLine(grow, [id], { shop: 'X' });
        expect(turns?.length, `${file} ${id}`).toBeGreaterThan(0);
        if (id.startsWith('grow_front_')) expect(turns!.some((t) => t.text.includes('X')), `${file} ${id} names the shop`).toBe(true);
      }
    }
  });
});

describe('the pictures for it', () => {
  it('has the empty lot between the workshop and the bakery', () => {
    const at = (id: string) => FRONTS.find((f) => f.id === id)!;
    expect(town.lot.x).toBeGreaterThanOrEqual(at('workshop').x + at('workshop').w);
    expect(town.lot.x + town.lot.w).toBeLessThanOrEqual(at('bakery').x);
  });

  it('has every street piece, and a pot, a sign and flags at each room’s front', () => {
    for (const g of STREET_GROWTH) expect(town.grow.some((p) => p.id === g.id && !('shop' in p)), g.id).toBe(true);
    for (const room of ['cafe', 'study', 'print', 'studio', 'workshop', 'bakery', 'post']) {
      for (const g of FRONT_GROWTH) expect(town.grow.filter((p) => p.id === g.id && 'shop' in p && p.shop === room), `${room} ${g.id}`).toHaveLength(1);
    }
    for (const p of town.grow) {
      if (!('shop' in p)) continue;
      const f = FRONTS.find((f) => f.id === p.shop)!;
      expect(p.x >= f.x && p.x + p.w <= f.x + f.w, `${p.shop} ${p.id} is on its own front`).toBe(true);
    }
  });

  it('keeps what grows on the pavement in the way whether it has grown or not, so walks do not change', () => {
    const area = streetArea();
    const feet = town.grow.flatMap((p) => ('foot' in p && p.foot ? [p.foot] : []));
    expect(feet.length).toBeGreaterThanOrEqual(6);
    for (const foot of feet) expect(area.obstacles).toContainEqual({ left: foot.left - 1, right: foot.right + 1, top: foot.top - 1, bottom: foot.bottom + 1 });
    // And none of it stands at a door.
    for (const f of FRONTS) expect(feet.some((o) => hitsFeet({ x: f.door, y: town.kerb + 4 }, o)), f.id).toBe(false);
  });

  it('has an overlay for every piece inside the shops along the street', () => {
    for (const [shop, pieces] of Object.entries(ROOM_GROWTH)) {
      for (const g of pieces) expect(existsSync(`assets/sprites/grow-${shop}-${g.id}.png`), `${shop} ${g.id}`).toBe(true);
    }
  });
});
