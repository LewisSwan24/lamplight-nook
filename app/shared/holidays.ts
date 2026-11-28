/**
 * The festivals and when the shop is decorated for each (Q-A5), by the date alone: shared since plan-2.0.md J8, so the
 * main process can keep the day each was first seen for the town's record. game/weather.ts re-exports them.
 */
/** The festivals the shop decorates for (Q-A5): the same for everyone, in either language. */
export const HOLIDAYS = ['halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn'] as const;
export type Holiday = (typeof HOLIDAYS)[number];

/**
 * Lunar New Year's day (month index, day) for the years the app is likely to be open in, 2025 to 2040. All three tables
 * are checked against the Hong Kong Observatory's conversion tables (tests/fixtures/hko-calendar.json).
 */
const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2025: [0, 29], 2026: [1, 17], 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 3],
  2031: [0, 23], 2032: [1, 11], 2033: [0, 31], 2034: [1, 19], 2035: [1, 8], 2036: [0, 28],
  2037: [1, 15], 2038: [1, 4], 2039: [0, 24], 2040: [1, 12],
};
/** The Dragon Boat Festival (5th day of the 5th lunar month) and the Mid-Autumn Festival (15th of the 8th), same years. */
const DRAGON_BOAT: Record<number, [number, number]> = {
  2025: [4, 31], 2026: [5, 19], 2027: [5, 9], 2028: [4, 28], 2029: [5, 16], 2030: [5, 5],
  2031: [5, 24], 2032: [5, 12], 2033: [5, 1], 2034: [5, 20], 2035: [5, 10], 2036: [4, 30],
  2037: [5, 18], 2038: [5, 7], 2039: [4, 27], 2040: [5, 14],
};
const MID_AUTUMN: Record<number, [number, number]> = {
  2025: [9, 6], 2026: [8, 25], 2027: [8, 15], 2028: [9, 3], 2029: [8, 22], 2030: [8, 12],
  2031: [9, 1], 2032: [8, 19], 2033: [8, 8], 2034: [8, 27], 2035: [8, 16], 2036: [9, 4],
  2037: [8, 24], 2038: [8, 13], 2039: [9, 2], 2040: [8, 20],
};
/** The Lantern Festival is the 15th day of the first month: fourteen days after New Year's day. */
const LANTERN_AFTER = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole local days from b to a. */
function daysBetween(a: Date, b: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
  return day(a) - day(b);
}

/**
 * Decorations go up a few days ahead: Halloween from 24 October, Christmas from 18 December until
 * New Year's Day, Lunar New Year from a week before, then the lanterns for the last three days up to the
 * Lantern Festival, mugwort for the five days up to the Dragon Boat Festival, mooncakes for the week up to Mid-Autumn.
 */
export function holidayOn(date: Date): Holiday | null {
  const m = date.getMonth();
  const d = date.getDate();
  if (m === 9 && d >= 24) return 'halloween';
  if ((m === 11 && d >= 18) || (m === 0 && d === 1)) return 'christmas';
  const year = date.getFullYear();
  const since = (table: Record<number, [number, number]>) => (table[year] ? daysBetween(date, new Date(year, table[year][0], table[year][1])) : NaN);
  const lny = since(LUNAR_NEW_YEAR);
  if (lny >= -7 && lny < LANTERN_AFTER - 2) return 'new_year';
  if (lny >= LANTERN_AFTER - 2 && lny <= LANTERN_AFTER) return 'lantern';
  const dragon = since(DRAGON_BOAT);
  if (dragon >= -4 && dragon <= 0) return 'dragon_boat';
  const moon = since(MID_AUTUMN);
  if (moon >= -6 && moon <= 0) return 'mid_autumn';
  return null;
}
