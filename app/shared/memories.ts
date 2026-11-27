import { crews, type Staffer } from './crew';
import type { CommissionMemo } from './types';

/**
 * What the staff remember (plan-1.9.md I5): the works each was on (shared/crew.ts), by title and day and nothing else,
 * so a memory never says what was in a work. lines/memories.yaml says how each puts it, `{date}` and `{title}` filled
 * in here: a long title cut short, the day said as people say it.
 */
export type Recalled = { title: string; date: string };
/** How many of their latest works each remembers. */
export const RECALL_WORKS = 12;

/** The latest works each member of staff was on, latest first. */
export function recallOf(memos: CommissionMemo[]): Partial<Record<Staffer, Recalled[]>> {
  const out: Partial<Record<Staffer, Recalled[]>> = {};
  for (const { memo, crew } of crews(memos).reverse()) {
    for (const who of crew) {
      const list = (out[who] ??= []);
      if (list.length < RECALL_WORKS) list.push({ title: memo.title, date: memo.date });
    }
  }
  return out;
}

/** A title as short as a bubble needs: eight characters in Chinese, sixteen in English, then an ellipsis. */
export function shortTitle(title: string, lang: string): string {
  const max = lang === 'en' ? 16 : 8;
  const chars = [...title];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : title;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A day as people say it, without the year: 10月3号, 3 October. */
export function spokenDate(date: string, lang: string): string {
  const [, m, d] = date.split('-').map(Number);
  return lang === 'en' ? `${d} ${MONTHS[m - 1]}` : `${m}月${d}号`;
}

/** Every memory filled in, as lines one person says: each with one of their works, in turn; none for someone with none. */
export function memoryLines(book: Record<string, string[][]>, recall: Partial<Record<Staffer, Recalled[]>>, lang: string) {
  return Object.entries(book).flatMap(([who, memories]) => {
    const works = recall[who as Staffer] ?? [];
    if (!works.length) return [];
    return memories.map((bubbles, i) => {
      const w = works[i % works.length];
      return {
        id: `memory_${who}_${i + 1}`, speaker: who as Staffer,
        bubbles: bubbles.map((b) => b.replaceAll('{date}', spokenDate(w.date, lang)).replaceAll('{title}', shortTitle(w.title, lang))),
      };
    });
  });
}
