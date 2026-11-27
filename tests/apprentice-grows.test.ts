import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chatsForStage, linesForStage, lintChats, lintLines, parseChats, parseLines, pickLine, type Chat, type LineLibrary } from '../app/renderer/translator/lines';
import { shopTimeline } from '../app/shared/days';
import { LOCALES, strings } from '../app/shared/i18n';
import { APPRENTICE_STAGES, apprenticeLook, apprenticeStage, stageNews } from '../app/shared/staff';
import type { CommissionMemo, Memory } from '../app/shared/types';
import { readPng } from './png';

// The apprentice grows up (plan-1.9.md I2): three stages by the works Bean has been on (shared/crew.ts), each with a
// look and a way of talking of its own; Wick marks the day of each, and so do the shop's days.

describe('the stages', () => {
  it('come at 30 and 80 of Bean’s own works', () => {
    expect(APPRENTICE_STAGES).toEqual([30, 80]);
    expect([0, 29, 30, 79, 80, 200].map(apprenticeStage)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('are news only on the work that reaches one', () => {
    expect(stageNews(29, 30)).toBe(2);
    expect(stageNews(79, 81)).toBe(3);
    expect(stageNews(30, 31)).toBeNull();
    expect(stageNews(0, 1)).toBeNull();
  });

  it('each have their own sprite sheet, laid out like the first, and none the same', () => {
    expect([1, 2, 3].map((s) => apprenticeLook(s as 1 | 2 | 3))).toEqual(['xiaodou', 'xiaodou-2', 'xiaodou-3']);
    const sheets = ['xiaodou', 'xiaodou-2', 'xiaodou-3'].map((s) => readPng(`assets/sprites/${s}.png`));
    for (const s of sheets) expect([s.width, s.height]).toEqual([sheets[0].width, sheets[0].height]);
    const differ = (a: ReturnType<typeof readPng>, b: ReturnType<typeof readPng>) => {
      for (let x = 0; x < 16 * 6; x++) for (let y = 32; y < 64; y++) if (JSON.stringify(a.at(x, y)) !== JSON.stringify(b.at(x, y))) return true;
      return false;
    };
    expect(differ(sheets[0], sheets[1]) && differ(sheets[1], sheets[2]) && differ(sheets[0], sheets[2])).toBe(true);
  });
});

describe('lines for a stage', () => {
  const lib: LineLibrary = {
    sub_back_xiaodou: [
      { id: 'a', speaker: 'xiaodou', bubbles: ['回来了！'], stage: 1 },
      { id: 'b', speaker: 'xiaodou', bubbles: ['回来了。'], stage: 2 },
      { id: 'c', speaker: 'xiaodou', bubbles: ['都在这儿。'] },
    ],
  };
  const chats: Chat[] = [
    { id: 'x', when: 'idle', after: 10, stage: 3, turns: [{ speaker: 'xiaodou', text: '我来。' }, { speaker: 'adeng', text: '好。' }] },
    { id: 'y', when: 'idle', turns: [{ speaker: 'adeng', text: '嗯。' }, { speaker: 'laoshi', text: '嗯。' }] },
  ];

  it('keep only that stage’s, and everything not marked', () => {
    expect(linesForStage(lib, 1).sub_back_xiaodou.map((l) => l.id)).toEqual(['a', 'c']);
    expect(linesForStage(lib, 2).sub_back_xiaodou.map((l) => l.id)).toEqual(['b', 'c']);
    expect(linesForStage(lib, 3).sub_back_xiaodou.map((l) => l.id)).toEqual(['c']);
    expect(chatsForStage(chats, 1).map((c) => c.id)).toEqual(['y']);
    expect(chatsForStage(chats, 3).map((c) => c.id)).toEqual(['x', 'y']);
  });

  it('are marked only where Bean speaks, with a stage that exists', () => {
    expect(lintLines({ g: [...lib.sub_back_xiaodou, { id: 'd', speaker: 'adeng', bubbles: ['嗯。'], stage: 2 }] })).toHaveLength(1);
    expect(lintLines({ g: [...lib.sub_back_xiaodou, { id: 'd', speaker: 'xiaodou', bubbles: ['嗯。'], stage: 4 as 1 }] })).toHaveLength(1);
    expect(lintChats([...chats, { ...chats[1], id: 'z', stage: 2 }])).toHaveLength(1);
  });
});

describe('what Bean says at each stage, in both languages', () => {
  const books = [
    { cafe: 'lines/cafe.yaml', chats: 'lines/chats.yaml', S: LOCALES['zh-CN'] },
    { cafe: 'lines/en/cafe.yaml', chats: 'lines/en/chats.yaml', S: LOCALES.en },
  ];
  const staged = (lib: LineLibrary, chats: Chat[]) => [...Object.values(lib).flat(), ...chats].filter((e) => e.stage).map((e) => `${e.id}@${e.stage}`).sort();

  it('the same lines marked in both, about thirty for each later stage, and nothing broken', () => {
    const [zh, en] = books.map(({ cafe, chats }) => ({ lib: parseLines(readFileSync(cafe, 'utf8')), chats: parseChats(readFileSync(chats, 'utf8')) }));
    expect(staged(en.lib, en.chats)).toEqual(staged(zh.lib, zh.chats));
    for (const stage of [2, 3]) {
      const lines = Object.values(zh.lib).flat().filter((l) => l.stage === stage);
      const chats = zh.chats.filter((c) => c.stage === stage);
      const said = lines.reduce((n, l) => n + l.bubbles.length + (l.reply?.bubbles.length ?? 0), 0) + chats.reduce((n, c) => n + c.turns.length, 0);
      expect(said, `stage ${stage}`).toBeGreaterThanOrEqual(30);
    }
    for (const { cafe, chats, S } of books) {
      expect(lintLines(parseLines(readFileSync(cafe, 'utf8')), S), cafe).toEqual([]);
      expect(lintChats(parseChats(readFileSync(chats, 'utf8')), S), chats).toEqual([]);
    }
  });

  it('errands, the garden and mutters never run dry at any stage', () => {
    for (const { cafe } of books) {
      const lib = parseLines(readFileSync(cafe, 'utf8'));
      for (const stage of [1, 2, 3] as const) {
        const at = linesForStage(lib, stage);
        expect(at.sub_go_xiaodou.length, `${cafe} go ${stage}`).toBeGreaterThanOrEqual(3);
        expect(at.sub_back_xiaodou.length, `${cafe} back ${stage}`).toBeGreaterThanOrEqual(3);
        expect(at.garden.filter((l) => l.speaker === 'xiaodou').length, `${cafe} garden ${stage}`).toBeGreaterThanOrEqual(2);
        if (stage > 1) expect(at.idle_mutter.filter((l) => l.speaker === 'xiaodou').length, `${cafe} mutter ${stage}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('once grown, Bean greets a neighbour for Wick', () => {
    for (const { chats } of books) {
      const grown = chatsForStage(parseChats(readFileSync(chats, 'utf8')), 3).filter((c) => c.guest && c.stage === 3);
      expect(grown.length, chats).toBeGreaterThanOrEqual(2);
      for (const c of grown) expect(c.turns[1].speaker, `${chats} ${c.id}`).toBe('xiaodou');
    }
  });

  it('Wick marks the day of each stage, and Bean answers', () => {
    for (const { cafe } of books) {
      const lib = parseLines(readFileSync(cafe, 'utf8'));
      for (const stage of [2, 3]) {
        const turns = pickLine(lib.grow, [`grow_apprentice_${stage}`], {});
        expect(turns?.[0].speaker, `${cafe} ${stage}`).toBe('adeng');
        expect(turns?.map((t) => t.speaker), `${cafe} ${stage}`).toContain('xiaodou');
      }
    }
  });
});

describe('the shop’s days', () => {
  const day = (n: number) => new Date(2026, 0, 1 + n, 12);
  const work = (n: number) => ({
    id: `c${day(n).getTime()}`, title: `work ${n}`, result: 'done', choices: {}, form: { want: 'x' },
    rounds: [{ date: '2026-01-01', seconds: 1, helpers: {}, waits: 0, waitedSeconds: 0 }],
  }) as unknown as CommissionMemo;
  const memory = (works: CommissionMemo[]): Memory => ({ commissions: works, stuckNotes: [], projects: [], shop: { done: works.length, grown: [], told: [] } });
  const N = strings.ui.notebook;

  it('tell the day Bean reached each stage, by the works Bean was on', () => {
    // Bean comes with the tenth and is on every home work after, so the 30th of theirs is the shop's 40th.
    const entries = shopTimeline(memory(Array.from({ length: 95 }, (_, i) => work(i + 1))));
    const handy = entries.filter((e) => e.text === N.apprenticeHandy);
    const grown = entries.filter((e) => e.text === N.apprenticeGrown);
    expect(handy.map((e) => e.date)).toEqual(['2026-02-10']);
    expect(grown.map((e) => e.date)).toEqual(['2026-04-01']);
    expect(shopTimeline(memory(Array.from({ length: 39 }, (_, i) => work(i + 1)))).some((e) => e.text === N.apprenticeHandy)).toBe(false);
  });
});
