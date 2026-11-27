import { describe, expect, it } from 'vitest';
import main from '../assets/sprites/town.json';
import river from '../assets/sprites/river.json';
import { streetOf } from '../app/shared/town';
import { cameraFor, CAMERA_W, doorOf, FRONTS, frontAt, OPEN, RIVER, streetAt, TOWN } from '../app/renderer/game/town';

// plan-2.0.md J1: past the bridge at the far end of the first street, a street along the river.
describe('the river street, as drawn', () => {
  it('starts with the bridge, then the florist, the old clock tower, the bookshop, and the riverbank', () => {
    expect(river.height).toBe(main.height);
    expect(river.kerb).toBe(main.kerb);
    expect(river.bridge.x).toBe(0);
    expect(river.fronts.map((f) => f.id)).toEqual(['flowershop', 'bookshop']);
    const [florist, bookshop] = river.fronts;
    expect(florist.x).toBeGreaterThanOrEqual(river.bridge.x + river.bridge.w);
    expect(river.tower.x).toBeGreaterThanOrEqual(florist.x + florist.w);
    expect(bookshop.x).toBeGreaterThanOrEqual(river.tower.x + river.tower.w);
    // A stretch of riverbank after the bookshop, a canvas wide, for what grows along the river later.
    expect(river.width - (bookshop.x + bookshop.w)).toBeGreaterThanOrEqual(CAMERA_W / 2);
  });

  it('puts each door inside its front', () => {
    for (const f of river.fronts) expect(f.door > f.x && f.door < f.x + f.w).toBe(true);
  });
});

describe('the river street, joined on', () => {
  it('runs on from the end of the first street', () => {
    expect(RIVER.x).toBe(main.width);
    expect(TOWN.width).toBe(main.width + river.width);
  });

  it('has the florist and the bookshop to the right of the post office, where the river street has them', () => {
    const ids = FRONTS.map((f) => f.id);
    expect(ids.slice(-3)).toEqual(['post', 'flowershop', 'bookshop']);
    for (const f of river.fronts) expect(FRONTS.find((g) => g.id === f.id)).toMatchObject({ x: RIVER.x + f.x, w: f.w, door: RIVER.x + f.door });
  });

  it('tells which street a point is on, the bridge going with the first', () => {
    for (const f of FRONTS) expect(streetAt(f.door)).toBe(streetOf(f.id));
    expect(streetAt(RIVER.x + river.bridge.x + river.bridge.w - 1)).toBe('main');
    expect(streetAt(RIVER.x + river.bridge.x + river.bridge.w)).toBe('river');
  });

  it('finds the two new fronts by a click, closed until they open', () => {
    expect(frontAt(doorOf('flowershop').x, TOWN.kerb - 20)).toBe('flowershop');
    expect(frontAt(doorOf('bookshop').x, TOWN.kerb - 20)).toBe('bookshop');
    expect(frontAt(RIVER.x + river.tower.x + 2, TOWN.kerb - 20)).toBeNull();
    expect(OPEN.has('flowershop')).toBe(false);
    expect(OPEN.has('bookshop')).toBe(false);
  });

  it('lets the camera go all the way to the riverbank', () => {
    expect(cameraFor(TOWN.width)).toBe(TOWN.width - CAMERA_W);
    expect(cameraFor(doorOf('bookshop').x)).toBe(doorOf('bookshop').x - CAMERA_W / 2);
  });
});
