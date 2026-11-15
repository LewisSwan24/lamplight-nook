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

describe('bubbles at the edge of the window', () => {
  const words = (key: string, x: number, w: number): BubbleBox => ({ key, x, y: 100, w, h: 20, iconOnly: false });

  it('moves words back inside, whichever side they would run off', () => {
    const places = placeBubbles([words('right', 900, 300), words('left', 40, 200)], [], [], 1000);
    expect(places.get('right')).toMatchObject({ x: 846, visible: true });
    expect(places.get('left')).toMatchObject({ x: 104, visible: true });
  });

  it('leaves words alone when they fit', () => {
    expect(placeBubbles([words('mid', 500, 100)], [], [], 1000).get('mid')?.x).toBe(500);
  });

  it('still keeps two people from talking over each other after moving one in', () => {
    const places = placeBubbles([words('a', 850, 200), words('b', 900, 300)], [], [], 1000);
    expect(places.get('b')!.y).toBeLessThan(places.get('a')!.y);
  });
});
describe('two crews talking at once (road-to-1.2.md B9)', () => {
  // Each speaker wears a flag in their project's colour just over the head; the bubble sits above their own.
  const flag = (x: number, y: number) => ({ left: x - 2, right: x + 6, top: y - 8, bottom: y });

  it('keeps words off the other crew’s flag: a bubble that would hide it moves up, clear of it', () => {
    const places = placeBubbles([bubble('adeng', 100, 92)], [], [], Infinity, [flag(130, 98)]);
    expect(places.get('adeng')).toMatchObject({ y: 86, visible: true });
  });

  it('shows both leads and their helpers at once, none on another’s words or flag', () => {
    const people = [
      { key: 'adeng', x: 100, y: 100 }, { key: 'xiaoju', x: 140, y: 100 },
      { key: 'qingdai', x: 170, y: 104 }, { key: 'xiaodou', x: 200, y: 108 },
    ];
    const flags = people.map((p) => flag(p.x, p.y + 10));
    const out = placeBubbles(people.map((p) => bubble(p.key, p.x, p.y, 90)), [], [], 1000, flags);
    const boxes = people.map((p) => ({ ...out.get(p.key)!, w: 90 }));
    expect(boxes.every((b) => b.visible)).toBe(true);
    const rect = (b: { x: number; y: number; w: number }) => ({ left: b.x - b.w / 2, right: b.x + b.w / 2, top: b.y - 20, bottom: b.y });
    const touch = (a: ReturnType<typeof rect>, b: { left: number; right: number; top: number; bottom: number }) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(touch(rect(a), rect(b))).toBe(false);
      for (const f of flags) expect(touch(rect(a), f)).toBe(false);
    }
  });
});
