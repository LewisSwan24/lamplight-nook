import type { ActorId } from './types';

/**
 * The days of the year the shop marks (plan-1.7.md G3): the 24 solar terms, and everyone's birthday. Pure; the
 * renderer asks what today is.
 */

/** The 24 solar terms, in the order the year brings them, from Minor Cold in early January. */
export const TERMS = [
  'minor_cold', 'major_cold', 'start_of_spring', 'rain_water', 'awakening_of_insects', 'spring_equinox', 'pure_brightness',
  'grain_rain', 'start_of_summer', 'grain_buds', 'grain_in_ear', 'summer_solstice', 'minor_heat', 'major_heat',
  'start_of_autumn', 'end_of_heat', 'white_dew', 'autumn_equinox', 'cold_dew', 'frost_descent', 'start_of_winter',
  'minor_snow', 'major_snow', 'winter_solstice',
] as const;
export type Term = (typeof TERMS)[number];

/**
 * The day of each term (MMDD, in the order of TERMS) for the years the app is likely to be open in, from the Hong Kong
 * Observatory's conversion tables (tests/fixtures/hko-calendar.json, scripts/hko-calendar.mjs). A year outside it has none.
 */
const TERM_DAYS: Record<number, string> = {
  2025: '0105 0120 0203 0218 0305 0320 0404 0420 0505 0521 0605 0621 0707 0722 0807 0823 0907 0923 1008 1023 1107 1122 1207 1221',
  2026: '0105 0120 0204 0218 0305 0320 0405 0420 0505 0521 0605 0621 0707 0723 0807 0823 0907 0923 1008 1023 1107 1122 1207 1222',
  2027: '0105 0120 0204 0219 0306 0321 0405 0420 0506 0521 0606 0621 0707 0723 0808 0823 0908 0923 1008 1023 1107 1122 1207 1222',
  2028: '0106 0120 0204 0219 0305 0320 0404 0419 0505 0520 0605 0621 0706 0722 0807 0822 0907 0922 1008 1023 1107 1122 1206 1221',
  2029: '0105 0120 0203 0218 0305 0320 0404 0420 0505 0521 0605 0621 0707 0722 0807 0823 0907 0923 1008 1023 1107 1122 1207 1221',
  2030: '0105 0120 0204 0218 0305 0320 0405 0420 0505 0521 0605 0621 0707 0723 0807 0823 0907 0923 1008 1023 1107 1122 1207 1222',
  2031: '0105 0120 0204 0219 0306 0321 0405 0420 0506 0521 0606 0621 0707 0723 0808 0823 0908 0923 1008 1023 1107 1122 1207 1222',
  2032: '0106 0120 0204 0219 0305 0320 0404 0419 0505 0520 0605 0621 0706 0722 0807 0822 0907 0922 1008 1023 1107 1122 1206 1221',
  2033: '0105 0120 0203 0218 0305 0320 0404 0420 0505 0521 0605 0621 0707 0722 0807 0823 0907 0923 1008 1023 1107 1122 1207 1221',
  2034: '0105 0120 0204 0218 0305 0320 0405 0420 0505 0521 0605 0621 0707 0723 0807 0823 0907 0923 1008 1023 1107 1122 1207 1222',
  2035: '0105 0120 0204 0219 0306 0321 0405 0420 0505 0521 0606 0621 0707 0723 0807 0823 0908 0923 1008 1023 1107 1122 1207 1222',
  2036: '0106 0120 0204 0219 0305 0320 0404 0419 0505 0520 0605 0621 0706 0722 0807 0822 0907 0922 1008 1023 1107 1122 1206 1221',
  2037: '0105 0120 0203 0218 0305 0320 0404 0420 0505 0521 0605 0621 0707 0722 0807 0823 0907 0923 1008 1023 1107 1122 1207 1221',
  2038: '0105 0120 0204 0218 0305 0320 0405 0420 0505 0521 0605 0621 0707 0723 0807 0823 0907 0923 1008 1023 1107 1122 1207 1222',
  2039: '0105 0120 0204 0219 0306 0321 0405 0420 0505 0521 0606 0621 0707 0723 0807 0823 0908 0923 1008 1023 1107 1122 1207 1222',
  2040: '0106 0120 0204 0219 0305 0320 0404 0419 0505 0520 0605 0621 0706 0722 0807 0822 0907 0922 1008 1023 1107 1122 1206 1221',
};

/** The solar term that falls today, or null. */
export function termOn(date: Date): Term | null {
  const days = TERM_DAYS[date.getFullYear()];
  if (!days) return null;
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const i = days.split(' ').indexOf(mmdd);
  return i < 0 ? null : TERMS[i];
}

/**
 * Everyone's birthday, [month index, day] (Q-G1, provisional): the five at home and the five keepers along the street,
 * never two in one month.
 */
export const BIRTHDAYS: Partial<Record<ActorId, [number, number]>> = {
  aqian: [0, 15], adeng: [2, 12], qingdai: [3, 20], guiyi: [4, 18], xiaozhe: [5, 24],
  xiaoju: [6, 7], xiaoding: [7, 8], xiaodou: [8, 1], axin: [9, 9], laoshi: [10, 2],
};

/** Whose birthday it is today. */
export const birthdayOn = (date: Date): ActorId[] =>
  (Object.entries(BIRTHDAYS) as [ActorId, [number, number]][]).filter(([, [m, d]]) => date.getMonth() === m && date.getDate() === d).map(([who]) => who);
