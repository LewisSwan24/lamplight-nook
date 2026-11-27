import { type Holiday, type Season, holidayOn, seasonOf } from '../game/weather';

/**
 * The "Try" row on a new commission slip (plan-1.7.md G5): three small suggestions that fit the time of year, filled
 * into the slip with a click. During a festival its own come first, then one for the season. Never on the revise slip.
 */
export const HINTS_SHOWN = 3;
/** How many of the three are the festival's own, while one is on. */
const FESTIVAL_SHOWN = 2;

export type Tries = { seasons: Record<Season, string[]>; holidays: Record<Holiday, string[]> };

/** `n` different ones from `list`, in random order. */
function draw(list: readonly string[], n: number, rand: () => number): string[] {
  const left = [...list];
  const out: string[] = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rand() * left.length), 1)[0]);
  return out;
}

/** The suggestions for this day. */
export function suggestions(date: Date, tries: Tries, rand: () => number = Math.random): string[] {
  const holiday = holidayOn(date);
  const festival = holiday ? draw(tries.holidays[holiday], FESTIVAL_SHOWN, rand) : [];
  return [...festival, ...draw(tries.seasons[seasonOf(date)], HINTS_SHOWN - festival.length, rand)];
}
