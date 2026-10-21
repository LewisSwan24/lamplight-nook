import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintLines, parseLines } from '../app/renderer/translator/lines';

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
