import { describe, expect, it } from 'vitest';
import { type BubbleBox, placeBubbles } from '../app/renderer/ui/bubble-layout';

const bubble = (key: string, x: number, y: number, w = 100, h = 20, iconOnly = false): BubbleBox => ({ key, x, y, w, h, iconOnly });
const icon = (key: string, x: number, y: number) => bubble(key, x, y, 32, 32, true);

describe('placing speech bubbles', () => {
  it('leaves bubbles that do not touch where they are', () => {
    const out = placeBubbles([bubble('a', 100, 100), bubble('b', 400, 100)], []);
    expect(out.get('a')).toMatchObject({ y: 100, visible: true });
    expect(out.get('b')).toMatchObject({ y: 100, visible: true });
  });

  it('moves the later of two overlapping bubbles up, clear of the first', () => {
    const out = placeBubbles([bubble('a', 100, 100), bubble('b', 150, 95)], []);
    expect(out.get('a')).toMatchObject({ y: 100, visible: true });
    expect(out.get('b')).toMatchObject({ y: 76, visible: true }); // the first one's top (80), less the gap
  });

  it('keeps moving up until it is clear of every bubble', () => {
    const out = placeBubbles([bubble('a', 100, 100), bubble('b', 100, 76), bubble('c', 100, 98)], []);
    expect(out.get('c')).toMatchObject({ y: 52, visible: true });
  });

  it('hides a bubble that would be pushed out of the top of the window', () => {
    const out = placeBubbles([bubble('a', 100, 22), bubble('b', 100, 20)], []);
    expect(out.get('a')?.visible).toBe(true);
    expect(out.get('b')?.visible).toBe(false);
  });

  it('hides a bubble a card would cut, rather than show part of it', () => {
    const card = { left: 150, top: 0, right: 500, bottom: 300 };
    const out = placeBubbles([bubble('cut', 120, 100), bubble('far', 600, 100)], [card]);
    expect(out.get('cut')?.visible).toBe(false);
    expect(out.get('far')?.visible).toBe(true);
  });

  it('does not make room for a bubble the card has hidden', () => {
    const card = { left: 150, top: 0, right: 500, bottom: 300 };
    const out = placeBubbles([bubble('hidden', 120, 100), bubble('next', 60, 100, 60)], [card]);
    expect(out.get('next')).toMatchObject({ y: 100, visible: true });
  });

  it('lets a mood icon give way to words wherever it comes in the list', () => {
    const out = placeBubbles([icon('mood', 100, 100), bubble('words', 100, 95)], []);
    expect(out.get('words')).toMatchObject({ y: 95, visible: true });
    expect(out.get('mood')?.visible).toBe(false);
  });

  it('keeps a mood icon that touches nothing, and only one of two that overlap', () => {
    const out = placeBubbles([icon('one', 100, 100), icon('two', 110, 100), icon('three', 400, 100)], []);
    expect(out.get('one')?.visible).toBe(true);
    expect(out.get('two')?.visible).toBe(false);
    expect(out.get('three')?.visible).toBe(true);
  });
});
