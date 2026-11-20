import { currentScene } from '../../shared/scenes';
import { doorOf, TOWN } from './town';

/**
 * The street outside the shop, seen through a small inset while Xiaoju is out on an errand. Since 1.4 it is the town's
 * own street (town.ts, scripts/art/town.py), the lower part of it: the inset pans along it to follow her, and out on
 * the street one sees her in the same place.
 */

export const STREET = { width: TOWN.width, height: 58 } as const;

/** The inset on the canvas, wooden border included: bottom right, clear of the counter, the table seats and Laoshi's corner. */
export const INSET = { x: 190, y: 116, w: 128, h: 62, border: 2 } as const;

/** The part of the strip that shows through the inset. */
export const VIEW = { x: INSET.x + INSET.border, y: INSET.y + INSET.border, w: INSET.w - 2 * INSET.border, h: INSET.h - 2 * INSET.border } as const;

export type StopId = 'nook' | 'bakery' | 'library' | 'post';

/** Strip y of feet on the pavement. */
export const PAVEMENT_Y = 54;

/** The town's y at the top of the strip, so that feet on the strip stand on the town's pavement. */
export const STRIP_TOP = TOWN.kerb + 10 - PAVEMENT_Y;

const home = currentScene();
/**
 * Strip x of each door Xiaoju stops at: the shop's own, the bakery, the post office, and for books the other room
 * (the study from the cafe, the cafe from the study), which holds the town's library since 1.4.
 */
export const STOPS: Record<StopId, number> = {
  nook: doorOf(home).x,
  library: doorOf(home === 'study' ? 'cafe' : 'study').x,
  bakery: doorOf('bakery').x,
  post: doorOf('post').x,
};

/** Xiaoju hurries along the street a little faster than she walks in the shop (canvas pixels per second). */
export const STREET_SPEED = 72;

/** Looking things up on the web is posting letters and waiting for answers; reading and searching is the library. */
const WEB_TOOLS = new Set(['WebSearch', 'WebFetch']);

/** Which shop a tool sends her to. */
export function stopForTool(tool?: string): StopId {
  return tool && WEB_TOOLS.has(tool) ? 'post' : 'library';
}

/** How far the strip scrolls so that x sits in the middle of the inset, without showing past either end. */
export function panFor(x: number): number {
  return Math.round(Math.min(Math.max(x - VIEW.w / 2, 0), STREET.width - VIEW.w));
}

/**
 * The way home from a shop: past the bakery for a snack to share with the others,
 * then in at the shop's own door.
 */
export function routeHome(from: number): StopId[] {
  return from > STOPS.bakery ? ['bakery', 'nook'] : ['nook'];
}

/** Milliseconds to walk between two strip x positions. */
export function walkMs(from: number, to: number): number {
  return (Math.abs(to - from) / STREET_SPEED) * 1000;
}
