import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import art from '../assets/sprites/town-story.json';
import town from '../assets/sprites/town.json';
import { MemoryStore } from '../app/main/memory';
import { LOCALES } from '../app/shared/i18n';
import { CHAPTERS, STORY_DAYS, TELLERS, leftBehind, nextChapter, told, waiting } from '../app/shared/stories';
import { lintStories, parseStories } from '../app/renderer/translator/lines';
import { streetArea } from '../app/renderer/game/town';

// The neighbours' stories (road-to-1.4.md D4): Old Zhou, Granny Chen and Xiaohe each have five chapters, which come with
// the work done and the days gone by, one at a time, each told once, and each leaves something on the street.

const fresh = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-stories-')), 'memory.json'));
const day = (d: string) => new Date(`${d}T10:00:00`);
/** A shop with this much done, as memory.ts keeps it. */
const doneTimes = (store: MemoryStore, n: number) => { for (let i = 0; i < n; i++) store.finished(day('2026-11-01')); };

describe('when a chapter comes', () => {
  it('has five chapters for each of the three, staggered by the work done, the days between the same for all', () => {
    expect(TELLERS).toEqual(['mechanic', 'granny', 'student']);
    expect(CHAPTERS.mechanic.map((c) => c.works)).toEqual([3, 12, 22, 35, 48]);
    expect(CHAPTERS.granny.map((c) => c.works)).toEqual([5, 15, 25, 38, 50]);
    expect(CHAPTERS.student.map((c) => c.works)).toEqual([8, 18, 28, 40, 50]);
    expect(STORY_DAYS).toEqual([0, 3, 4, 5, 7]);
    // All of them in the thirty days the acceptance scenario moves through.
    expect(STORY_DAYS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(30);
  });

  it('needs the work done for the first chapter, and nothing else', () => {
    expect(nextChapter('granny', {}, 4, '2026-11-20')).toBeNull();
    expect(nextChapter('granny', {}, 5, '2026-11-20')).toBe(1);
    expect(nextChapter('mechanic', {}, 3, '2026-11-20')).toBe(1);
    expect(nextChapter('student', {}, 7, '2026-11-20')).toBeNull();
  });

  it('needs both the work done and the days since the last chapter for the next', () => {
    const stories = { granny: ['2026-11-20'] };
    // Fifteen done, but only two days on.
    expect(nextChapter('granny', stories, 15, '2026-11-22')).toBeNull();
    // Three days on, but only fourteen done.
    expect(nextChapter('granny', stories, 14, '2026-11-23')).toBeNull();
    expect(nextChapter('granny', stories, 15, '2026-11-23')).toBe(2);
    // Across a month's end.
    expect(nextChapter('granny', { granny: ['2026-11-29'] }, 15, '2026-12-02')).toBe(2);
  });

  it('never skips a chapter, however much has been done and however long ago', () => {
    expect(nextChapter('mechanic', {}, 100, '2027-06-01')).toBe(1);
    expect(nextChapter('mechanic', { mechanic: ['2026-01-01'] }, 100, '2027-06-01')).toBe(2);
    expect(told({}, 'mechanic', 100, '2027-06-01')).toEqual({ mechanic: ['2027-06-01'] });
  });

  it('has nothing more after the fifth', () => {
    const all = { student: ['2026-01-01', '2026-01-04', '2026-01-08', '2026-01-13', '2026-01-20'] };
    expect(nextChapter('student', all, 500, '2027-01-01')).toBeNull();
    expect(told(all, 'student', 500, '2027-01-01')).toBe(all);
  });

  it('says who is waiting with a chapter: Old Zhou, Granny Chen, Xiaohe', () => {
    expect(waiting({}, 0, '2026-11-20')).toEqual([]);
    expect(waiting({}, 5, '2026-11-20')).toEqual(['mechanic', 'granny']);
    expect(waiting({ mechanic: ['2026-11-20'] }, 50, '2026-11-21')).toEqual(['granny', 'student']);
  });

  it('leaves one thing per chapter told, all different', () => {
    const ids = TELLERS.flatMap((t) => CHAPTERS[t].map((c) => c.left));
    expect(new Set(ids).size).toBe(15);
    expect(CHAPTERS.mechanic.at(-1)!.left).toBe('bicycle');
    expect(leftBehind({})).toEqual([]);
    expect(leftBehind({ mechanic: ['2026-11-20', '2026-11-23'], student: ['2026-11-20'] })).toEqual([CHAPTERS.mechanic[0].left, CHAPTERS.mechanic[1].left, CHAPTERS.student[0].left]);
  });
});

describe('the notebook keeps the chapters told', () => {
  it('writes down the day a chapter is told, and never tells it again', () => {
    const store = fresh();
    doneTimes(store, 3);
    expect(store.tellStory('mechanic', day('2026-11-20'))).toBe(1);
    expect(store.tellStory('mechanic', day('2026-11-20'))).toBeNull();
    expect(store.tellStory('mechanic', day('2026-11-25'))).toBeNull();
    expect(store.shopState().town!.stories).toEqual({ mechanic: ['2026-11-20'] });
  });

  it('tells the next chapter only when it has come, one at a time', () => {
    const store = fresh();
    doneTimes(store, 50);
    expect(store.tellStory('granny', day('2026-11-20'))).toBe(1);
    expect(store.tellStory('granny', day('2026-11-22'))).toBeNull();
    expect(store.tellStory('granny', day('2026-11-23'))).toBe(2);
    expect(store.tellStory('granny', day('2026-12-30'))).toBe(3);
    expect(store.shopState().town!.stories.granny).toEqual(['2026-11-20', '2026-11-23', '2026-12-30']);
  });

  it('keeps them when the notebook is opened again', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lamplight-stories-')), 'memory.json');
    const store = new MemoryStore(file);
    doneTimes(store, 10);
    store.tellStory('student', day('2026-11-20'));
    expect(new MemoryStore(file).shopState().town!.stories).toEqual({ student: ['2026-11-20'] });
  });

  it('refuses anyone without a story', () => {
    const store = fresh();
    doneTimes(store, 50);
    expect(store.tellStory('baker', day('2026-11-20'))).toBeNull();
    expect(store.shopState().town!.stories).toEqual({});
  });

  it('starts over once everything is forgotten', () => {
    const store = fresh();
    doneTimes(store, 50);
    store.tellStory('mechanic', day('2026-11-20'));
    store.clear();
    expect(store.shopState().town!.stories).toEqual({});
    doneTimes(store, 3);
    expect(store.tellStory('mechanic', day('2026-11-21'))).toBe(1);
  });

  it('gives the shop the day it is by the shop clock, for working out who is waiting', () => {
    expect(fresh().shopState(day('2026-12-24')).today).toBe('2026-12-24');
  });
});

describe('the stories themselves', () => {
  for (const [file, S] of [['lines/stories.yaml', LOCALES['zh-CN']], ['lines/en/stories.yaml', LOCALES.en]] as const) {
    it(`${file}: five chapters each, every one a title, a few short bubbles and what it leaves`, () => {
      const stories = parseStories(readFileSync(file, 'utf8'));
      expect(Object.keys(stories)).toEqual(TELLERS);
      for (const t of TELLERS) {
        expect(stories[t].map((c) => c.left), `${file} ${t}`).toEqual(CHAPTERS[t].map((c) => c.left));
      }
      expect(lintStories(stories, S)).toEqual([]);
    });
  }

  it('catches a chapter missing, a bubble too long, too few bubbles and a thing left that is not in the table', () => {
    const stories = parseStories(readFileSync('lines/stories.yaml', 'utf8'));
    stories.mechanic = stories.mechanic.slice(0, 4);
    stories.granny[0] = { ...stories.granny[0], lines: ['这一句话写得太长了，长到一个气泡怎么也装不下才行。', '好。'] };
    stories.student[1] = { ...stories.student[1], lines: ['只有一句。'] };
    stories.student[2] = { ...stories.student[2], left: 'piano' };
    expect(lintStories(stories, LOCALES['zh-CN'])).toHaveLength(4);
  });
});

describe('what the stories leave on the street', () => {
  const parts = art.parts as { id: string; sx: number; sy: number; w: number; h: number; x: number; y: number }[];

  it('has a picture for every thing left, and the bubble over a waiting neighbour', () => {
    const ids = TELLERS.flatMap((t) => CHAPTERS[t].map((c) => c.left));
    expect(parts.map((p) => p.id).sort()).toEqual([...ids].sort());
    expect(art.bubble.w).toBeGreaterThan(0);
  });

  it('stands against the fronts, off the pavement people walk on, and away from the festival pieces at the cart', () => {
    const walk = streetArea();
    for (const p of parts) {
      expect(p.x >= 0 && p.x + p.w <= town.width, p.id).toBe(true);
      expect(p.y + p.h, `${p.id} reaches onto the pavement`).toBeLessThanOrEqual(walk.top);
      expect(p.x + p.w <= 674 || p.x >= 712, `${p.id} stands at the cart`).toBe(true);
    }
  });

  it('has each neighbour wait at their own place: Old Zhou at the workshop, Granny Chen on the bench, Xiaohe at the study', () => {
    const front = (id: string) => town.fronts.find((f) => f.id === id)!;
    const bench = town.props.find((p) => p.name === 'Bench_1')!;
    const at = art.waits as Record<string, { x: number; y: number }>;
    expect(Math.abs(at.mechanic.x - front('workshop').door)).toBeLessThan(40);
    expect(at.granny.x >= bench.left && at.granny.x <= bench.right).toBe(true);
    expect(Math.abs(at.student.x - front('study').door)).toBeLessThan(40);
  });
});
