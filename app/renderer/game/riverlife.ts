import type { Period } from './daytime';
import type { Outside } from './streetdecor';
import { RIVER, TOWN } from './town';

/**
 * The river in front of the river street through the day (plan-2.0.md J5): the water follows the weather, two ducks swim
 * to and fro, a boat goes by now and then, and three festivals are kept on it, a dragon boat by day and lanterns afloat
 * in the evening. Pure: what is on the water at a moment, along the river street from its left end; RiverView.ts draws
 * it, and scripts/art/riverlife.py draws the pieces (river-life.png, river-life.json).
 */

/**
 * The open water: in the street's rows, from just under the stone edge (river.py) to the bottom of the picture; along
 * the river street, from where the bridge ends (its shadow lies on the water under it) to the far end.
 */
export const WATER = { top: TOWN.road + 4, bottom: TOWN.height, left: RIVER.bridge.x + RIVER.bridge.w - RIVER.x } as const;

export type Water = 'calm' | 'ripples' | 'ice' | 'glint';

/** Rain rings the water, a winter's snow freezes it over, the sun glints on it by day; otherwise it lies calm. */
export function waterOf(outside: Outside, period: Period): Water {
  if (outside.sky === 'rain' || outside.sky === 'storm') return 'ripples';
  if (outside.sky === 'snow' && outside.season === 'winter') return 'ice';
  if (outside.sky === 'clear' && period === 'day') return 'glint';
  return 'calm';
}

export type RiverOut = { water: Water; ducks: boolean; boat: boolean; dragonBoat: boolean; lanterns: 'lotus' | 'moon' | null };

/**
 * What is out on the river: nothing on the ice; the ducks asleep at night and sheltering in a storm, when nobody rows
 * out either; on the dragon boat festival the dragon boat instead of the little boat, by day; on the lantern festival
 * lotus lanterns and at mid-autumn moon lanterns, afloat from dusk.
 */
export function riverOut(outside: Outside, period: Period): RiverOut {
  const water = waterOf(outside, period);
  const open = water !== 'ice';
  const light = period !== 'night';
  const dragonBoat = open && light && outside.holiday === 'dragon_boat';
  const evening = period === 'dusk' || period === 'night';
  const lanterns = !open || !evening ? null : outside.holiday === 'lantern' ? 'lotus' : outside.holiday === 'mid_autumn' ? 'moon' : null;
  return {
    water,
    ducks: open && light && outside.sky !== 'storm',
    boat: open && light && outside.sky !== 'storm' && !dragonBoat,
    dragonBoat,
    lanterns,
  };
}

/** A piece on the water: `x` its middle along the river street, `y` its waterline; `flip` when it faces left. */
export type Thing = { kind: 'duck' | 'boat' | 'dragonboat' | 'lantern' | 'moonlantern'; x: number; y: number; flip: boolean; frame: number };

/** The two ducks: where along the river each paddles, how fast (pixels a second), where it starts and its waterline. */
const DUCKS = [
  { left: WATER.left + 20, right: RIVER.width - 40, speed: 8, phase: 120, y: WATER.top + 12 },
  { left: WATER.left + 40, right: RIVER.width - 60, speed: 6, phase: 700, y: WATER.top + 19 },
] as const;
/** The little rowing boat, left to right every two and a half minutes; the dragon boat more often, on its day. */
export const BOAT = { everyMs: 150_000, crossMs: 45_000, from: WATER.left + 16, to: RIVER.width - 16, y: WATER.top + 21 } as const;
export const DRAGON_BOAT = { everyMs: 70_000, crossMs: 30_000, from: WATER.left + 34, to: RIVER.width - 34, y: WATER.bottom - 1 } as const;
/** The lanterns, drifting slowly downstream (to the right), spread along the river street in three rows. */
const LANTERNS = { count: 7, speed: 4, rows: [WATER.top + 9, WATER.top + 15, WATER.top + 21] } as const;
/** How long each of the ducks' two paddling pictures shows. */
const PADDLE_MS = 400;

/** Back and forth between two ends: where, and whether heading back (left). */
function toAndFro(left: number, right: number, travelled: number): { x: number; back: boolean } {
  const span = right - left;
  const d = ((travelled % (2 * span)) + 2 * span) % (2 * span);
  return d < span ? { x: left + d, back: false } : { x: left + 2 * span - d, back: true };
}

/** Where a crossing is at `now`, or null between crossings. */
function crossing(now: number, c: { everyMs: number; crossMs: number; from: number; to: number }): number | null {
  const k = now % c.everyMs;
  return k < c.crossMs ? c.from + ((c.to - c.from) * k) / c.crossMs : null;
}

/**
 * What is on the water at `now` (ms). With less motion asked for nothing moves: the ducks and the lanterns rest where
 * they start, and no boat crosses.
 */
export function riverThings(now: number, out: RiverOut, calm: boolean): Thing[] {
  const t = calm ? 0 : now;
  const things: Thing[] = [];
  if (out.ducks) {
    for (const d of DUCKS) {
      const { x, back } = toAndFro(d.left, d.right, d.phase + (t * d.speed) / 1000);
      things.push({ kind: 'duck', x: Math.round(x), y: d.y, flip: back, frame: Math.floor(t / PADDLE_MS) % 2 });
    }
  }
  if (!calm && out.boat) {
    const x = crossing(now, BOAT);
    if (x !== null) things.push({ kind: 'boat', x: Math.round(x), y: BOAT.y, flip: false, frame: 0 });
  }
  if (!calm && out.dragonBoat) {
    const x = crossing(now, DRAGON_BOAT);
    if (x !== null) things.push({ kind: 'dragonboat', x: Math.round(x), y: DRAGON_BOAT.y, flip: false, frame: 0 });
  }
  if (out.lanterns) {
    const kind = out.lanterns === 'lotus' ? 'lantern' : 'moonlantern';
    for (let i = 0; i < LANTERNS.count; i++) {
      const span = RIVER.width - WATER.left;
      const x = WATER.left + (((i * span) / LANTERNS.count + (t * LANTERNS.speed) / 1000) % span);
      things.push({ kind, x: Math.round(x), y: LANTERNS.rows[i % LANTERNS.rows.length], flip: false, frame: 0 });
    }
  }
  return things;
}
