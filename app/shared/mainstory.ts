import { apprenticeHere } from './staff';
import { TELLERS, type Teller } from './stories';
import { towerStage, type TowerStage } from './tower';
import type { ActorId } from './types';

/**
 * The year's story (plan-2.0.md J7): the whole town mends the old clock tower on the river street, a chapter a month,
 * twelve of them (lines/year.yaml). Each is told by someone else in turn: the seven neighbours come into the shop to
 * tell theirs, the five at home wait with a note over their head. The three keepers of the first street's shops have
 * their say inside the chapters. The tower moves on a look every two chapters (shared/tower.ts). Pure: who tells which,
 * when one comes, and what is written down; `town.year` keeps the day each was told and the works done by then.
 */
export const YEAR_TELLERS = ['granny', 'adeng', 'mechanic', 'laoshi', 'bookseller', 'baker', 'qingdai', 'postman', 'florist', 'xiaodou', 'xiaoju', 'student'] as const satisfies readonly (Teller | ActorId)[];
export type YearTeller = (typeof YEAR_TELLERS)[number];
/** The day each chapter was told and how many works were done by then, in order. */
export type YearDays = { day: string; done: number }[];

/** At least this many days between one chapter and the next. */
export const YEAR_GAP_DAYS = 3;
/** Or this many more works since the one before, if the month has not turned yet (plan-2.0.md Q-J4). */
export const YEAR_WORKS = 10;

/** A neighbour comes into the shop to tell theirs; the staff are there already. */
export const isVisitingTeller = (who: string): who is Teller => (TELLERS as readonly string[]).includes(who);

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const month = (day: string) => day.slice(0, 7);

/** The chapter waiting today (1 to 12), or null: the first once a work is done; then a new month or ten more works. */
export function nextYearChapter(year: YearDays, done: number, today: string): number | null {
  const n = year.length;
  if (n >= YEAR_TELLERS.length || done < 1) return null;
  // Bean carries the hands over the bridge: not before Bean has come to the shop.
  if (YEAR_TELLERS[n] === 'xiaodou' && !apprenticeHere(done)) return null;
  const last = year.at(-1);
  if (!last) return 1;
  if (daysBetween(last.day, today) < YEAR_GAP_DAYS) return null;
  return month(today) !== month(last.day) || done >= last.done + YEAR_WORKS ? n + 1 : null;
}

/** The year once today's chapter has been told; the same object when none was waiting. */
export function toldYear(year: YearDays, done: number, today: string): YearDays {
  return nextYearChapter(year, done, today) === null ? year : [...year, { day: today, done }];
}

/** How far the tower is mended after the chapters told. */
export const yearTower = (year: YearDays): TowerStage => towerStage(year.length);
