import { describe, expect, it } from 'vitest';
import { ANCHORS, CANVAS, ZONES, integerScale, pathBetween, uiScale, standPoint } from '../app/renderer/game/layout';

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

  it('counts real pixels when Windows scales the display, so every game pixel stays the same size', () => {
    // 1366x768 at 125%: 4 real pixels each, not 3 CSS pixels at 3.75 real ones.
    expect(integerScale(1093, 614, 1.25)).toBeCloseTo(4 / 1.25);
    // 1920x1080 at 150%.
    expect(integerScale(1280, 720, 1.5)).toBeCloseTo(6 / 1.5);
    // 2560x1440 at 175%.
    expect(integerScale(1463, 823, 1.75)).toBeCloseTo(8 / 1.75);
    expect(integerScale(1280, 720, 1)).toBe(4);
    // Never smaller than one real pixel.
    expect(integerScale(100, 100, 2)).toBe(0.5);
  });

  it('paths end at the anchor', () => {
    const path = pathBetween(ANCHORS.shelf, 'door', undefined, 'cafe');
    expect(path.at(-1)).toEqual({ x: ANCHORS.door.x, y: ANCHORS.door.y });
  });

  it('no movement when already there', () => {
    expect(pathBetween(ANCHORS.door, 'door', undefined, 'cafe')).toEqual([]);
  });
});

describe('card and text size', () => {
  it('stays at 1 up to 1280x720 and grows with bigger windows, within limits', () => {
    expect(uiScale(960, 540)).toBe(1);
    expect(uiScale(1280, 720)).toBe(1);
    expect(uiScale(1920, 1080)).toBe(1.5);
    expect(uiScale(1920, 600)).toBe(1);
    expect(uiScale(3840, 2160)).toBe(1.75);
  });
});
