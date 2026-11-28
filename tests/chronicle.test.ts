import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { PostcardWall } from '../app/main/postcard';
import { CHRONICLE_PARTS, chronicle, type ChronicleInput } from '../app/shared/chronicle';
import { GROWTH } from '../app/shared/growth';
import { HOLIDAYS } from '../app/shared/holidays';
import { LOCALES } from '../app/shared/i18n';
import { DEFAULT_FURNISHING } from '../app/shared/furnish';
import { KEPT_MAX, makePostcard, postcardText, type Postcard } from '../app/shared/postcard';
import { SCENES } from '../app/shared/scenes';
import { STAFF_CHAPTERS, STAFF_TELLERS } from '../app/shared/staffstories';
import { CHAPTERS, TELLERS } from '../app/shared/stories';
import { emptyTown, TOWN_MOVE } from '../app/shared/town';
import { STREET_GROWTH } from '../app/shared/towngrow';
import { objectReaction } from '../app/renderer/game/objects';

// plan-2.0.md J8: the town's record, a book on the home shop's shelf. Six parts: the year's story, the neighbours'
// stories, the staff's, what has grown, the festivals kept, the postcards received. Everything with the day it came;
// what has not come yet is a blank with a line on how it comes, giving nothing away.

const fresh = (): ChronicleInput => ({ shop: { done: 0, grown: [], told: [TOWN_MOVE], town: emptyTown() }, postcards: [] });

const furnish = Object.fromEntries(SCENES.map((s) => [s, DEFAULT_FURNISHING])) as Postcard['furnish'];
const card = (name: string): Postcard => makePostcard(name, { scene: 'cafe', furnish }, { done: 3, grown: [], told: [] });

describe('the parts of the record', () => {
  it('has six parts, in order', () => {
    expect(CHRONICLE_PARTS).toEqual(['year', 'stories', 'staff', 'grown', 'holidays', 'postcards']);
    expect(chronicle(fresh()).map((p) => p.id)).toEqual([...CHRONICLE_PARTS]);
  });

  it('a new shop’s record is all blanks: every chapter, every piece, every festival; no postcards yet', () => {
    const parts = Object.fromEntries(chronicle(fresh()).map((p) => [p.id, p.entries]));
    expect(parts.year).toHaveLength(12);
    expect(parts.stories).toHaveLength(TELLERS.reduce((n, t) => n + CHAPTERS[t].length, 0));
    expect(parts.staff).toHaveLength(STAFF_TELLERS.reduce((n, t) => n + STAFF_CHAPTERS[t].length, 0));
    expect(parts.grown).toHaveLength(GROWTH.length + STREET_GROWTH.length);
    expect(parts.holidays).toHaveLength(HOLIDAYS.length);
    expect(parts.postcards).toEqual([]);
    for (const id of ['year', 'stories', 'staff', 'grown', 'holidays']) for (const e of parts[id]) expect(e.date, `${id} ${e.id}`).toBe(null);
  });

  it('dates everything that has come, by the day it came', () => {
    const input = fresh();
    const town = input.shop.town!;
    town.year = [{ day: '2027-01-05', done: 1 }, { day: '2027-02-05', done: 3 }];
    town.stories = { granny: ['2027-01-09'] };
    town.staff = { xiaoju: ['2027-01-10', '2027-01-20'] };
    town.street = [{ id: 'lamps', date: '2027-01-11' }];
    town.holidays = [{ id: 'lantern', date: '2027-02-18' }];
    input.shop.grown = [{ id: GROWTH[0].id, date: '2027-01-12' }];
    input.postcards = [{ name: 'Mei', home: 'study', date: '2027-03-01' }];
    const at = (part: string, id: string) => chronicle(input).find((p) => p.id === part)!.entries.find((e) => e.id === id)!.date;
    expect(at('year', 'year-2')).toBe('2027-02-05');
    expect(at('year', 'year-3')).toBe(null);
    expect(at('stories', 'granny-1')).toBe('2027-01-09');
    expect(at('stories', 'granny-2')).toBe(null);
    expect(at('staff', 'xiaoju-2')).toBe('2027-01-20');
    expect(at('grown', GROWTH[0].id)).toBe('2027-01-12');
    expect(at('grown', 'street-lamps')).toBe('2027-01-11');
    expect(at('holidays', 'lantern')).toBe('2027-02-18');
    expect(at('holidays', 'mid_autumn')).toBe(null);
    expect(chronicle(input).find((p) => p.id === 'postcards')!.entries).toEqual([{ id: 'postcard-1', who: 'Mei', home: 'study', date: '2027-03-01' }]);
  });
});

describe('what the record keeps beyond the shop’s other places', () => {
  it('keeps every postcard ever opened with its day, after the wall has let it go; the same card only once', () => {
    const wall = new PostcardWall(mkdtempSync(join(tmpdir(), 'lamplight-record-')));
    const names = Array.from({ length: KEPT_MAX + 2 }, (_, i) => `Friend ${i + 1}`);
    names.forEach((n, i) => wall.keep(card(n), `2027-01-${String(i + 1).padStart(2, '0')}`));
    wall.keep(card('Friend 1'), '2027-02-01');
    expect(wall.cards()).toHaveLength(KEPT_MAX);
    expect(wall.received().map((c) => c.name)).toEqual(names);
    expect(wall.received()[0]).toEqual({ name: 'Friend 1', home: 'cafe', date: '2027-01-01' });
  });

  it('reads an old postcards.json without a list of received cards as the cards on its wall, undated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lamplight-record-'));
    writeFileSync(join(dir, 'postcards.json'), JSON.stringify({ version: 1, cards: [JSON.parse(postcardText(card('Old friend')))] }));
    expect(new PostcardWall(dir).received()).toEqual([{ name: 'Old friend', home: 'cafe', date: null }]);
  });

  it('writes down the first day the shop was open for each festival, and only the first', () => {
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-record-')), 'memory.json'));
    (store as unknown as { data: { shop: unknown } }).data.shop = { done: 1, grown: [], told: [TOWN_MOVE], town: emptyTown() };
    store.noteHoliday(new Date('2027-02-20T10:00:00'));
    store.noteHoliday(new Date('2027-02-21T10:00:00'));
    store.noteHoliday(new Date('2027-03-10T10:00:00'));
    expect(store.shopState(new Date('2027-03-10T10:00:00')).town?.holidays).toEqual([{ id: 'lantern', date: '2027-02-20' }]);
  });
});

describe('the book and its words', () => {
  it('is the book on the home shop’s shelf: clicking the shelf opens it, busy or not', () => {
    const O = LOCALES.en.ui.objects;
    const ctx = { running: false, hour: 10, minute: 0, sky: 'clear' as const, period: 'day' as const, errand: null, materials: [], laoshiDoing: '', turn: 0 };
    expect(objectReaction('shelf', ctx, O)).toMatchObject({ book: true, walk: 'shelf' });
    expect(objectReaction('shelf', { ...ctx, running: true }, O)).toMatchObject({ book: true });
  });

  it('has a name for every part, a hint for every blank, and names for the street’s pieces and the festivals, in both languages', () => {
    for (const lang of ['zh-CN', 'en'] as const) {
      const C = LOCALES[lang].ui.chronicle;
      for (const part of CHRONICLE_PARTS) {
        expect(C.parts[part], `${lang} ${part}`).toBeTruthy();
        expect(C.hints[part], `${lang} ${part}`).toBeTruthy();
      }
      for (const g of STREET_GROWTH) expect(C.street[g.id], `${lang} ${g.id}`).toBeTruthy();
      for (const h of HOLIDAYS) expect(C.holidays[h], `${lang} ${h}`).toBeTruthy();
      // The hints say how a thing comes, never what it is: no chapter titles, no names of pieces.
      const hints = Object.values(C.hints).join(' ');
      for (const g of STREET_GROWTH) expect(hints.includes(C.street[g.id]), `${lang} gives away ${g.id}`).toBe(false);
    }
  });
});
