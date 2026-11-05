import { describe, expect, it } from 'vitest';
import { compareHalves } from '../tools/sim/soak.mjs';

const reading = (over: Record<string, number> = {}) => ({
  objects: 100, tweens: 5, timers: 5, dom: 300, listeners: 40, heapMB: 50, mainHeapMB: 30, ...over,
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
