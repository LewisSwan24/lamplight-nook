import { describe, expect, it } from 'vitest';
import { findPath, hitsFeet, type Area, type Point } from '../app/renderer/game/path';

const room = (obstacles: Area['obstacles'] = []): Area => ({ left: 0, right: 100, top: 0, bottom: 100, obstacles });
const wall = { left: 40, right: 60, top: 0, bottom: 80 };

/** Every point along a walk, a pixel or so apart. */
function along(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s <= steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return out;
}

describe('finding a way across the floor', () => {
  it('walks straight when nothing is in the way', () => {
    expect(findPath(room(), { x: 10, y: 20 }, { x: 90, y: 20 })).toEqual([{ x: 90, y: 20 }]);
  });

  it('goes nowhere when already there', () => {
    expect(findPath(room(), { x: 10, y: 20 }, { x: 10, y: 20 })).toEqual([]);
  });

  it('goes round what stands in the way', () => {
    const from = { x: 10, y: 20 };
    const path = findPath(room([wall]), from, { x: 90, y: 20 });
    expect(path.at(-1)).toEqual({ x: 90, y: 20 });
    for (const p of along([from, ...path])) expect(hitsFeet(p, wall)).toBe(false);
  });

  it('takes the same way every time', () => {
    const area = room([wall]);
    const way = () => findPath(area, { x: 13, y: 21 }, { x: 87, y: 33 });
    expect(way()).toEqual(way());
  });

  it('prefers few turns', () => {
    const path = findPath(room(), { x: 10, y: 10 }, { x: 90, y: 90 });
    // One corner, rounded into two points, and the end; or a straight line when nothing is in the way.
    expect(path.length).toBeLessThanOrEqual(3);
  });

  it('starts from just off the grid, even tight against something', () => {
    const chair = { left: 40, right: 60, top: 40, bottom: 60 };
    const from = { x: 51, y: 63 };
    const path = findPath(room([chair]), from, { x: 51, y: 20 });
    expect(path.at(-1)).toEqual({ x: 51, y: 20 });
    for (const p of along([from, ...path])) expect(hitsFeet(p, chair)).toBe(false);
  });
});
