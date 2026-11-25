import { describe, expect, it } from 'vitest';
import { CORK, WALL_CARD, stampColour, wallIndex, wallSpots } from '../app/renderer/game/postwall';
import { KEPT_MAX } from '../app/shared/postcard';
import { SCENES } from '../app/shared/scenes';

// The post office's cork board (plan-1.6.md F2): the postcards it keeps, pinned in rows above the sorting rack, each one
// a little card that opens the visit again.

describe('the cork board in the post office', () => {
  it('pins as many cards as it keeps, and no more', () => {
    expect(wallSpots(0)).toEqual([]);
    expect(wallSpots(2)).toHaveLength(2);
    expect(wallSpots(KEPT_MAX + 4)).toHaveLength(KEPT_MAX);
  });

  it('keeps every card on the board, none over another', () => {
    const spots = wallSpots(KEPT_MAX);
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(CORK.x + 1);
      expect(s.y).toBeGreaterThanOrEqual(CORK.y + 1);
      expect(s.x + WALL_CARD.w).toBeLessThanOrEqual(CORK.x + CORK.w - 1);
      expect(s.y + WALL_CARD.h).toBeLessThanOrEqual(CORK.y + CORK.h - 1);
    }
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) {
        const apart = a.x + WALL_CARD.w <= b.x || b.x + WALL_CARD.w <= a.x || a.y + WALL_CARD.h <= b.y || b.y + WALL_CARD.h <= a.y;
        expect(apart, `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(true);
      }
    }
  });

  it('puts the newest top left, reading on like a page', () => {
    const [first, second, , fourth] = wallSpots(4);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBe(first.y);
    expect(fourth.y).toBeGreaterThan(first.y);
  });

  it('stamps each card in a colour of its own for where the friend\'s shop is', () => {
    expect(new Set(SCENES.map(stampColour)).size).toBe(SCENES.length);
  });

  it('knows a pinned card by its place, and nothing else', () => {
    expect(wallIndex('wall-0')).toBe(0);
    expect(wallIndex('wall-5')).toBe(5);
    for (const other of ['wall-', 'wall-x', 'wall-1.5', 'table', 'grow-wall-1']) expect(wallIndex(other), other).toBeNull();
  });
});
