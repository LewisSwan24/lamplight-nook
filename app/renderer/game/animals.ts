import type { Period } from './daytime';
import type { Facing } from './layout';
import { DIRECTIONS } from './sprites';
import type { Sky } from './weather';

/**
 * The back garden's animals: Malt the dog, who lives in the doghouse in the corner, and three hens
 * from the henhouse against the wall. They are always out there (not visitors like the staff), keep
 * to their own corners, go in when it rains or gets dark, and come over to whoever visits.
 * Places match scripts/art/garden.py; the sprites come from scripts/art/animals.py. Pure: the
 * garden view asks for the next thing to do and acts it out.
 */

type Point = { x: number; y: number };
type Area = { x: number; y: number; w: number; h: number };
type Anim = { row: number; frames: number; fps: number; repeat: number };

/** dog.png: 48x32 frames, 24 to a row, each animation facing right, up, left and down in turn. */
export const DOG_FRAME = { width: 48, height: 32, perRow: 24 } as const;
export const DOG_ANIMS: Record<'idle' | 'walk' | 'eat' | 'bark', Anim> = {
  idle: { row: 0, frames: 6, fps: 6, repeat: -1 },
  walk: { row: 1, frames: 6, fps: 10, repeat: -1 },
  eat: { row: 2, frames: 6, fps: 6, repeat: -1 },
  bark: { row: 3, frames: 3, fps: 8, repeat: 2 },
};
/** Where the dog's feet are across its frame: sideways, the body is drawn off centre. */
export const DOG_ORIGIN_X: Record<Facing, number> = { right: 18 / 48, left: 30 / 48, up: 0.5, down: 0.5 };
/** dog-sleep.png: the doghouse with Malt curled up inside, 32x48, drawn over the doghouse in garden.png. */
export const DOG_SLEEP_FRAMES = 8;

/** hens.png: 16x16 frames, 24 to a row; three rows per hen (idle, walk, peck with 2 frames each way). */
export const HEN_FRAME = { width: 16, height: 16, perRow: 24 } as const;
export const HEN_ANIMS: Record<'idle' | 'walk' | 'peck', Anim> = {
  idle: { row: 0, frames: 6, fps: 6, repeat: -1 },
  walk: { row: 1, frames: 6, fps: 10, repeat: -1 },
  peck: { row: 2, frames: 2, fps: 4, repeat: -1 },
};
export const HENS = 3;

/** Frame indexes for one animal's animation facing one way. `base` is the animal's first row on the sheet. */
export function animalFrames(anim: Anim, perRow: number, facing: Facing, base = 0): number[] {
  const first = (base + anim.row) * perRow + DIRECTIONS.indexOf(facing) * anim.frames;
  return Array.from({ length: anim.frames }, (_, i) => first + i);
}

/** Walking speeds in pixels per second. */
export const DOG_SPEED = 40;
export const HEN_SPEED = 18;

/** The doghouse (top-left of the sleeping sprite), Malt's place in front of it and the food bowl. */
export const DOGHOUSE = { x: 284, y: 42 } as const;
export const DOG_HOME = { x: 300, y: 100 } as const;
export const BOWL_SPOT = { x: 256, y: 97 } as const;
/** The right-hand lawn, Malt's patch. */
export const DOG_AREA: Area = { x: 216, y: 104, w: 92, h: 42 };
/** In front of the henhouse, where the hens scratch about, and its door. */
export const HEN_AREA: Area = { x: 176, y: 76, w: 56, h: 30 };
export const HENHOUSE_DOOR = { x: 194, y: 72 } as const;
/** Where anyone walks in the garden: the lawn between the wall and the fence. */
export const LAWN: Area = { x: 10, y: 60, w: 300, h: 92 };

const REST_MS = { dog: [7000, 16000], hen: [2500, 7000] } as const;

export type DogPlan = { do: 'sit' | 'eat' | 'sleep'; to: Point; facing: Facing; ms: number };
export type HenPlan = { do: 'stand' | 'peck' | 'roost'; to: Point; facing: Facing; ms: number };

/** Out of the rain and the dark: Malt in the doghouse, the hens in the henhouse. */
export function indoors(sky: Sky, period: Period): boolean {
  return sky === 'rain' || period === 'night';
}

const between = (rand: () => number, [lo, hi]: readonly [number, number]) => lo + rand() * (hi - lo);
const pointIn = (rand: () => number, a: Area): Point => ({ x: Math.round(a.x + rand() * a.w), y: Math.round(a.y + rand() * a.h) });
const clamp = (p: Point, a: Area): Point => ({ x: Math.min(a.x + a.w, Math.max(a.x, p.x)), y: Math.min(a.y + a.h, Math.max(a.y, p.y)) });
const sideways = (from: Point, to: Point): Facing => (to.x >= from.x ? 'right' : 'left');

/**
 * What Malt does next. With someone out in the garden (`company`, their feet) he goes and sits beside
 * them; otherwise he sits by the doghouse, wanders his patch of lawn or has something from the bowl.
 */
export function dogPlan(rand: () => number, sky: Sky, period: Period, company: Point | null): DogPlan {
  if (indoors(sky, period)) return { do: 'sleep', to: { ...DOG_HOME }, facing: 'up', ms: 60_000 };
  const ms = between(rand, REST_MS.dog);
  if (company) {
    // Beside them, on whichever side has room, a step in front so neither hides the other.
    const side = company.x > LAWN.x + LAWN.w - 20 ? -18 : 18;
    const to = clamp({ x: company.x + side, y: company.y + 3 }, LAWN);
    return { do: 'sit', to, facing: sideways(to, company), ms };
  }
  const roll = rand();
  if (roll < 0.4) return { do: 'sit', to: { ...DOG_HOME }, facing: 'down', ms };
  if (roll < 0.8) return { do: 'sit', to: pointIn(rand, DOG_AREA), facing: rand() < 0.5 ? 'down' : 'left', ms };
  return { do: 'eat', to: { ...BOWL_SPOT }, facing: 'right', ms };
}

/**
 * What a hen does next: scratch and peck about in front of the henhouse, or crowd round whoever is
 * scattering grain (`feeder`, their feet).
 */
export function henPlan(rand: () => number, sky: Sky, period: Period, feeder: Point | null): HenPlan {
  if (indoors(sky, period)) return { do: 'roost', to: { ...HENHOUSE_DOOR }, facing: 'up', ms: 60_000 };
  const ms = between(rand, REST_MS.hen);
  if (feeder) {
    const to = clamp({ x: Math.round(feeder.x - 18 + rand() * 36), y: Math.round(feeder.y - 16 + rand() * 8) }, LAWN);
    return { do: 'peck', to, facing: sideways(to, feeder), ms };
  }
  const to = pointIn(rand, HEN_AREA);
  return { do: rand() < 0.6 ? 'peck' : 'stand', to, facing: rand() < 0.5 ? 'left' : 'right', ms };
}
