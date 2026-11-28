import data from '../../../assets/sprites/town-story.json';
import type { Teller } from '../../shared/stories';
import { LANES } from './crowd';
import { doorOf } from './town';
import type { Sky } from './weather';

/**
 * The neighbours walking between the two streets (plan-2.0.md J9): now and then one sets off from their own place over
 * the bridge to a door on the other street, and a while later walks back. One at a time, by day, never in a storm, and
 * not while they wait at home with a story to tell. Pure and set by the clock, so whoever looks along the street sees
 * the same walk at the same moment; StreetScene draws it.
 */

/** Where each neighbour waits with a story (town-story.json), which is where they set off from and come home to. */
const HOME = Object.fromEntries(Object.entries(data.waits).map(([who, at]) => [who, at.x])) as Record<Teller, number>;

/** Who walks where: from home to a door over the bridge. */
export const STROLLS: readonly { who: Teller; from: number; to: number }[] = [
  { who: 'florist', from: HOME.florist, to: doorOf('bakery').x },
  { who: 'baker', from: HOME.baker, to: doorOf('flowershop').x },
  { who: 'bookseller', from: HOME.bookseller, to: doorOf('post').x },
  { who: 'postman', from: HOME.postman, to: doorOf('bookshop').x },
  { who: 'student', from: HOME.student, to: doorOf('bookshop').x },
  { who: 'granny', from: HOME.granny, to: doorOf('flowershop').x },
  { who: 'mechanic', from: HOME.mechanic, to: doorOf('bookshop').x },
];

/** A new walk sets off this often, each to the next in the list; a round there, then a round back. */
export const STROLL_EVERY_MS = 60_000;
/** Pixels per second: a stroll, as the passers (crowd.ts). */
const SPEED = 30;
/** Out between these hours. */
const HOURS = { from: 7, to: 20 } as const;

export const strollMs = (s: { from: number; to: number }): number => (Math.abs(s.to - s.from) / SPEED) * 1000;

export type Stroll = { who: Teller; x: number; y: number; dir: 1 | -1 };
export type StrollAt = { hour: number; sky: Sky; away: readonly Teller[] };

/** Who is out walking at `ms` (the clock's milliseconds), and where; null when nobody is. */
export function strollAt(ms: number, at: StrollAt): Stroll | null {
  if (at.hour < HOURS.from || at.hour >= HOURS.to || at.sky === 'storm') return null;
  const round = Math.floor(ms / STROLL_EVERY_MS);
  const s = STROLLS[round % STROLLS.length];
  if (at.away.includes(s.who)) return null;
  const into = ms - round * STROLL_EVERY_MS;
  const took = strollMs(s);
  if (into > took) return null;
  const back = Math.floor(round / STROLLS.length) % 2 === 1;
  const [from, to] = back ? [s.to, s.from] : [s.from, s.to];
  return { who: s.who, x: from + (to - from) * (into / took), y: LANES[round % 2], dir: to > from ? 1 : -1 };
}
