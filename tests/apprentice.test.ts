import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANCHORS, ACTORS, standPoint } from '../app/renderer/game/layout';
import { DIRECTIONS, STAFF_FRAME, STAFF_IDS, staffFrames } from '../app/renderer/game/sprites';
import { PORTRAIT_STAFF } from '../app/renderer/ui/expression';
import { parseChats, parseLines, pickLine } from '../app/renderer/translator/lines';
import { shopTimeline } from '../app/shared/days';
import { strings } from '../app/shared/i18n';
import { APPRENTICE_AT, STAFF, apprenticeHere, apprenticeNews } from '../app/shared/staff';
import type { AnchorId, CommissionMemo, Memory } from '../app/shared/types';
import { readPng } from './png';

// The apprentice (road-to-1.1.md A5): a fifth member of staff who only takes the errands that would otherwise wait.

describe('the apprentice joins the shop', () => {
  it('after the tenth work, and stays', () => {
    expect(APPRENTICE_AT).toBe(10);
    expect(apprenticeHere(APPRENTICE_AT - 1)).toBe(false);
    expect(apprenticeHere(APPRENTICE_AT)).toBe(true);
    expect(apprenticeHere(100)).toBe(true);
  });

  it('is news only on the work that brings them', () => {
    expect(apprenticeNews(APPRENTICE_AT - 1, APPRENTICE_AT)).toBe(true);
    expect(apprenticeNews(APPRENTICE_AT, APPRENTICE_AT + 1)).toBe(false);
    expect(apprenticeNews(3, 4)).toBe(false);
  });

  it('is one of the staff everywhere the staff are listed', () => {
    expect(STAFF).toContain('xiaodou');
    expect(STAFF_IDS).toEqual(STAFF);
    expect(PORTRAIT_STAFF).toEqual(STAFF);
    expect(ACTORS.map((a) => a.id)).toContain('xiaodou');
    expect(strings.actors.xiaodou).toBe('小豆');
  });

  it('has a sprite sheet laid out like the others, and a row of portraits', () => {
    const sheet = readPng('assets/sprites/xiaodou.png');
    const theirs = readPng('assets/sprites/xiaoju.png');
    expect([sheet.width, sheet.height]).toEqual([theirs.width, theirs.height]);
    // Every walking frame in every direction has someone in it.
    for (const dir of DIRECTIONS) {
      for (const frame of staffFrames('walk', dir)) {
        const [fx, fy] = [(frame % STAFF_FRAME.perRow) * STAFF_FRAME.width, Math.floor(frame / STAFF_FRAME.perRow) * STAFF_FRAME.height];
        let drawn = 0;
        for (let y = fy; y < fy + STAFF_FRAME.height; y++) for (let x = fx; x < fx + STAFF_FRAME.width; x++) if (sheet.at(x, y).alpha) drawn++;
        expect(drawn, `${dir} ${frame}`).toBeGreaterThan(60);
      }
    }
    // Nobody else's sheet with a new name.
    for (const other of STAFF.filter((s) => s !== 'xiaodou')) {
      const theirs = readPng(`assets/sprites/${other}.png`);
      let same = true;
      for (let x = 0; x < 16 * 6 && same; x++) for (let y = 32; y < 64 && same; y++) same = JSON.stringify(sheet.at(x, y)) === JSON.stringify(theirs.at(x, y));
      expect(same, other).toBe(false);
    }
    const portraits = readPng('assets/ui/portraits.png');
    expect(portraits.height).toBe(16 * STAFF.length);
  });

  it('has a place to stand at every anchor', () => {
    for (const anchor of Object.keys(ANCHORS) as AnchorId[]) {
      for (const actor of STAFF) {
        const p = standPoint(anchor, actor);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${actor} at ${anchor}`).toBe(true);
      }
    }
  });
});

describe('what the apprentice says, and what is said about them', () => {
  const books = [
    { cafe: 'lines/cafe.yaml', chats: 'lines/chats.yaml' },
    { cafe: 'lines/en/cafe.yaml', chats: 'lines/en/chats.yaml' },
  ];

  it('sets off and comes back with lines of their own, in both languages', () => {
    for (const { cafe } of books) {
      const lines = parseLines(readFileSync(cafe, 'utf8'));
      expect(lines.sub_go_xiaodou?.length, cafe).toBeGreaterThanOrEqual(3);
      expect(lines.sub_back_xiaodou?.length, cafe).toBeGreaterThanOrEqual(3);
      expect(lines.sub_go_xiaodou.every((l) => l.speaker === 'xiaodou' || l.reply?.speaker === 'xiaodou'), cafe).toBe(true);
      expect(lines.sub_back_xiaodou.every((l) => l.speaker === 'xiaodou'), cafe).toBe(true);
    }
  });

  it('is introduced once, the day they come, in both languages', () => {
    for (const { cafe } of books) {
      const turns = pickLine(parseLines(readFileSync(cafe, 'utf8')).grow, ['grow_apprentice'], {});
      expect(turns?.map((t) => t.speaker), cafe).toContain('xiaodou');
    }
  });

  it('is never in a chat before they have come', () => {
    for (const { chats } of books) {
      for (const c of parseChats(readFileSync(chats, 'utf8'))) {
        if (c.turns.some((t) => t.speaker === 'xiaodou')) expect(c.after ?? 0, `${chats} ${c.id}`).toBeGreaterThanOrEqual(APPRENTICE_AT);
      }
    }
  });

  it('chats with the staff, has a story of their own, and the neighbours notice, in both languages', () => {
    for (const { chats } of books) {
      const all = parseChats(readFileSync(chats, 'utf8')).filter((c) => c.turns.some((t) => t.speaker === 'xiaodou'));
      expect(all.filter((c) => !c.guest && !c.once).length, chats).toBeGreaterThanOrEqual(2);
      expect(all.some((c) => !c.guest && c.once), chats).toBe(true);
      for (const guest of ['baker', 'postman'] as const) expect(all.some((c) => c.guest === guest), `${chats} ${guest}`).toBe(true);
    }
  });
});

describe('the shop\'s days', () => {
  const day = (n: number) => new Date(2026, 0, n, 12);
  const work = (n: number) => ({ id: `c${day(n).getTime()}`, title: `work ${n}`, result: 'done', choices: {}, form: { want: 'x' } }) as unknown as CommissionMemo;
  const memory = (works: CommissionMemo[]): Memory => ({ commissions: works, stuckNotes: [], shop: { done: works.length, grown: [], told: [] } });

  it('tell the day the apprentice came', () => {
    const N = strings.ui.notebook;
    const entries = shopTimeline(memory(Array.from({ length: 12 }, (_, i) => work(i + 1))));
    const came = entries.filter((e) => e.text === N.apprentice);
    expect(came).toHaveLength(1);
    expect(came[0].date).toBe('2026-01-10');
    expect(shopTimeline(memory(Array.from({ length: 9 }, (_, i) => work(i + 1)))).some((e) => e.text === N.apprentice)).toBe(false);
  });
});
