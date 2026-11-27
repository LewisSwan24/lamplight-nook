import type { RoomId } from '../../shared/scenes';
import type { ActorId } from '../../shared/types';
import type { Line } from '../translator/lines';
import type { Period } from './daytime';
import { CANVAS, type Facing, walkBetween } from './layout';
import { type Area, findPath } from './path';
import type { Sky } from './weather';

/**
 * The back garden: a second room behind the shop, through the back door. When the shop is quiet the
 * staff (and the cat) step out now and then to see to the vegetables, water the flowers or sit under
 * the tree; clicking the back door looks out at them. The garden picture is assets/sprites/garden.png
 * (scripts/art/garden.py); it lives beside the shop in the same scene and the camera slides over to it.
 */

/** World x of the garden's left edge: right of the shop with a gap, so nothing of one shows in the other. */
export const GARDEN_X = CANVAS.width + 80;

type Point = { x: number; y: number };

/** The back door in the shop (top-left of the door sprite) and where to stand in front of it, inside. */
export const BACK_DOOR = { x: 152, y: 164, w: 16, h: 16 } as const;
export const BACK_DOOR_SPOT = { x: 160, y: 172 } as const;
/** The same door seen from the garden (garden coordinates), and where to stand outside it. */
export const GARDEN_DOOR = { x: 152, y: 16 } as const;
export const GARDEN_DOOR_SPOT = { x: 160, y: 56 } as const;
/**
 * What walkers go round in the garden, placed by scripts/art/garden.py: the four planters, the flower boxes along the
 * fence, the henhouse, the tree, the doghouse and its bowl. The bench is left out: people sit on it.
 */
export const GARDEN_AREA: Area = {
  left: 6, right: 314, top: 50, bottom: 158,
  obstacles: [
    { left: 20, right: 52, top: 70, bottom: 92 },
    { left: 54, right: 86, top: 70, bottom: 92 },
    { left: 20, right: 52, top: 98, bottom: 120 },
    { left: 54, right: 86, top: 98, bottom: 120 },
    { left: 112, right: 196, top: 136, bottom: 152 },
    { left: 172, right: 236, top: 22, bottom: 70 },
    { left: 236, right: 278, top: 46, bottom: 100 },
    { left: 284, right: 316, top: 42, bottom: 88 },
    { left: 266, right: 282, top: 82, bottom: 94 },
  ],
};

export type SpotId = 'veg' | 'flowers' | 'bench' | 'lawn' | 'hens' | 'sun';

export type GardenSpot = {
  id: SpotId;
  /** Garden coordinates of the feet. */
  x: number;
  y: number;
  facing: Facing;
  /** A staff animation (sprites.ts); one-off ones (pick_up, lift) are repeated now and then. 'lie' is the cat's. */
  anim: string;
  who: ActorId[];
};

/** What there is to do out there, and who likes doing it. Places match scripts/art/garden.py. */
export const SPOTS: GardenSpot[] = [
  { id: 'veg', x: 54, y: 132, facing: 'up', anim: 'pick_up', who: ['xiaoju', 'laoshi', 'xiaodou'] },
  { id: 'flowers', x: 140, y: 128, facing: 'down', anim: 'lift', who: ['xiaoju', 'adeng', 'qingdai'] },
  { id: 'bench', x: 296, y: 112, facing: 'left', anim: 'sit', who: ['adeng', 'laoshi'] },
  { id: 'lawn', x: 208, y: 140, facing: 'down', anim: 'read', who: ['adeng', 'xiaoju', 'qingdai'] },
  // Scattering grain for the hens in front of the henhouse (game/animals.ts).
  { id: 'hens', x: 206, y: 106, facing: 'up', anim: 'pick_up', who: ['xiaoju', 'adeng', 'xiaodou'] },
  { id: 'sun', x: 122, y: 100, facing: 'down', anim: 'lie', who: ['cat'] },
];

/** In the shop: from wherever someone stands to the back door. */
export function pathToBackDoor(from: Point, scene: RoomId): Point[] {
  return walkBetween(from, BACK_DOOR_SPOT, scene);
}

/** In the garden: from one point to another, round whatever stands in the way. */
export function pathInGarden(from: Point, to: Point): Point[] {
  return findPath(GARDEN_AREA, from, to);
}


/**
 * Who would go out to the garden in this weather at this hour: nobody in the rain or after dark,
 * and the cat stays in by the fire when it snows.
 */
export function outdoorsFor(free: ActorId[], sky: Sky, period: Period): ActorId[] {
  if (!gardenOpen(sky, period)) return [];
  return sky === 'snow' ? free.filter((a) => a !== 'cat') : free;
}

/** Whether anyone goes out at all; when not, whoever is out there comes back in. */
export function gardenOpen(sky: Sky, period: Period): boolean {
  return sky !== 'rain' && sky !== 'wind' && sky !== 'storm' && period !== 'night';
}

/** How long a visit lasts, and how long the garden stays empty between visits. */
export const VISIT_MS = [60_000, 150_000] as const;
export const GAP_MS = [150_000, 360_000] as const;

export type GardenStep = { go?: { actor: ActorId; spot: GardenSpot }; back: ActorId[] };

/**
 * Decides who goes out to the garden and when they come back. Pure: the caller asks every few
 * seconds with whether the shop is quiet and who is free, and acts on the answer.
 * One visitor at a time; everyone comes back as soon as the shop gets busy.
 */
export class GardenPlanner {
  private visits = new Map<ActorId, number>();
  private nextVisit: number;

  constructor(now: number, private rand: () => number = Math.random) {
    this.nextVisit = now + this.between(GAP_MS);
  }

  get visitors(): ActorId[] {
    return [...this.visits.keys()];
  }

  next(now: number, quiet: boolean, free: ActorId[]): GardenStep {
    if (!quiet) {
      const back = this.visitors;
      this.visits.clear();
      // Once things calm down again, wait a while before anyone wanders off.
      if (back.length || this.nextVisit < now) this.nextVisit = now + this.between(GAP_MS);
      return { back };
    }
    const back = this.visitors.filter((a) => this.visits.get(a)! <= now);
    for (const a of back) this.visits.delete(a);
    if (back.length) this.nextVisit = now + this.between(GAP_MS);
    if (this.visits.size || back.length || now < this.nextVisit) return { back };
    const choices = SPOTS.flatMap((spot) => spot.who.filter((a) => free.includes(a)).map((actor) => ({ actor, spot })));
    if (!choices.length) return { back };
    const go = choices[Math.floor(this.rand() * choices.length)];
    this.visits.set(go.actor, now + this.between(VISIT_MS));
    return { go, back };
  }

  /** Someone came back in on their own (sent for by a commission, say). */
  forget(actor: ActorId) {
    this.visits.delete(actor);
  }

  private between([lo, hi]: readonly [number, number]) {
    return lo + this.rand() * (hi - lo);
  }
}

/** Someone out in the garden says something now and then: every 25 to 50 seconds, one of them. */
export const GARDEN_TALK_MS = [25_000, 50_000] as const;

export type GardenSay = { actor: ActorId; line?: Line };

/**
 * What the people in the garden say (lines/cafe.yaml, group `garden`): each line is for a spot
 * (`when: spot_veg`) or for a kind of weather (`when: sky_snow`), and weather lines come first while
 * they are fresh. The cat has no lines; it just dozes (the caller shows a zzz). Pure, like the planner.
 */
export class GardenTalk {
  private used = new Set<string>();
  private nextAt: number;

  constructor(now: number, private rand: () => number = Math.random) {
    this.nextAt = now + this.between();
  }

  /** Someone just looked out: talk within a few seconds. */
  soon(now: number) {
    this.nextAt = Math.min(this.nextAt, now + 3000);
  }

  next(now: number, lines: Line[], visitors: { id: ActorId; spot: SpotId }[], sky: Sky): GardenSay | null {
    if (!visitors.length) {
      // Nobody out there: whoever goes out next settles in before saying anything.
      this.nextAt = Math.max(this.nextAt, now + GARDEN_TALK_MS[0]);
      return null;
    }
    if (now < this.nextAt) return null;
    this.nextAt = now + this.between();
    const who = visitors[Math.floor(this.rand() * visitors.length)];
    if (who.id === 'cat') return { actor: 'cat' };
    const mine = lines.filter((l) => l.speaker === who.id);
    const fits = [...mine.filter((l) => l.when === `sky_${sky}`), ...mine.filter((l) => l.when === `spot_${who.spot}`)];
    let fresh = fits.filter((l) => !this.used.has(l.id));
    if (!fresh.length) {
      for (const l of fits) this.used.delete(l.id);
      fresh = fits;
    }
    const line = fresh.find((l) => l.when === `sky_${sky}`) ?? fresh[Math.floor(this.rand() * fresh.length)];
    if (!line) return null;
    this.used.add(line.id);
    return { actor: who.id, line };
  }

  private between() {
    const [lo, hi] = GARDEN_TALK_MS;
    return lo + this.rand() * (hi - lo);
  }
}
