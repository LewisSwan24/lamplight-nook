import { describe, expect, it } from 'vitest';
import { shopTimeline } from '../app/shared/days';
import { strings } from '../app/shared/i18n';
import type { CommissionMemo, Memory } from '../app/shared/types';

const N = strings.ui.notebook;
const day = (d: number) => new Date(Date.UTC(2026, 0, d));
const work = (n: number, over: Partial<CommissionMemo> = {}): CommissionMemo => ({
  id: `c${day(n).getTime()}`, title: `work ${n}`, date: day(n).toISOString().slice(0, 10), result: 'done', choices: {}, form: { want: 'x' }, ...over,
} as CommissionMemo);
const memory = (works: CommissionMemo[], shop: Partial<NonNullable<Memory['shop']>> = {}): Memory => ({
  commissions: works, stuckNotes: [], shop: { done: works.filter((w) => w.result === 'done').length, grown: [], told: [], ...shop },
});
const texts = (m: Memory) => shopTimeline(m).map((e) => e.text);

describe('the days of the shop', () => {
  it('has nothing to say before anything has been made', () => {
    expect(shopTimeline({ commissions: [], stuckNotes: [] })).toEqual([]);
  });

  it('starts with the first work, by name', () => {
    expect(texts(memory([work(1)]))).toContain(N.firstWork.replace('{title}', 'work 1'));
  });

  it('marks round numbers of works, and only those', () => {
    const lines = texts(memory(Array.from({ length: 12 }, (_, i) => work(i + 1))));
    expect(lines).toContain(N.nthWork.replace('{n}', '10').replace('{title}', 'work 10'));
    expect(lines.filter((l) => l === N.nthWork.replace('{n}', '9').replace('{title}', 'work 9'))).toEqual([]);
  });

  it('counts from the real total when older works were forgotten by an earlier version', () => {
    const kept = Array.from({ length: 20 }, (_, i) => work(i + 11));
    const lines = texts(memory(kept, { done: 30 }));
    // The 25th work overall is the 15th one still here.
    expect(lines).toContain(N.nthWork.replace('{n}', '25').replace('{title}', 'work 25'));
    expect(lines.some((l) => l.includes('work 11') && l === N.firstWork.replace('{title}', 'work 11'))).toBe(false);
  });

  it('puts a work under the day it was finished, even when changed again later', () => {
    const later = work(1, { date: '2026-06-01' });
    const entry = shopTimeline(memory([later])).find((e) => e.text.includes('work 1'))!;
    expect(entry.date).toBe('2026-01-01');
  });

  it('counts a work changed later in its first place, not as the newest', () => {
    const works = Array.from({ length: 10 }, (_, i) => work(i + 1));
    works.push(works.shift()!);
    expect(texts(memory(works))).toContain(N.firstWork.replace('{title}', 'work 1'));
    expect(texts(memory(works))).toContain(N.nthWork.replace('{n}', '10').replace('{title}', 'work 10'));
  });

  it('leaves out what did not get done', () => {
    expect(texts(memory([work(1, { result: 'failed' }), work(2)]))).toContain(N.firstWork.replace('{title}', 'work 2'));
  });

  it('tells what grew, who came and the vegetable beds, newest first', () => {
    const m = memory([work(1), work(2), work(3), work(4)], {
      grown: [{ id: 'painting', date: '2026-01-01' }],
      met: [{ id: 'baker', date: '2026-01-03' }],
    });
    const lines = shopTimeline(m);
    expect(lines.map((e) => e.date)).toEqual([...lines.map((e) => e.date)].sort().reverse());
    const all = lines.map((e) => e.text);
    expect(all).toContain(N.grewLine.replace('{item}', strings.growth.painting));
    expect(all).toContain(N.metLine.replace('{name}', strings.guests.baker));
    expect(all).toContain(N.bedRipe);
    expect(all).toContain(N.bedSprout);
  });

  it('shortens a very long title', () => {
    const line = texts(memory([work(1, { title: '很长'.repeat(100) })]))[0];
    expect([...line].length).toBeLessThan(80);
  });
});
