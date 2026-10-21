import { describe, expect, it } from 'vitest';
import { ANCHORS, CANVAS, ZONES, integerScale, pathBetween } from '../app/renderer/game/layout';

describe('scene layout', () => {
  it('all 7 zones fit on the canvas and have anchors', () => {
    expect(ZONES).toHaveLength(7);
    for (const z of ZONES) {
      expect(z.x + z.w).toBeLessThanOrEqual(CANVAS.width);
      expect(z.y + z.h).toBeLessThanOrEqual(CANVAS.height);
      expect(ANCHORS[z.id]).toBeDefined();
    }
  });

  it('scale is an integer: 4 at 1280x720, 3 at 960x540, 1 when too small', () => {
    expect(integerScale(1280, 720)).toBe(4);
    expect(integerScale(960, 540)).toBe(3);
    expect(integerScale(1000, 700)).toBe(3);
    expect(integerScale(100, 100)).toBe(1);
  });

  it('paths go via the aisle and end at the anchor', () => {
    const path = pathBetween(ANCHORS.shelf, 'door');
    expect(path.at(-1)).toEqual(ANCHORS.door);
    expect(path.some((p) => p.y === 124)).toBe(true);
  });

  it('no movement when already there', () => {
    expect(pathBetween(ANCHORS.door, 'door')).toEqual([]);
  });
});
