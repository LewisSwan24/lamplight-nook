import type { YearDays } from './mainstory';
import type { StaffStories } from './staffstories';
import type { GuestId } from './types';

/** The town's streets: the first one, and the one along the river past the bridge at its far end (plan-2.0.md J0). */
export const STREETS = ['main', 'river'] as const;
export type StreetId = (typeof STREETS)[number];

/** Each shop's street, the shops of a street left to right (road-to-1.4.md D1, plan-2.0.md J0). */
export const SHOP_STREET = {
  cafe: 'main',
  study: 'main',
  print: 'main',
  studio: 'main',
  workshop: 'main',
  bakery: 'main',
  post: 'main',
  flowershop: 'river',
  bookshop: 'river',
} as const satisfies Record<string, StreetId>;

/** The town's shops. */
export type ShopId = keyof typeof SHOP_STREET;

export const streetOf = (id: ShopId): StreetId => SHOP_STREET[id];
export const shopsOn = (street: StreetId): ShopId[] => (Object.keys(SHOP_STREET) as ShopId[]).filter((id) => SHOP_STREET[id] === street);

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
  /** How far each member of staff's own story has got (plan-1.9.md I1, shared/staffstories.ts). Absent before 1.9. */
  staff?: StaffStories;
  /** How far the year's story has got: each chapter's day and works done by then (plan-2.0.md J7). Absent before 2.0. */
  year?: YearDays;
  /** The first day the shop was open for each festival (plan-2.0.md J8, shared/holidays.ts). Absent before 2.0. */
  holidays?: Gathered[];
};

export const emptyTown = (): TownDays => ({ shops: {}, street: [], stories: {} });

/** In `ShopDays.told` once the shop has been seen moving onto the street, or never had to. */
export const TOWN_MOVE = 'town-move';
