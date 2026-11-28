import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintChats, parseChats } from '../app/renderer/translator/lines';
import { LOCALES } from '../app/shared/i18n';
import { TELLERS } from '../app/shared/stories';
import { STOPS, firstStop, routeHome, stopForTool } from '../app/renderer/game/street';
import { STROLL_EVERY_MS, STROLLS, strollAt, strollMs } from '../app/renderer/game/strolls';
import { doorOf, RIVER, streetAt } from '../app/renderer/game/town';

// plan-2.0.md J9: the two streets come alive together. The neighbours walk over the bridge to the other street and
// back; the home shop's people run errands to the flower shop and the bookshop; the shop talks of its new neighbours.

const day = { hour: 11, sky: 'clear' as const, away: [] };
/** The middle of the n-th stroll. */
const mid = (n: number) => n * STROLL_EVERY_MS + strollMs(STROLLS[n % STROLLS.length]) / 2;

describe('the neighbours walk between the two streets', () => {
  it('each from their own place to a door on the other street, over the bridge', () => {
    expect(STROLLS.map((s) => s.who).sort()).toEqual([...TELLERS].sort());
    for (const s of STROLLS) {
      expect(streetAt(s.from), s.who).not.toBe(streetAt(s.to));
      expect(Math.min(s.from, s.to), s.who).toBeLessThan(RIVER.bridge.x);
      expect(Math.max(s.from, s.to), s.who).toBeGreaterThan(RIVER.bridge.x + RIVER.bridge.w);
    }
  });

  it('one at a time, there and later back, each done before the next sets off', () => {
    for (const s of STROLLS) expect(strollMs(s), s.who).toBeLessThan(STROLL_EVERY_MS);
    const n = STROLLS.length;
    for (let i = 0; i < 2 * n; i++) {
      const s = STROLLS[i % n];
      const start = strollAt(i * STROLL_EVERY_MS + 1, day);
      const end = strollAt(i * STROLL_EVERY_MS + strollMs(s) - 1, day);
      const back = Math.floor(i / n) % 2 === 1;
      expect(start?.who, `stroll ${i}`).toBe(s.who);
      expect(Math.abs(start!.x - (back ? s.to : s.from)), `stroll ${i} sets off`).toBeLessThan(1);
      expect(Math.abs(end!.x - (back ? s.from : s.to)), `stroll ${i} arrives`).toBeLessThan(1);
      expect(start!.dir, `stroll ${i}`).toBe(Math.sign((back ? s.from : s.to) - (back ? s.to : s.from)));
      expect(strollAt(i * STROLL_EVERY_MS + strollMs(s) + 10, day), `after stroll ${i}`).toBe(null);
    }
  });

  it('walks along the pavement, between where it set off and where it is going', () => {
    const w = strollAt(mid(0), day)!;
    const s = STROLLS[0];
    expect(w.x).toBeGreaterThan(Math.min(s.from, s.to));
    expect(w.x).toBeLessThan(Math.max(s.from, s.to));
    expect(w.y).toBeGreaterThan(RIVER.tower.h);
  });

  it('stays in at night and in a storm, and not while waiting at home with a story', () => {
    expect(strollAt(mid(0), { ...day, hour: 22 })).toBe(null);
    expect(strollAt(mid(0), { ...day, hour: 6 })).toBe(null);
    expect(strollAt(mid(0), { ...day, sky: 'storm' })).toBe(null);
    expect(strollAt(mid(0), { ...day, away: [STROLLS[0].who] })).toBe(null);
    expect(strollAt(mid(1), { ...day, away: [STROLLS[0].who] })?.who).toBe(STROLLS[1].who);
  });
});

describe('errands to the river street', () => {
  it('has the flower shop and the bookshop among the stops, at their doors', () => {
    expect(STOPS.flowershop).toBe(doorOf('flowershop').x);
    expect(STOPS.bookshop).toBe(doorOf('bookshop').x);
  });

  it('sends Iris to the flower shop for colours, and every other outing to Uncle Page’s for a book', () => {
    expect(firstStop('qingdai', 0)).toBe('flowershop');
    expect(firstStop('qingdai', 1)).toBe('flowershop');
    expect([0, 1, 2, 3].map((n) => firstStop('xiaoju', n))).toEqual(['library', 'bookshop', 'library', 'bookshop']);
    expect(firstStop('laoshi', 1)).toBe('bookshop');
  });

  it('goes on to the post office to look something up, and otherwise stays where the outing took them', () => {
    expect(stopForTool('WebSearch', 'bookshop')).toBe('post');
    expect(stopForTool('Read', 'bookshop')).toBe('bookshop');
    expect(stopForTool('Read', 'flowershop')).toBe('flowershop');
    expect(stopForTool('Read')).toBe('library');
  });

  it('comes home over the bridge past the bakery, for a snack to share', () => {
    expect(routeHome(STOPS.bookshop)).toEqual(['bakery', 'nook']);
    expect(routeHome(STOPS.flowershop)).toEqual(['bakery', 'nook']);
  });
});

describe('talk of the new neighbours', () => {
  const books = [
    { file: 'lines/chats.yaml', S: LOCALES['zh-CN'], names: ['芳姐', '简伯'] },
    { file: 'lines/en/chats.yaml', S: LOCALES.en, names: ['Fern', 'Uncle Page'] },
  ];
  const ours = (file: string) => parseChats(readFileSync(file, 'utf8')).filter((c) => c.id.startsWith('bridge_'));

  it('has some forty chats about the river street, the same in both languages, and all within the rules', () => {
    const [zh, en] = books.map((b) => ours(b.file));
    expect(zh.length).toBeGreaterThanOrEqual(40);
    expect(en.map((c) => [c.id, c.guest ?? null, c.turns.map((t) => t.speaker)])).toEqual(zh.map((c) => [c.id, c.guest ?? null, c.turns.map((t) => t.speaker)]));
    for (const b of books) expect(lintChats(parseChats(readFileSync(b.file, 'utf8')), b.S), b.file).toEqual([]);
  });

  it('has the old neighbours greet the new ones, the new ones visit, and the staff talk of the river and the tower', () => {
    for (const b of books) {
      const chats = ours(b.file);
      const text = (c: (typeof chats)[number]) => c.turns.map((t) => t.text).join(' ');
      const old = chats.filter((c) => c.guest && !['florist', 'bookseller'].includes(c.guest) && b.names.some((n) => text(c).includes(n)));
      expect(new Set(old.map((c) => c.guest)).size, b.file).toBeGreaterThanOrEqual(5);
      expect(chats.filter((c) => c.guest === 'florist').length, b.file).toBeGreaterThanOrEqual(3);
      expect(chats.filter((c) => c.guest === 'bookseller').length, b.file).toBeGreaterThanOrEqual(3);
      expect(chats.filter((c) => !c.guest).length, b.file).toBeGreaterThanOrEqual(20);
    }
  });
});
