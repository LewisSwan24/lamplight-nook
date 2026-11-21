import { describe, expect, it } from 'vitest';
import { compareHalves } from '../tools/sim/halves.mjs';

const reading = (over: Record<string, number> = {}) => ({
  objects: 100, tweens: 5, timers: 5, dom: 300, listeners: 40, heapMB: 50, mainHeapMB: 30, scenes: 3, textures: 200, ...over,
});

describe('reading a long run', () => {
  it('passes a shop that stays the same size', () => {
    const result = compareHalves(Array.from({ length: 20 }, () => reading()));
    expect(Object.values(result).some((r) => r.leaking)).toBe(false);
  });

  it('catches something that keeps growing', () => {
    const result = compareHalves(Array.from({ length: 20 }, (_, i) => reading({ objects: 100 + i * 5 })));
    expect(result.objects.leaking).toBe(true);
    expect(result.dom.leaking).toBe(false);
  });

  it('does not take one busy moment for a leak', () => {
    const readings = Array.from({ length: 20 }, () => reading());
    readings[15] = reading({ tweens: 400, heapMB: 300 });
    const result = compareHalves(readings);
    expect(result.tweens.leaking).toBe(false);
    expect(result.heapMB.leaking).toBe(false);
  });
});

describe('going in and out of the shops (road-to-1.4.md D8)', () => {
  it('catches a room or its pictures left behind: not one scene more, at most two textures', () => {
    const scenes = compareHalves(Array.from({ length: 20 }, (_, i) => reading({ scenes: i < 10 ? 3 : 4 })));
    expect(scenes.scenes.leaking).toBe(true);
    const textures = compareHalves(Array.from({ length: 20 }, (_, i) => reading({ textures: 200 + i })));
    expect(textures.textures.leaking).toBe(true);
    expect(compareHalves(Array.from({ length: 20 }, (_, i) => reading({ textures: 200 + (i % 3) }))).textures.leaking).toBe(false);
  });
});
