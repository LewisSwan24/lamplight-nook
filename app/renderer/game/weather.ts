import type { Look, Period } from './daytime';
import type { Season } from '../../shared/growth';
import { HOLIDAYS, holidayOn, type Holiday } from '../../shared/holidays';

export { HOLIDAYS, holidayOn, type Holiday };

/**
 * Weather and seasons outside the shop. They follow the calendar, not a forecast: nothing is looked up
 * online. Each day gets its own weather, picked from the date, so it stays the same all day and on reopening.
 */
export type { Season };
export type Sky = 'clear' | 'rain' | 'snow' | 'petals' | 'leaves' | 'fog' | 'wind' | 'storm';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

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

/**
 * Chances of each kind of day per season; whatever is left over is a clear day. Fog, wind and storms (plan-1.7.md G4)
 * come last, so they only take days that were clear before and every older kind of day stays as it was.
 */
const CHANCES: Record<Season, [Sky, number][]> = {
  spring: [['rain', 0.25], ['petals', 0.3], ['fog', 0.08]],
  summer: [['rain', 0.3], ['storm', 0.08]],
  autumn: [['rain', 0.2], ['leaves', 0.35], ['fog', 0.08], ['wind', 0.08]],
  winter: [['snow', 0.35], ['rain', 0.1], ['wind', 0.08]],
};

export function weatherOn(date: Date): Sky {
  let roll = dayRoll(date);
  for (const [sky, chance] of CHANCES[seasonOf(date)]) {
    if (roll < chance) return sky;
    roll -= chance;
  }
  return 'clear';
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

/** The overcast glass for each grey kind of day. */
export const LOOKS_GREY: Partial<Record<Sky, number>> = { rain: 0xa9b3c1, snow: 0xdfe4ec, storm: 0x7d8696, fog: 0xe6e9ec };
/** How much a grey day cools the room, and how much sun it leaves. */
const GREY_ROOM: Partial<Record<Sky, { tint: number; sun: number }>> = {
  rain: { tint: 0xe4e7ee, sun: 0.5 }, snow: { tint: 0xf0f2f7, sun: 0.5 }, storm: { tint: 0xd4d8e2, sun: 0.3 }, fog: { tint: 0xf2f2f2, sun: 0.6 },
};

/** A rainy, snowy, stormy or foggy day is greyer: the room a little cooler and the window glass overcast. Wind is not. */
export function withWeather(look: Look, sky: Sky): Look {
  const grey = LOOKS_GREY[sky];
  const room = GREY_ROOM[sky];
  if (grey === undefined || !room) return look;
  return {
    ...look,
    tint: multiply(look.tint, room.tint),
    sky: look.skyAlpha > 0.8 ? look.sky : grey,
    skyAlpha: Math.max(look.skyAlpha, 0.6),
    sun: look.sun * room.sun,
  };
}

/** How thick the fog is over the glass and the street: thickest at dawn, thinning through the day. */
export function fogFor(sky: Sky, period: Period): number {
  if (sky !== 'fog') return 0;
  return { dawn: 0.7, day: 0.4, dusk: 0.5, night: 0.35 }[period];
}

/** Lightning flashes in a storm, unless less motion is asked for. */
export const flashesFor = (sky: Sky, reducedMotion: boolean): boolean => sky === 'storm' && !reducedMotion;
/** How long between flashes, in milliseconds. */
export const FLASH_GAP_MS: [number, number] = [6000, 15000];

/** Multiply two 0xRRGGBB colours channel by channel. */
export function multiply(a: number, b: number): number {
  const ch = (shift: number) => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * What falls past the windows: colour, size and how it moves (pixels per second, sideways drift). Nothing falls in fog;
 * in the wind, leaves blow across more than they fall.
 */
export type Falling = { color: number; w: number; h: number; speed: number; drift: number; perSecond: number };
export const FALLING: Partial<Record<Sky, Falling>> = {
  rain: { color: 0xc4d4e8, w: 1, h: 3, speed: 140, drift: -12, perSecond: 40 },
  snow: { color: 0xffffff, w: 1, h: 1, speed: 14, drift: 6, perSecond: 10 },
  petals: { color: 0xf6c1cf, w: 2, h: 1, speed: 12, drift: 14, perSecond: 3 },
  leaves: { color: 0xd9822b, w: 2, h: 1, speed: 16, drift: 12, perSecond: 3 },
  storm: { color: 0xb4c4da, w: 1, h: 4, speed: 180, drift: -30, perSecond: 70 },
  wind: { color: 0xc98a3a, w: 2, h: 1, speed: 20, drift: 90, perSecond: 6 },
};
