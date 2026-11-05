/**
 * Someone on the street, seen through the windows on their way to or from the front door. Only real comings and goings:
 * a neighbour dropping in, or Xiaoju out on an errand. Pure: where they walk and for how long.
 */

/** The window panes in cafe.png and study.png (scripts/art/scene.py). */
export const WINDOW_PANES = [{ x: 18, y: 12, w: 24, h: 18 }, { x: 54, y: 12, w: 24, h: 18 }, { x: 199, y: 12, w: 24, h: 18 }];

/** Far enough below the sill that only head and shoulders show in the glass. */
export const PASSER_FEET = 44;

/** Pixels per second: a little quicker than in the shop, as on the street (street.ts). */
const SPEED = 72;
const FAR_END = 4;
/** Just past the front door, which they turn in at. */
const DOOR_END = 296;

/** From the far end of the wall to the door coming in, and back again going out. */
export function passBy(way: 'in' | 'out'): { from: number; to: number; ms: number } {
  const ms = Math.round(((DOOR_END - FAR_END) / SPEED) * 1000);
  return way === 'in' ? { from: FAR_END, to: DOOR_END, ms } : { from: DOOR_END, to: FAR_END, ms };
}
