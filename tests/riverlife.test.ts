import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { BOAT, DRAGON_BOAT, WATER, riverOut, riverThings, waterOf } from '../app/renderer/game/riverlife';
import { CAMERA_W, RIVER, cameraFor, riverInView } from '../app/renderer/game/town';
import type { Outside } from '../app/renderer/game/streetdecor';

const out = (o: Partial<Outside>): Outside => ({ season: 'spring', holiday: null, sky: 'clear', ...o });
const MIN = 60_000;

// plan-2.0.md J5: the river in front of the river street follows the weather and the festivals.
describe('the river through the day', () => {
  it('ripples in the rain, freezes over in the snow, glints in the sun and lies calm otherwise', () => {
    expect(waterOf(out({ sky: 'rain' }), 'day')).toBe('ripples');
    expect(waterOf(out({ sky: 'storm' }), 'night')).toBe('ripples');
    expect(waterOf(out({ season: 'winter', sky: 'snow' }), 'day')).toBe('ice');
    expect(waterOf(out({ sky: 'clear' }), 'day')).toBe('glint');
    // No sun to glint at night, nor through fog.
    expect(waterOf(out({ sky: 'clear' }), 'night')).toBe('calm');
    expect(waterOf(out({ sky: 'fog' }), 'day')).toBe('calm');
  });

  it('has ducks and now and then a boat, but nothing out on the ice, and the ducks asleep at night', () => {
    expect(riverOut(out({}), 'day')).toMatchObject({ ducks: true, boat: true, dragonBoat: false, lanterns: null });
    expect(riverOut(out({ season: 'winter', sky: 'snow' }), 'day')).toMatchObject({ water: 'ice', ducks: false, boat: false });
    expect(riverOut(out({}), 'night')).toMatchObject({ ducks: false, boat: false });
    // No one rows out in a storm.
    expect(riverOut(out({ sky: 'storm' }), 'day')).toMatchObject({ boat: false });
  });

  it('keeps three festivals on the river: a dragon boat by day, lanterns afloat in the evening', () => {
    expect(riverOut(out({ holiday: 'dragon_boat' }), 'day')).toMatchObject({ dragonBoat: true, boat: false });
    expect(riverOut(out({ holiday: 'dragon_boat' }), 'night').dragonBoat).toBe(false);
    expect(riverOut(out({ holiday: 'lantern' }), 'night').lanterns).toBe('lotus');
    expect(riverOut(out({ holiday: 'mid_autumn' }), 'dusk').lanterns).toBe('moon');
    expect(riverOut(out({ holiday: 'mid_autumn' }), 'day').lanterns).toBe(null);
    // The lantern festival falls in winter: on the ice there are none.
    expect(riverOut(out({ holiday: 'lantern', season: 'winter', sky: 'snow' }), 'night').lanterns).toBe(null);
    expect(riverOut(out({ holiday: 'christmas' }), 'night')).toMatchObject({ dragonBoat: false, lanterns: null });
  });
});

describe('what swims and floats on it', () => {
  const day = riverOut(out({}), 'day');
  const kinds = (things: { kind: string }[]) => things.map((t) => t.kind);

  it('keeps everything on the water, along the river street past the bridge', () => {
    expect(WATER.left).toBe(RIVER.bridge.x + RIVER.bridge.w - RIVER.x);
    for (let t = 0; t < 20 * MIN; t += 7_919) {
      for (const thing of riverThings(t, riverOut(out({ holiday: 'dragon_boat' }), 'day'), false).concat(riverThings(t, riverOut(out({ holiday: 'lantern' }), 'night'), false))) {
        expect(thing.y, `${thing.kind} at ${t}`).toBeGreaterThan(WATER.top);
        expect(thing.y, `${thing.kind} at ${t}`).toBeLessThanOrEqual(WATER.bottom);
        // Out from under the bridge, which casts the water at the river street's left end in shadow.
        expect(thing.x, `${thing.kind} at ${t}`).toBeGreaterThanOrEqual(WATER.left);
        expect(thing.x, `${thing.kind} at ${t}`).toBeLessThanOrEqual(RIVER.width);
      }
    }
  });

  it('has two ducks swimming to and fro, turning at the ends', () => {
    const at = (t: number) => riverThings(t, day, false).filter((x) => x.kind === 'duck');
    expect(at(0)).toHaveLength(2);
    const later = at(5_000);
    expect(later.map((d) => d.x)).not.toEqual(at(0).map((d) => d.x));
    const facings = new Set<boolean>();
    for (let t = 0; t < 10 * MIN; t += 3_000) facings.add(at(t)[0].flip);
    expect([...facings].sort()).toEqual([false, true]);
  });

  it('sends a boat across now and then, not all the time', () => {
    let crossing = 0;
    const steps = 30 * 60;
    for (let s = 0; s < steps; s++) if (kinds(riverThings(s * 1000, day, false)).includes('boat')) crossing++;
    expect(crossing).toBeGreaterThan(0);
    expect(crossing / steps).toBeLessThan(0.5);
    expect(BOAT.everyMs).toBeGreaterThan(BOAT.crossMs);
    expect(DRAGON_BOAT.everyMs).toBeGreaterThan(DRAGON_BOAT.crossMs);
  });

  it('floats the festival lanterns, lotus or moon', () => {
    expect(kinds(riverThings(0, riverOut(out({ holiday: 'lantern' }), 'night'), false)).filter((k) => k === 'lantern').length).toBeGreaterThanOrEqual(5);
    expect(kinds(riverThings(0, riverOut(out({ holiday: 'mid_autumn' }), 'night'), false))).toContain('moonlantern');
  });

  it('holds still when less motion is asked for: no boat crossing, the ducks and lanterns where they rest', () => {
    const still = riverOut(out({ holiday: 'dragon_boat' }), 'day');
    const a = riverThings(0, still, true);
    expect(riverThings(90_000, still, true)).toEqual(a);
    expect(kinds(a)).not.toContain('boat');
    expect(kinds(a)).not.toContain('dragonboat');
    expect(kinds(a)).toContain('duck');
  });
});

describe('the river’s pictures and words', () => {
  const ROOT = join(__dirname, '..');

  it('has every piece drawn, and an ice sheet from the bridge to the end of the river street', () => {
    const json = JSON.parse(readFileSync(join(ROOT, 'assets/sprites/river-life.json'), 'utf8')) as { frames: Record<string, [number, number, number, number]> };
    for (const name of ['duck-0', 'duck-1', 'boat', 'dragonboat', 'lantern', 'moonlantern', 'glint', 'ripple-0', 'ripple-1', 'ripple-2', 'ice']) {
      expect(json.frames[name], name).toBeDefined();
    }
    expect(json.frames.ice[2]).toBe(RIVER.width - WATER.left);
    expect(json.frames.ice[3]).toBe(WATER.bottom - WATER.top);
    expect(existsSync(join(ROOT, 'assets/sprites/river-life.png'))).toBe(true);
  });

  it('gives each keeper on the river street things to say about the river, the same in both languages', () => {
    for (const [shop, prefix] of [['flowershop', 'fl_river_'], ['bookshop', 'bs_river_']]) {
      const ids = (lang: string) => (parse(readFileSync(join(ROOT, 'lines', ...(lang === 'en' ? ['en'] : []), `${shop}.yaml`), 'utf8')).shop_idle as { id: string; when?: string }[]).filter((l) => l.id.startsWith(prefix));
      const zh = ids('zh');
      expect(zh.length, shop).toBeGreaterThanOrEqual(12);
      expect(ids('en').map((l) => [l.id, l.when])).toEqual(zh.map((l) => [l.id, l.when]));
      for (const when of ['sky_rain', 'sky_snow', 'holiday_dragon_boat', 'holiday_lantern', 'holiday_mid_autumn']) {
        expect(zh.some((l) => l.when === when), `${shop} ${when}`).toBe(true);
      }
    }
  });
});

// plan-2.0.md J10, as road-to-1.4.md D8 saves the computer: the street left behind rests. The river is only moved on while
// some of the river street is on screen.
describe('the river at rest while the first street is looked at', () => {
  it('is on screen only once the camera reaches past the end of the first street', () => {
    expect(riverInView(0)).toBe(false);
    expect(riverInView(RIVER.x - CAMERA_W)).toBe(false);
    expect(riverInView(RIVER.x - CAMERA_W + 1)).toBe(true);
    expect(riverInView(cameraFor(RIVER.tower.x))).toBe(true);
    expect(riverInView(cameraFor(RIVER.x + RIVER.width))).toBe(true);
  });
});
