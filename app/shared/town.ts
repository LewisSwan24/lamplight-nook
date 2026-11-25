import type { GuestId } from './types';

/** The town's shops, left to right along the street (road-to-1.4.md D1). */
export type ShopId = 'cafe' | 'study' | 'print' | 'studio' | 'workshop' | 'bakery' | 'post';

/** Something gathered in the town and the day it came. */
export type Gathered = { id: string; date: string };

/**
 * What the town keeps beyond the home shop (road-to-1.4.md D7). The home shop is the one picked in settings (Q-D4), and
 * its count and what it gathered are still `ShopDays.done` and `grown`: they go wherever the counter goes.
 */
export type TownDays = {
  /** The other shops, each counting its own (D5). */
  shops: Partial<Record<ShopId, { done: number; grown: Gathered[] }>>;
  /** What stands on the street (D5). */
  street: Gathered[];
  /** How far each neighbour's story has got: the day each chapter was told (D4, shared/stories.ts). */
  stories: Partial<Record<GuestId, string[]>>;
};

export const emptyTown = (): TownDays => ({ shops: {}, street: [], stories: {} });

/** In `ShopDays.told` once the shop has been seen moving onto the street, or never had to. */
export const TOWN_MOVE = 'town-move';
