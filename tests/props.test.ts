import { describe, expect, it } from 'vitest';
import { PROP_IDS, PROPS, propFrame, propOffset } from '../app/renderer/game/props';

describe('things in hand', () => {
  it('draws every frame of every prop as a clean rectangle with known colours', () => {
    for (const id of PROP_IDS) {
      const { frames, colors } = PROPS[id];
      const width = frames[0][0].length;
      for (const rows of frames) {
        expect(rows.length, id).toBe(frames[0].length);
        for (const row of rows) {
          expect(row.length, `${id}: ${row}`).toBe(width);
          for (const c of row) if (c !== '.') expect(colors[c], `${id}: ${c}`).toBeDefined();
        }
      }
    }
  });

  it('writes on a page that stays put on the table, with a pencil that moves', () => {
    const at = [0, 200, 400, 600].map((ms) => ms + 1000);
    expect(new Set(at.map((ms) => JSON.stringify(propOffset('pencil', 'left', 'sit', ms)))).size).toBe(1);
    expect(new Set(at.map((ms) => propFrame('pencil', ms))).size).toBe(2);
  });

  it('puts the page out on the table, on the side the character faces', () => {
    expect(propOffset('pencil', 'left', 'sit', 1).x).toBeLessThan(-8);
    expect(propOffset('pencil', 'right', 'sit', 1).x).toBeGreaterThan(8);
  });

  it('raises the cup now and then, and taps the hammer', () => {
    const cup = [500, 3500].map((ms) => propOffset('cup', 'right', 'idle', ms).y);
    expect(cup[1]).toBeLessThan(cup[0]);
    expect(new Set([100, 400].map((ms) => propOffset('hammer', 'right', 'lift', ms).y)).size).toBe(2);
  });

  it('keeps still with reduced motion', () => {
    for (const id of PROP_IDS) {
      expect(propFrame(id, 0)).toBe(0);
      expect(propOffset(id, 'right', 'idle', 0)).toEqual(propOffset(id, 'right', 'idle', 0));
    }
    expect(propOffset('cup', 'right', 'idle', 0).y).toBe(propOffset('cup', 'right', 'idle', 500).y);
  });
});
