/**
 * The street outside the shop, seen through a small inset while Xiaoju is out on an errand.
 * The strip (assets/sprites/street.png, scripts/art/street.py) is wider than the inset, which pans to follow her.
 */

export const STREET = { width: 560, height: 58 } as const;

/** The inset on the canvas, wooden border included: bottom right, clear of the counter, the table seats and Laoshi's corner. */
export const INSET = { x: 190, y: 116, w: 128, h: 62, border: 2 } as const;

/** The part of the strip that shows through the inset. */
export const VIEW = { x: INSET.x + INSET.border, y: INSET.y + INSET.border, w: INSET.w - 2 * INSET.border, h: INSET.h - 2 * INSET.border } as const;

export type StopId = 'nook' | 'bakery' | 'library' | 'post';

/** Strip x of each shop door (where Xiaoju stands to go in); they match FRONTS in scripts/art/street.py. */
export const STOPS: Record<StopId, number> = { nook: 63, bakery: 232, library: 383, post: 475 };

/** Strip y of feet on the pavement. */
export const PAVEMENT_Y = 54;

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
