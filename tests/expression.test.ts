import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTOR_STATES } from '../app/renderer/translator/state-machine';
import { EXPRESSIONS, EXPRESSION_BADGE, PORTRAIT_STAFF, expressionFor } from '../app/renderer/ui/expression';

describe('portrait expressions', () => {
  it('gives every character state a face', () => {
    for (const state of ACTOR_STATES) expect(EXPRESSIONS).toContain(expressionFor(state));
  });

  it('matches the face to what is happening', () => {
    expect(expressionFor('stuck')).toBe('troubled');
    expect(expressionFor('asking')).toBe('unsure');
    expect(expressionFor('serious')).toBe('serious');
    expect(expressionFor('wrapping')).toBe('happy');
    expect(expressionFor('working')).toBe('calm');
  });

  it('pins no bubble on calm or serious faces', () => {
    expect(EXPRESSION_BADGE.calm).toBeUndefined();
    expect(EXPRESSION_BADGE.serious).toBeUndefined();
  });

  it('has one 16px face per expression and character on the portrait sheet', () => {
    // A PNG's width and height sit at bytes 16-23 of the header.
    const png = readFileSync('assets/ui/portraits.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([16 * EXPRESSIONS.length, 16 * PORTRAIT_STAFF.length]);
  });
});

describe('parcel text', () => {
  it('drops colour codes but keeps the colour names and ordinary words', async () => {
    const { withoutColourCodes } = await import('../app/shared/text');
    expect(withoutColourCodes('配色：奶油白 FBF6EC 底，墨绿 2F5D50 主色。')).toBe('配色：奶油白底，墨绿主色。');
    expect(withoutColourCodes('Cream (#FBF6EC) background, a decade, 123456 words')).toBe('Cream background, a decade, 123456 words');
  });
});
