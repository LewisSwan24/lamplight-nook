import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { LOCALES } from '../app/shared/i18n';
import { YEAR_GAP_DAYS, YEAR_TELLERS, YEAR_WORKS, isVisitingTeller, nextYearChapter, toldYear, yearTower, type YearDays } from '../app/shared/mainstory';
import { APPRENTICE_AT, STAFF } from '../app/shared/staff';
import { STAFF_TELLERS } from '../app/shared/staffstories';
import { TELLERS } from '../app/shared/stories';
import { TOWER_STAGES } from '../app/shared/tower';
import { emptyTown, TOWN_MOVE } from '../app/shared/town';
import { lintChats, lintYear, parseChats, parseYear } from '../app/renderer/translator/lines';
import { CHAT_GAP_MS, Chatter } from '../app/renderer/stage/chatter';
import { pickVisit } from '../app/renderer/game/guests';
import type { TowerStage } from '../app/shared/tower';

// plan-2.0.md J7: the year's story. Twelve chapters, a month each, the whole town mending the clock tower; each told by
// one of the neighbours or the home staff, in turn; the tower moves on a look every two chapters (J6).

const at = (day: string, done: number) => ({ day, done });

describe('who tells the year', () => {
  it('twelve chapters, each told by someone else: the seven neighbours and the five at home', () => {
    expect(YEAR_TELLERS).toHaveLength(12);
    expect(new Set(YEAR_TELLERS).size).toBe(12);
    expect([...YEAR_TELLERS].sort()).toEqual([...TELLERS, ...STAFF].sort());
  });

  it('the neighbours come to the shop to tell theirs; the staff wait with a note', () => {
    for (const t of TELLERS) expect(isVisitingTeller(t), t).toBe(true);
    for (const s of STAFF) expect(isVisitingTeller(s), s).toBe(false);
  });
});

describe('when a chapter comes (plan-2.0.md Q-J4)', () => {
  it('the first once a first work is done', () => {
    expect(nextYearChapter([], 0, '2027-01-05')).toBe(null);
    expect(nextYearChapter([], 1, '2027-01-05')).toBe(1);
  });

  it('the next in a new month, or after ten more works, whichever is first', () => {
    const one: YearDays = [at('2027-01-05', 1)];
    expect(nextYearChapter(one, 1, '2027-01-25')).toBe(null);
    expect(nextYearChapter(one, 1 + YEAR_WORKS - 1, '2027-01-25')).toBe(null);
    expect(nextYearChapter(one, 1 + YEAR_WORKS, '2027-01-25')).toBe(2);
    expect(nextYearChapter(one, 1, '2027-02-08')).toBe(2);
  });

  it('never sooner than three days after the one before', () => {
    expect(YEAR_GAP_DAYS).toBe(3);
    const late: YearDays = [at('2027-01-30', 1)];
    expect(nextYearChapter(late, 1, '2027-02-01')).toBe(null);
    expect(nextYearChapter(late, 1, '2027-02-02')).toBe(2);
    const busy: YearDays = [at('2027-01-05', 1)];
    expect(nextYearChapter(busy, 40, '2027-01-07')).toBe(null);
    expect(nextYearChapter(busy, 40, '2027-01-08')).toBe(2);
  });

  it('waits for Bean to be in the shop before Bean’s chapter', () => {
    const n = YEAR_TELLERS.indexOf('xiaodou');
    const before: YearDays = Array.from({ length: n }, (_, i) => at(`2027-${String(i + 1).padStart(2, '0')}-05`, 1));
    const next = `2027-${String(n + 1).padStart(2, '0')}-05`;
    expect(nextYearChapter(before, APPRENTICE_AT - 1, next)).toBe(null);
    expect(nextYearChapter(before, APPRENTICE_AT, next)).toBe(n + 1);
  });

  it('none after the twelfth, and a chapter is written down only when it was waiting', () => {
    const all: YearDays = Array.from({ length: 12 }, (_, i) => at(`2027-${String(i + 1).padStart(2, '0')}-05`, 20));
    expect(nextYearChapter(all, 99, '2028-03-01')).toBe(null);
    expect(toldYear([], 0, '2027-01-05')).toEqual([]);
    expect(toldYear([], 3, '2027-01-05')).toEqual([at('2027-01-05', 3)]);
  });

  it('mends the tower a look every two chapters: scaffolding after the fourth, the bell after the twelfth', () => {
    const told = (n: number): YearDays => Array.from({ length: n }, () => at('2027-01-05', 1));
    expect([0, 3, 4, 6, 8, 10, 11, 12].map((n) => yearTower(told(n)))).toEqual(['stopped', 'stopped', 'scaffold', 'roof', 'face', 'hands', 'hands', 'lit']);
    expect(TOWER_STAGES.at(-1)).toBe('lit');
  });

  it('is kept by the shop: a chapter told is written down with the day and the works done', () => {
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-year-')), 'memory.json'));
    expect(store.tellYear(new Date('2027-01-05T10:00:00'))).toBe(null);
    (store as unknown as { data: { shop: unknown } }).data.shop = { done: 2, grown: [], told: [TOWN_MOVE], town: emptyTown() };
    expect(store.tellYear(new Date('2027-01-05T10:00:00'))).toBe(1);
    expect(store.tellYear(new Date('2027-01-05T10:00:00'))).toBe(null);
    expect(store.shopState(new Date('2027-01-05T10:00:00')).town?.year).toEqual([at('2027-01-05', 2)]);
  });
});

describe('talk that follows the tower', () => {
  const zh = parseChats(readFileSync('lines/chats.yaml', 'utf8'));
  const idle = (shop: { done: number; tower?: TowerStage }) =>
    new Chatter(zh.filter((c) => c.tower), [], 0, () => 0).next('idle', CHAT_GAP_MS, 'day', undefined, { ...shop, told: new Set(), made: {} });

  it('says the tower is stopped only while it is, and talks of it mended once it is', () => {
    const stopped = zh.filter((c) => c.tower === 'stopped').map((c) => c.id);
    const lit = zh.filter((c) => c.tower === 'lit').map((c) => c.id);
    expect(stopped).toEqual(expect.arrayContaining(['bridge_tower_years', 'bridge_tower_time', 'bridge_tower_inside']));
    expect(lit.length).toBeGreaterThanOrEqual(3);
    expect(stopped).toContain(idle({ done: 1 })?.id);
    expect(lit).toContain(idle({ done: 1, tower: 'lit' })?.id);
    expect(idle({ done: 1, tower: 'roof' })).toBe(null);
  });

  it('the neighbours too, when they drop in', () => {
    const shop = { made: {}, done: 1 };
    const visit = (tower: TowerStage) => pickVisit(zh, 'florist', { sky: 'clear', holiday: null, season: 'spring' }, 'day', () => true, new Set(zh.filter((c) => !c.tower).map((c) => c.id)), { ...shop, tower }, () => 0);
    expect(visit('stopped')?.tower).toBe('stopped');
    expect(visit('lit')?.tower ?? null).not.toBe('stopped');
  });

  it('only knows the tower’s own looks', () => {
    const [chat] = parseChats('- id: x\n  when: idle\n  tower: crooked\n  turns:\n    - adeng: 一\n    - laoshi: 二\n');
    expect(lintChats([chat])).toHaveLength(1);
  });
});

describe('the chapters themselves', () => {
  const books = [['lines/year.yaml', LOCALES['zh-CN']], ['lines/en/year.yaml', LOCALES.en]] as const;

  for (const [file, S] of books) {
    it(`${file}: twelve chapters, each with a title and a note, six to nine lines, the teller first`, () => {
      const year = parseYear(readFileSync(file, 'utf8'));
      expect(year).toHaveLength(12);
      year.forEach((c, i) => {
        expect(c.title, `${file} ${i + 1}`).not.toBe('');
        expect(c.note, `${file} ${i + 1}`).not.toBe('');
        expect(c.lines.length, `${file} ${i + 1}`).toBeGreaterThanOrEqual(6);
        expect(c.lines.length, `${file} ${i + 1}`).toBeLessThanOrEqual(9);
        expect(c.lines[0].who, `${file} ${i + 1}`).toBe(YEAR_TELLERS[i]);
      });
      expect(lintYear(year, S)).toEqual([]);
    });
  }

  it('gives everyone a turn: all eight of the staff and all seven neighbours speak in the year', () => {
    const year = parseYear(readFileSync('lines/year.yaml', 'utf8'));
    const speakers = new Set(year.flatMap((c) => c.lines.map((l) => l.who)));
    for (const who of [...STAFF_TELLERS, ...TELLERS]) expect(speakers.has(who), who).toBe(true);
  });

  it('says the same in both languages, by the same people in the same order', () => {
    const [zh, en] = books.map(([file]) => parseYear(readFileSync(file, 'utf8')));
    expect(en.map((c) => c.lines.map((l) => l.who))).toEqual(zh.map((c) => c.lines.map((l) => l.who)));
  });
});
