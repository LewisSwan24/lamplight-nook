import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { LOCALES } from '../app/shared/i18n';
import { ALL_STAFF } from '../app/shared/staff';
import {
  KEEPSAKES, KEEPSAKE_SIZE, STAFF_CHAPTERS, STAFF_STORY_GAP, STAFF_TELLERS, keepsakeOf, nextStaffChapter, staffWaiting, toldStaff,
} from '../app/shared/staffstories';
import { CHAPTERS } from '../app/shared/stories';
import { lintStaffStories, parseStories } from '../app/renderer/translator/lines';
import type { CommissionMemo } from '../app/shared/types';
import { readPng } from './png';

// The staff's own stories (plan-1.9.md I1): eight of them, three chapters each, which come with the works that person was
// on and the days gone by, one at a time; each is told once and leaves a keepsake, and the notebook keeps them all.

const zero = Object.fromEntries(ALL_STAFF.map((s) => [s, 0])) as Record<(typeof ALL_STAFF)[number], number>;
const by = (o: Partial<typeof zero>) => ({ ...zero, ...o });

describe('who tells, and when', () => {
  it('is the eight who are not already neighbours with a story of their own', () => {
    expect(STAFF_TELLERS).toEqual(['adeng', 'xiaoju', 'laoshi', 'qingdai', 'xiaodou', 'aqian', 'xiaozhe', 'xiaoding']);
    for (const t of STAFF_TELLERS) expect(STAFF_CHAPTERS[t]).toHaveLength(3);
  });

  it('leaves twenty-four keepsakes, none named like a neighbour’s', () => {
    const neighbours = new Set(Object.values(CHAPTERS).flat().map((c) => c.left));
    expect(KEEPSAKES).toHaveLength(24);
    expect(new Set(KEEPSAKES).size).toBe(24);
    expect(KEEPSAKES.filter((k) => neighbours.has(k))).toEqual([]);
    expect(keepsakeOf('laoshi', 2)).toBe(STAFF_CHAPTERS.laoshi[1].left);
  });

  it('asks more works of each chapter than the one before', () => {
    for (const t of STAFF_TELLERS) {
      const works = STAFF_CHAPTERS[t].map((c) => c.works);
      expect(works[0]).toBeGreaterThan(0);
      expect(works[1]).toBeGreaterThan(works[0]);
      expect(works[2]).toBeGreaterThan(works[1]);
    }
  });

  it('waits until that person has been on enough works', () => {
    const need = STAFF_CHAPTERS.xiaoju[0].works;
    expect(nextStaffChapter('xiaoju', {}, by({ adeng: 100, xiaoju: need - 1 }), '2026-12-01')).toBeNull();
    expect(nextStaffChapter('xiaoju', {}, by({ xiaoju: need }), '2026-12-01')).toBe(1);
  });

  it('then lets some days go by before the next one', () => {
    const stories = { qingdai: ['2026-12-01'] };
    const lots = by({ qingdai: 99 });
    expect(STAFF_STORY_GAP).toBe(4);
    expect(nextStaffChapter('qingdai', stories, lots, '2026-12-04')).toBeNull();
    expect(nextStaffChapter('qingdai', stories, lots, '2026-12-05')).toBe(2);
  });

  it('tells each chapter once, and has nothing after the third', () => {
    const lots = by({ aqian: 99 });
    let stories = toldStaff({}, 'aqian', lots, '2026-12-01');
    expect(stories.aqian).toEqual(['2026-12-01']);
    expect(toldStaff(stories, 'aqian', lots, '2026-12-01')).toBe(stories);
    stories = toldStaff(toldStaff(stories, 'aqian', lots, '2026-12-05'), 'aqian', lots, '2026-12-09');
    expect(stories.aqian).toHaveLength(3);
    expect(nextStaffChapter('aqian', stories, lots, '2027-01-01')).toBeNull();
  });

  it('lists who has a chapter waiting, in the order of the portraits', () => {
    const counts = by({ adeng: 99, laoshi: 99, xiaoding: 99 });
    expect(staffWaiting({ laoshi: ['2026-12-01'] }, counts, '2026-12-02')).toEqual(['adeng', 'xiaoding']);
  });
});

describe('the shop remembers them', () => {
  const fresh = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-staff-stories-')), 'memory.json'));
  const day = (d: string) => new Date(`${d}T10:00:00`);
  /** Finished works with Clem's errand sent out, as the shop keeps them. */
  const withClem = (store: MemoryStore, n: number) => {
    const data = (store as unknown as { data: { commissions: CommissionMemo[] } }).data;
    for (let i = 0; i < n; i++) {
      data.commissions.push({ id: `c${i}`, title: `Work ${i}`, date: '2026-11-27', result: 'done', choices: {}, folder: `/w/${i}`,
        form: { want: 'x' }, rounds: [{ date: '2026-11-27', seconds: 1, helpers: { researcher: 1 }, waits: 0, waitedSeconds: 0 }] });
      store.finished(day('2026-11-27'));
    }
  };

  it('hands the counts of who was on what to the page', () => {
    const store = fresh();
    withClem(store, 3);
    expect(store.shopState(day('2026-12-01')).crew).toMatchObject({ adeng: 3, xiaoju: 3, laoshi: 0 });
  });

  it('writes down the day a chapter was told, and only a chapter that was waiting', () => {
    const store = fresh();
    expect(store.tellStaffStory('xiaoju', day('2026-12-01'))).toBeNull();
    withClem(store, STAFF_CHAPTERS.xiaoju[0].works);
    expect(store.tellStaffStory('xiaoju', day('2026-12-01'))).toBe(1);
    expect(store.tellStaffStory('xiaoju', day('2026-12-01'))).toBeNull();
    expect(store.shopState(day('2026-12-01')).town?.staff).toEqual({ xiaoju: ['2026-12-01'] });
  });
});

describe('the stories themselves', () => {
  for (const [file, S] of [['lines/staff-stories.yaml', LOCALES['zh-CN']], ['lines/en/staff-stories.yaml', LOCALES.en]] as const) {
    it(`${file}: three chapters each, every one a title, four to six short bubbles and its keepsake`, () => {
      const stories = parseStories(readFileSync(file, 'utf8'));
      expect(Object.keys(stories)).toEqual(STAFF_TELLERS);
      for (const t of STAFF_TELLERS) {
        expect(stories[t].map((c) => c.left), `${file} ${t}`).toEqual(STAFF_CHAPTERS[t].map((c) => c.left));
        for (const c of stories[t]) expect(c.lines.length, `${file} ${t} ${c.title}`).toBeGreaterThanOrEqual(4);
      }
      expect(lintStaffStories(stories, S)).toEqual([]);
    });
  }

  it('catches a chapter missing, a bubble too long, too many bubbles and a keepsake not in the table', () => {
    const stories = parseStories(readFileSync('lines/staff-stories.yaml', 'utf8'));
    stories.adeng = stories.adeng.slice(0, 2);
    stories.xiaoju[0] = { ...stories.xiaoju[0], lines: ['这一句话写得太长了，长到一个气泡怎么也装不下才行。', '好。', '好。', '好。'] };
    stories.qingdai[1] = { ...stories.qingdai[1], lines: Array(7).fill('好。') };
    stories.aqian[2] = { ...stories.aqian[2], left: 'piano' };
    expect(lintStaffStories(stories, LOCALES['zh-CN'])).toHaveLength(4);
  });
});

describe('the keepsakes', () => {
  it('are drawn in one row, a frame each, in the order of the table', () => {
    expect(existsSync('assets/sprites/keepsakes.png')).toBe(true);
    const png = readPng('assets/sprites/keepsakes.png');
    expect(png.width).toBe(KEEPSAKE_SIZE * KEEPSAKES.length);
    expect(png.height).toBe(KEEPSAKE_SIZE);
    // Every frame has something in it.
    for (let f = 0; f < KEEPSAKES.length; f++) {
      let ink = 0;
      for (let y = 0; y < KEEPSAKE_SIZE; y++) for (let x = 0; x < KEEPSAKE_SIZE; x++) ink += png.at(f * KEEPSAKE_SIZE + x, y).alpha ? 1 : 0;
      expect(ink, KEEPSAKES[f]).toBeGreaterThan(20);
    }
  });
});
