import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTORS } from '../app/renderer/game/layout';
import { WALK_SPEED } from '../app/renderer/game/life';
import { pieceData } from '../app/renderer/game/pieces';
import { entering, OPEN } from '../app/renderer/game/town';
import { ruleBook } from '../app/renderer/stage/rulebook';
import { BIRTHDAYS } from '../app/shared/calendar';
import { ROOMS } from '../app/shared/scenes';
import { ROOM_CREW, SHOP_STAFF } from '../app/shared/staff';

const zh = JSON.parse(readFileSync('locales/zh-CN.json', 'utf8'));
const en = JSON.parse(readFileSync('locales/en.json', 'utf8'));

// plan-2.0.md J2: the flower shop and the bookshop on the river street open, each kept by one person: Fern, the
// neighbour who sold flowers, and Uncle Page, who is new.
describe('the two shops on the river street', () => {
  it('can be gone into from the street', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      expect(ROOMS).toContain(room);
      expect(OPEN.has(room)).toBe(true);
      expect(entering(room, { here: 'cafe' })).toBe('visit');
    }
  });

  it('has each kept by its own keeper, standing at the blackboard like the bakery and the post office', () => {
    expect(ROOM_CREW.flowershop).toEqual(['fangjie']);
    expect(ROOM_CREW.bookshop).toEqual(['jianbo']);
    expect(SHOP_STAFF).toEqual(expect.arrayContaining(['fangjie', 'jianbo']));
    for (const id of ['fangjie', 'jianbo'] as const) {
      expect(ACTORS.find((a) => a.id === id)).toMatchObject({ home: 'board' });
      expect(WALK_SPEED[id]).toBeGreaterThan(0);
      expect(BIRTHDAYS[id]).toHaveLength(2);
    }
  });

  it('names the keepers in both languages: Fern keeps her name from the street', () => {
    expect(zh.actors.fangjie).toBe(zh.guests.florist);
    expect(en.actors.fangjie).toBe(en.guests.florist);
    expect(zh.actors.jianbo).toBe('简伯');
    expect(en.actors.jianbo).toBe('Uncle Page');
  });

  it('has its furniture, and things in it with names to hover', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      expect(pieceData(room).pieces.map((p) => p.name)).toEqual(expect.arrayContaining(['counter', 'shelf', 'table', 'workbench']));
      expect(Object.keys(zh.ui.objects[room].zones).sort()).toEqual(Object.keys(en.ui.objects[room].zones).sort());
    }
  });

  it('has the keeper greet whoever comes in, and talk when the shop is quiet, about thirty things each', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      const { lines } = ruleBook(room);
      expect(lines.shop_in?.length, room).toBeGreaterThanOrEqual(3);
      expect(lines.shop_idle?.length, room).toBeGreaterThanOrEqual(30);
      expect(new Set(lines.shop_idle!.map((l) => l.speaker))).toEqual(new Set([ROOM_CREW[room][0]]));
    }
  });
});
