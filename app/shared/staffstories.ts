import type { Staffer } from './crew';

/**
 * The staff's own stories (plan-1.9.md I1). Eight of them tell three chapters each (lines/staff-stories.yaml); Auntie
 * Olive and Pip are left out, having told theirs as neighbours (plan-1.6.md F4). A chapter comes once that person has
 * been on enough works (shared/crew.ts) and some days have gone by since their one before; the first needs only the
 * work. Each is told once, when the user clicks them, and leaves a keepsake, drawn on the story card and kept in the
 * notebook (scripts/art/keepsakes.py). The walls were already full, so nothing hangs in the rooms.
 * `town.staff` keeps, for each of them, the day each chapter was told.
 */
export const STAFF_TELLERS = ['adeng', 'xiaoju', 'laoshi', 'qingdai', 'xiaodou', 'aqian', 'xiaozhe', 'xiaoding'] as const satisfies readonly Staffer[];
export type StaffTeller = (typeof STAFF_TELLERS)[number];
/** The day each chapter was told, in order, by member of staff. */
export type StaffStories = Partial<Record<StaffTeller, string[]>>;

/** Days since that person's chapter before. */
export const STAFF_STORY_GAP = 4;

/**
 * Works that person was on, for each chapter, and the keepsake it leaves. Iris and the street shops' keepers are on
 * fewer works than Wick and Flint, so theirs come sooner.
 */
export const STAFF_CHAPTERS: Record<StaffTeller, { works: number; left: string }[]> = {
  adeng: [{ works: 3, left: 'lamp' }, { works: 15, left: 'inkpot' }, { works: 35, left: 'sign' }],
  xiaoju: [{ works: 2, left: 'card' }, { works: 10, left: 'magnifier' }, { works: 25, left: 'slip' }],
  laoshi: [{ works: 3, left: 'plane' }, { works: 12, left: 'square' }, { works: 28, left: 'chair' }],
  qingdai: [{ works: 1, left: 'swatch' }, { works: 6, left: 'cloth' }, { works: 15, left: 'vial' }],
  xiaodou: [{ works: 2, left: 'flyer' }, { works: 12, left: 'umbrella' }, { works: 30, left: 'pad' }],
  aqian: [{ works: 2, left: 'sort' }, { works: 8, left: 'apron' }, { works: 18, left: 'seal' }],
  xiaozhe: [{ works: 1, left: 'brush' }, { works: 7, left: 'coin' }, { works: 16, left: 'pebble' }],
  xiaoding: [{ works: 1, left: 'screw' }, { works: 6, left: 'radio' }, { works: 15, left: 'watch' }],
};

/** Every keepsake, teller by teller, chapter by chapter: the frames of keepsakes.png, in order. */
export const KEEPSAKES: string[] = STAFF_TELLERS.flatMap((t) => STAFF_CHAPTERS[t].map((c) => c.left));
/** One keepsake's frame, square. */
export const KEEPSAKE_SIZE = 16;
export const keepsakeOf = (who: StaffTeller, chapter: number) => STAFF_CHAPTERS[who][chapter - 1].left;

export const isStaffTeller = (who: string): who is StaffTeller => (STAFF_TELLERS as readonly string[]).includes(who);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The chapter a member of staff has waiting (1 to 3), or null: none yet, or all told. */
export function nextStaffChapter(who: StaffTeller, stories: StaffStories, by: Record<Staffer, number>, today: string): number | null {
  const said = stories[who] ?? [];
  const chapter = STAFF_CHAPTERS[who][said.length];
  if (!chapter || by[who] < chapter.works) return null;
  const last = said.at(-1);
  if (last && daysBetween(last, today) < STAFF_STORY_GAP) return null;
  return said.length + 1;
}

/** The stories once someone has told the chapter they had waiting today; the same object when they had none. */
export function toldStaff(stories: StaffStories, who: StaffTeller, by: Record<Staffer, number>, today: string): StaffStories {
  if (nextStaffChapter(who, stories, by, today) === null) return stories;
  return { ...stories, [who]: [...(stories[who] ?? []), today] };
}

/** Who has a chapter waiting, in the order of the portraits. */
export const staffWaiting = (stories: StaffStories, by: Record<Staffer, number>, today: string): StaffTeller[] =>
  STAFF_TELLERS.filter((t) => nextStaffChapter(t, stories, by, today) !== null);
