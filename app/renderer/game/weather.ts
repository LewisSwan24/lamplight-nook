import type { Look } from './daytime';
import type { Season } from '../../shared/growth';

/**
 * Weather and seasons outside the shop. They follow the calendar, not a forecast: nothing is looked up
 * online. Each day gets its own weather, picked from the date, so it stays the same all day and on reopening.
 */
export type { Season };
export type Sky = 'clear' | 'rain' | 'snow' | 'petals' | 'leaves';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** The festivals the shop decorates for (Q-A5): the same for everyone, in either language. */
export const HOLIDAYS = ['halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn'] as const;
export type Holiday = (typeof HOLIDAYS)[number];

/** Northern hemisphere seasons by month. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/** A number in [0, 1) that depends only on the local calendar day. */
export function dayRoll(date: Date): number {
  let h = 2166136261;
  for (const c of `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Chances of each kind of day per season; whatever is left over is a clear day. */
const CHANCES: Record<Season, [Sky, number][]> = {
  spring: [['rain', 0.25], ['petals', 0.3]],
  summer: [['rain', 0.3]],
  autumn: [['rain', 0.2], ['leaves', 0.35]],
  winter: [['snow', 0.35], ['rain', 0.1]],
};

export function weatherOn(date: Date): Sky {
  let roll = dayRoll(date);
  for (const [sky, chance] of CHANCES[seasonOf(date)]) {
    if (roll < chance) return sky;
    roll -= chance;
  }
  return 'clear';
}

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

/** Holidays bring their own weather now and then: a white Christmas is more likely than a white Tuesday. */
export function skyOn(date: Date): Sky {
  const sky = weatherOn(date);
  if (holidayOn(date) === 'christmas' && sky === 'clear' && dayRoll(date) > 0.6) return 'snow';
  return sky;
}

/**
 * Conditions for lines that fit today (lines/cafe.yaml `when`): sky_rain, sky_snow, sky_petals,
 * sky_leaves, and holiday_ with each of HOLIDAYS.
 */
export function outsideFlags(outside: { sky: Sky; holiday: Holiday | null }): string[] {
  return [...(outside.sky === 'clear' ? [] : [`sky_${outside.sky}`]), ...(outside.holiday ? [`holiday_${outside.holiday}`] : [])];
}

/** A rainy or snowy day is greyer: the room a little cooler and the window glass overcast. */
export function withWeather(look: Look, sky: Sky): Look {
  if (sky !== 'rain' && sky !== 'snow') return look;
  const grey = sky === 'rain' ? 0xa9b3c1 : 0xdfe4ec;
  return {
    ...look,
    tint: multiply(look.tint, sky === 'rain' ? 0xe4e7ee : 0xf0f2f7),
    sky: look.skyAlpha > 0.8 ? look.sky : grey,
    skyAlpha: Math.max(look.skyAlpha, 0.6),
    sun: look.sun * 0.5,
  };
}

/** Multiply two 0xRRGGBB colours channel by channel. */
export function multiply(a: number, b: number): number {
  const ch = (shift: number) => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** What falls past the windows: colour, size and how it moves (pixels per second, sideways drift). */
export const FALLING: Record<Exclude<Sky, 'clear'>, { color: number; w: number; h: number; speed: number; drift: number; perSecond: number }> = {
  rain: { color: 0xc4d4e8, w: 1, h: 3, speed: 140, drift: -12, perSecond: 40 },
  snow: { color: 0xffffff, w: 1, h: 1, speed: 14, drift: 6, perSecond: 10 },
  petals: { color: 0xf6c1cf, w: 2, h: 1, speed: 12, drift: 14, perSecond: 3 },
  leaves: { color: 0xd9822b, w: 2, h: 1, speed: 16, drift: 12, perSecond: 3 },
};
