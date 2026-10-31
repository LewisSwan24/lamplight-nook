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
