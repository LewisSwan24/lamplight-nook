import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Director, PRIORITY } from '../app/renderer/translator/director';
import { type Line, lintLines, openingTurns, parseChats, parseLines, pickLine, toLineBook } from '../app/renderer/translator/lines';
import { HOLIDAYS } from '../app/renderer/game/weather';

describe('dialogue library', () => {
  const lib = parseLines(readFileSync('lines/cafe.yaml', 'utf8'));

  it('passes every writing rule', () => {
    expect(lintLines(lib)).toEqual([]);
  });

  it('catches lines that break the rules', () => {
    // Chinese sample lines: a particle from Laoshi, an over-long bubble that also names an emotion, a group of two.
    const bad = parseLines(`
g:
  - { id: a, speaker: laoshi, bubbles: ["好的呢"] }
  - { id: b, speaker: adeng, bubbles: ["我好开心啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊"] }
`);
    const p = lintLines(bad);
    expect(p.some((x) => x.includes('fewer than 3 lines'))).toBe(true);
    expect(p.some((x) => x.includes('never uses particles'))).toBe(true);
    expect(p.some((x) => x.includes('longer than 20'))).toBe(true);
    expect(p.some((x) => x.includes('names an emotion'))).toBe(true);
  });
});

describe('picking a one-off line', () => {
  const lines: Line[] = [
    { id: 'plain', speaker: 'adeng', bubbles: ['{name}, hi.'] },
    { id: 'mem', speaker: 'adeng', when: 'has_memory', bubbles: ['{name}, hi.', 'How is the {lastCommission}?'] },
    { id: 'first', speaker: 'adeng', when: 'first_time', bubbles: ['Hello there.'] },
  ];

  it('prefers a line whose condition holds', () => {
    expect(pickLine(lines, ['has_memory'], { name: 'Lin', lastCommission: 'ledger' })).toEqual([
      { speaker: 'adeng', text: 'Lin, hi.' },
      { speaker: 'adeng', text: 'How is the ledger?' },
    ]);
  });

  it('falls back to a plain line, never one whose condition does not hold', () => {
    expect(pickLine(lines, [], { name: 'Lin' })).toEqual([{ speaker: 'adeng', text: 'Lin, hi.' }]);
  });

  it('skips lines with a placeholder it cannot fill', () => {
    expect(pickLine(lines, ['has_memory'], { name: 'Lin' })).toEqual([{ speaker: 'adeng', text: 'Lin, hi.' }]);
    expect(pickLine(lines, [], {})).toBeNull();
  });
});

describe('lines for the day outside', () => {
  const lib = parseLines(readFileSync('lines/cafe.yaml', 'utf8'));
  const book = toLineBook(lib);
  const vars = { name: 'Lin', lastCommission: 'ledger', topic: 'tea', count: '3' };

  it('greets with the weather or the holiday before bringing up the last commission', () => {
    expect(pickLine(lib.app_open, ['has_memory', 'sky_rain'], vars)?.[1].text).toBe(lib.app_open.find((l) => l.id === 'open_rain')!.bubbles[1]);
    expect(pickLine(lib.app_open, ['has_memory', 'holiday_halloween'], vars)?.[1].text).toBe(lib.app_open.find((l) => l.id === 'open_halloween')!.bubbles[1]);
    expect(pickLine(lib.app_open, ['has_memory'], vars)?.[1].text).toBe(lib.app_open.find((l) => l.id === 'open_mem')!.bubbles[1].replace('{lastCommission}', 'ledger'));
  });

  it('still brings up the last commission after the weather or holiday line, saying hello once', () => {
    const say = (memory: string[], outside: string[]) => openingTurns(lib.app_open, memory, outside, vars)?.map((t) => t.text);
    const mem = lib.app_open.find((l) => l.id === 'open_mem')!.bubbles[1].replace('{lastCommission}', 'ledger');
    const halloween = lib.app_open.find((l) => l.id === 'open_halloween')!.bubbles;
    expect(say(['has_memory'], ['holiday_halloween'])).toEqual([halloween[0].replace('{name}', 'Lin'), halloween[1], mem]);
    expect(say(['has_memory'], [])).toEqual(['Lin，来啦。', mem]);
    expect(say([], ['holiday_halloween'])).toEqual([halloween[0].replace('{name}', 'Lin'), halloween[1]]);
  });

  it("has Xiaoju come back talking about the weather or the holiday, once, then as usual", () => {
    const d = new Director(book, { now: () => 0, lineCooldownMs: 0 });
    const back = (flags: string[]) => {
      const cmd = d.submit({ actor: 'xiaoju', state: 'returning', priority: PRIORITY.subagent, line: { group: 'sub_back_xiaoju', vars, flags } });
      d.finished('xiaoju');
      return cmd?.line?.vars?._id;
    };
    expect(back(['sky_rain', 'holiday_halloween'])).toBe('back_xj_rain');
    expect(back(['sky_rain', 'holiday_halloween'])).toBe('back_xj_halloween');
    expect(back(['sky_rain', 'holiday_halloween'])).toBe('back_xj_01');
  });

  it('greets every festival, has Xiaoju bring it back from errands and the staff talk about it, in both languages', () => {
    for (const [cafe, chatsFile] of [['lines/cafe.yaml', 'lines/chats.yaml'], ['lines/en/cafe.yaml', 'lines/en/chats.yaml']]) {
      const lines = parseLines(readFileSync(cafe, 'utf8'));
      const chats = parseChats(readFileSync(chatsFile, 'utf8'));
      for (const holiday of HOLIDAYS) {
        expect(lines.app_open.some((l) => l.when === `holiday_${holiday}`), `${cafe} open ${holiday}`).toBe(true);
        expect(lines.sub_back_xiaoju.some((l) => l.when === `holiday_${holiday}`), `${cafe} back ${holiday}`).toBe(true);
        expect(chats.some((c) => !c.guest && c.holiday === holiday), `${chatsFile} ${holiday}`).toBe(true);
      }
    }
  });
});
