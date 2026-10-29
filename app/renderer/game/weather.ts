import type { Look } from './daytime';

/**
 * Weather and seasons outside the shop. They follow the calendar, not a forecast: nothing is looked up
 * online. Each day gets its own weather, picked from the date, so it stays the same all day and on reopening.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Sky = 'clear' | 'rain' | 'snow' | 'petals' | 'leaves';
export type Holiday = 'halloween' | 'christmas' | 'new_year';

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

/** Lunar New Year's day (month index, day) for the years the app is likely to be open in. */
const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2025: [0, 29], 2026: [1, 17], 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 3],
  2031: [0, 23], 2032: [1, 11], 2033: [0, 31], 2034: [1, 19], 2035: [1, 8],
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole local days from b to a. */
function daysBetween(a: Date, b: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
  return day(a) - day(b);
}

/**
 * Decorations go up a few days ahead: Halloween from 24 October, Christmas from 18 December until
 * New Year's Day, Lunar New Year from a week before until the Lantern Festival.
 */
export function holidayOn(date: Date): Holiday | null {
  const m = date.getMonth();
  const d = date.getDate();
  if (m === 9 && d >= 24) return 'halloween';
  if ((m === 11 && d >= 18) || (m === 0 && d === 1)) return 'christmas';
  const lny = LUNAR_NEW_YEAR[date.getFullYear()];
  if (lny) {
    const since = daysBetween(date, new Date(date.getFullYear(), lny[0], lny[1]));
    if (since >= -7 && since <= 14) return 'new_year';
  }
  return null;
}

/** Holidays bring their own weather now and then: a white Christmas is more likely than a white Tuesday. */
export function skyOn(date: Date): Sky {
  const sky = weatherOn(date);
  if (holidayOn(date) === 'christmas' && sky === 'clear' && dayRoll(date) > 0.6) return 'snow';
  return sky;
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
