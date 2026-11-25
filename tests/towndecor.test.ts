import { describe, expect, it } from 'vitest';
import town from '../assets/sprites/town.json';
import { DECOR, decorOut, putAway, roomDecor, umbrellaUp } from '../app/renderer/game/streetdecor';
import { HOLIDAYS, SEASONS } from '../app/renderer/game/weather';
import { readPng } from './png';

const sheet = readPng('assets/sprites/town-decor.png');
const of = (id: string) => DECOR.parts.filter((p) => p.id === id);
const lot = town.lot;
/** How many pixels a kind of piece paints on the street between two x. */
const paint = (id: string, from: number, to: number, inLot = false) => {
  let n = 0;
  for (const p of of(id).filter((p) => !!p.lot === inLot)) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.x + x >= from && p.x + x < to && sheet.at(p.sx + x, p.sy + y).alpha > 0) n++;
  }
  return n;
};

describe('the street through the year (road-to-1.4.md D6)', () => {
  it('cuts every piece from inside the sheet and stands it on the street', () => {
    for (const p of [...DECOR.parts, DECOR.umbrella]) {
      expect(p.sx + p.w, JSON.stringify(p)).toBeLessThanOrEqual(sheet.width);
      expect(p.sy + p.h, JSON.stringify(p)).toBeLessThanOrEqual(sheet.height);
    }
    for (const p of DECOR.parts) {
      expect(p.x >= 0 && p.x + p.w <= town.width && p.y >= 0 && p.y + p.h <= town.height, JSON.stringify(p)).toBe(true);
    }
  });

  it('puts snow on the roofs in winter and leaves on the trees in autumn, all along the street', () => {
    const across = (id: string) => [Math.min(...of(id).map((p) => p.x)), Math.max(...of(id).map((p) => p.x + p.w))];
    const [left, right] = across('winter');
    // The post office is the one front too tall for its roof to show.
    const bakery = town.fronts.find((f) => f.id === 'bakery')!;
    expect(left).toBeLessThan(town.fronts[0].x + 8);
    expect(right).toBeGreaterThan(bakery.x + bakery.w - 8);
    // The roofs are at the top of the picture.
    expect(of('winter').some((p) => p.y < 10)).toBe(true);
    for (const season of SEASONS) expect(of(season).length, season).toBeGreaterThan(0);
  });

  it('hangs two lanterns at every door for the New Year', () => {
    // A lantern is about fifty pixels of paint; count what hangs over each front.
    // Beside a door at the end of a front, a lantern hangs over the alley (eight pixels wide).
    for (const f of town.fronts) expect(paint('new_year', f.x - 8, f.x + f.w + 8), f.id).toBeGreaterThan(2 * 45);
  });

  it('puts something up at every door for every festival', () => {
    // A wreath, the smallest of them, is about thirty pixels of paint.
    for (const h of HOLIDAYS) for (const f of town.fronts) expect(paint(h, f.x - 8, f.x + f.w + 8), `${h} at the ${f.id}`).toBeGreaterThan(24);
  });

  it('gives every festival its own piece in the lot, where the cart stands', () => {
    for (const h of HOLIDAYS) {
      const there = of(h).filter((p) => p.lot);
      expect(there.length, h).toBeGreaterThan(0);
      for (const p of there) {
        expect(p.x >= lot.x && p.x + p.w <= lot.x + lot.w, `${h} stands in the lot`).toBe(true);
        expect(p.y + p.h, `${h} stays off the pavement`).toBeLessThanOrEqual(town.kerb);
      }
    }
  });

  it('leaves puddles in the rain and snow on the ground when it snows, both on the ground layer', () => {
    for (const sky of ['rain', 'snow']) {
      expect(of(sky).length, sky).toBeGreaterThan(0);
      for (const p of of(sky)) expect(p.ground && p.y + p.h > town.kerb, `${sky} lies on the pavement or road`).toBe(true);
    }
  });

  it('shows the season, the festival and the weather of the day, and nothing else', () => {
    const outside = { season: 'winter', holiday: 'christmas', sky: 'snow' } as const;
    const out = new Set(DECOR.parts.filter((p) => decorOut(p, outside, ['park'])).map((p) => p.id));
    expect([...out].sort()).toEqual(['christmas', 'snow', 'winter']);
    const plain = DECOR.parts.filter((p) => decorOut(p, { season: 'summer', holiday: null, sky: 'clear' }, ['park']));
    expect(new Set(plain.map((p) => p.id))).toEqual(new Set(['summer']));
  });

  it('decorates the trees in the lot only once they have grown', () => {
    const withPark = DECOR.parts.filter((p) => p.with === 'park');
    expect(withPark.length).toBeGreaterThan(0);
    const spring = { season: 'spring', holiday: null, sky: 'clear' } as const;
    for (const p of withPark.filter((p) => p.id === 'spring')) {
      expect(decorOut(p, spring, [])).toBe(false);
      expect(decorOut(p, spring, ['park'])).toBe(true);
    }
  });

  it('puts the cart away while a festival stands in its place', () => {
    expect(putAway({ season: 'autumn', holiday: 'mid_autumn', sky: 'clear' })).toEqual(['stall']);
    expect(putAway({ season: 'winter', holiday: 'new_year', sky: 'clear' })).toEqual(['stall']);
    expect(putAway({ season: 'autumn', holiday: null, sky: 'rain' })).toEqual([]);
  });

  it('opens an umbrella in rain and snow', () => {
    expect(umbrellaUp('rain')).toBe(true);
    expect(umbrellaUp('snow')).toBe(true);
    for (const sky of ['clear', 'petals', 'leaves'] as const) expect(umbrellaUp(sky)).toBe(false);
  });
});

describe('festivals in the shops along the street (D6)', () => {
  it('keeps the home rooms\' own pictures and gives each new shop its own frame', () => {
    expect(roomDecor('cafe', 'christmas')).toEqual({ key: 'decor-christmas' });
    expect(roomDecor('study', 'lantern')).toEqual({ key: 'decor-lantern' });
    expect(roomDecor('print', 'christmas')).toEqual({ key: 'shops-decor', frame: 'print-christmas' });
    expect(roomDecor('workshop', 'mid_autumn')).toEqual({ key: 'shops-decor', frame: 'workshop-mid_autumn' });
    expect(roomDecor('bakery', 'lantern')).toEqual({ key: 'shops-decor', frame: 'bakery-lantern' });
    expect(roomDecor('post', 'christmas')).toEqual({ key: 'shops-decor', frame: 'post-christmas' });
  });

  it('draws something different in each new shop for each festival', () => {
    const shops = readPng('assets/sprites/shops-decor.png');
    const frame = (row: number, col: number) => {
      const px: number[] = [];
      for (let y = row * 180; y < row * 180 + 180; y++) for (let x = col * 320; x < col * 320 + 320; x++) px.push(shops.at(x, y).alpha);
      return px.join();
    };
    const seen = new Set<string>();
    for (let row = 0; row < 3; row++) for (let col = 0; col < HOLIDAYS.length; col++) seen.add(frame(row, col));
    expect(seen.size).toBe(3 * HOLIDAYS.length);
  });
});
