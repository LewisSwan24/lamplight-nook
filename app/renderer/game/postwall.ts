import { KEPT_MAX } from '../../shared/postcard';
import type { SceneId } from '../../shared/scenes';

/**
 * The cork board on the post office's wall (plan-1.6.md F2), above the sorting rack (scripts/art/post.py draws the board):
 * the postcards the shop has opened, newest top left, three to a row. Each is a little card with a stamp in a colour for
 * where the friend's shop is, and a click on it opens the visit again. Pure: where they hang and what colour.
 */
export const CORK = { x: 128, y: 18, w: 40, h: 16 } as const;
export const WALL_CARD = { w: 9, h: 6 } as const;
const PER_ROW = 3;

export function wallSpots(n: number): { x: number; y: number }[] {
  return Array.from({ length: Math.min(n, KEPT_MAX) }, (_, i) => ({
    x: CORK.x + 3 + (i % PER_ROW) * (WALL_CARD.w + 3),
    y: CORK.y + 2 + Math.floor(i / PER_ROW) * (WALL_CARD.h + 1),
  }));
}

const STAMPS: Record<SceneId, number> = { cafe: 0xc8483c, study: 0x48689c };
export const stampColour = (home: SceneId): number => STAMPS[home];

/** A pinned card's place on the board, from its hit target (`wall-<n>`). */
export function wallIndex(target: string): number | null {
  const m = /^wall-(\d)$/.exec(target);
  return m ? Number(m[1]) : null;
}
