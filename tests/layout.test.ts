import { describe, expect, it } from 'vitest';
import { AISLE_Y, ANCHORS, CANVAS, ZONES, integerScale, pathBetween, standPoint } from '../app/renderer/game/layout';

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
    expect(path.at(-1)).toEqual({ x: ANCHORS.door.x, y: ANCHORS.door.y });
    expect(path.some((p) => p.y === AISLE_Y)).toBe(true);
  });

  it('no walk between two anchors crosses furniture standing on the floor', () => {
    const furniture = ZONES.filter((z) => ['shelf', 'table', 'corner', 'counter'].includes(z.id));
    const inside = (p: { x: number; y: number }) => furniture.find((z) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h);
    const anchors = Object.keys(ANCHORS) as (keyof typeof ANCHORS)[];
    for (const actor of ['adeng', 'xiaoju', 'laoshi'] as const) {
      for (const [from, to] of anchors.flatMap((f) => anchors.map((t) => [f, t] as const))) {
        let a: { x: number; y: number } = standPoint(from, actor);
        for (const b of pathBetween(a, to, actor)) {
          for (let t = 0; t <= 1; t += 0.05) {
            const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            expect(inside(p)?.id, `${actor}: ${from} -> ${to}`).toBeUndefined();
          }
          a = b;
        }
      }
    }
  });

  it('no movement when already there', () => {
    expect(pathBetween(ANCHORS.door, 'door')).toEqual([]);
  });
});
