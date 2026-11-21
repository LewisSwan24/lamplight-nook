import type { GuestId } from './types';

/**
 * The neighbours' stories (road-to-1.4.md D4). Old Zhou, Granny Chen and Xiaohe each have five chapters
 * (lines/stories.yaml). A chapter comes once enough has been done together and enough days have gone by since the one
 * before; the first needs only the work. They come one at a time, are told once, and each leaves something on the
 * street (scripts/art/story.py). `town.stories` keeps, for each neighbour, the day each chapter was told.
 */
export const TELLERS = ['mechanic', 'granny', 'student'] as const satisfies readonly GuestId[];
export type Teller = (typeof TELLERS)[number];
/** The day each chapter was told, in order, by neighbour. */
export type Stories = Partial<Record<GuestId, string[]>>;

/** Days since the chapter before, the same for everyone. */
export const STORY_DAYS = [0, 3, 4, 5, 7];

/** Work done for each chapter, staggered so the three seldom come out on the same day, and what each leaves. */
export const CHAPTERS: Record<Teller, { works: number; left: string }[]> = {
  mechanic: [{ works: 3, left: 'bell' }, { works: 12, left: 'toolbox' }, { works: 22, left: 'pump' }, { works: 35, left: 'plate' }, { works: 48, left: 'bicycle' }],
  granny: [{ works: 5, left: 'cushion' }, { works: 15, left: 'millet' }, { works: 25, left: 'rose' }, { works: 38, left: 'birdhouse' }, { works: 50, left: 'stool' }],
  student: [{ works: 8, left: 'books' }, { works: 18, left: 'notice' }, { works: 28, left: 'cactus' }, { works: 40, left: 'bookshelf' }, { works: 50, left: 'cap' }],
};

const isTeller = (who: GuestId): who is Teller => (TELLERS as readonly string[]).includes(who);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The chapter a neighbour has waiting (1 to 5), or null: none yet, or all told. */
export function nextChapter(who: GuestId, stories: Stories, done: number, today: string): number | null {
  if (!isTeller(who)) return null;
  const said = stories[who] ?? [];
  const chapter = CHAPTERS[who][said.length];
  if (!chapter || done < chapter.works) return null;
  const last = said.at(-1);
  if (last && daysBetween(last, today) < STORY_DAYS[said.length]) return null;
  return said.length + 1;
}

/** The stories once a neighbour has told the chapter they had waiting today; the same object when they had none. */
export function told(stories: Stories, who: GuestId, done: number, today: string): Stories {
  if (nextChapter(who, stories, done, today) === null) return stories;
  return { ...stories, [who]: [...(stories[who] ?? []), today] };
}

/** Who has a chapter waiting, in their order along the street's story. */
export const waiting = (stories: Stories, done: number, today: string): Teller[] => TELLERS.filter((t) => nextChapter(t, stories, done, today) !== null);

/** What the chapters told have left, neighbour by neighbour, chapter by chapter. */
export const leftBehind = (stories: Stories): string[] => TELLERS.flatMap((t) => CHAPTERS[t].slice(0, stories[t]?.length ?? 0).map((c) => c.left));
