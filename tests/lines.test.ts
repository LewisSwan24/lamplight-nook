import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Line, lintLines, parseLines, pickLine } from '../app/renderer/translator/lines';

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
