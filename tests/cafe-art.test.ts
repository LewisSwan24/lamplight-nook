import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPng as readPngAt } from './png';

const SPRITES = resolve(__dirname, '..', 'assets', 'sprites');

/** The big table in cafe.png (scripts/art/scene.py), left and right edge. */
const TABLE = { left: 124, right: 181 };

const readPng = (name: string) => readPngAt(join(SPRITES, name));

/** How far left and right the pixels picked out reach, over the room's middle (not the far-off counter). */
function reach(name: string, pick: (p: { rgb: number; alpha: number }) => boolean) {
  const { height, at } = readPng(name);
  let left = Infinity;
  let right = -Infinity;
  for (let y = 50; y < height; y++) {
    for (let x = 90; x < 215; x++) {
      if (pick(at(x, y))) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return { left, right };
}

const RUG_BORDER = 0xc3aa57;

describe('the cafe room', () => {
  it('centres the rug under the big table, showing the same on both sides', () => {
    const rug = reach('cafe.png', (p) => p.rgb === RUG_BORDER);
    expect(TABLE.left - rug.left).toBeGreaterThan(0);
    expect(TABLE.left - rug.left).toBe(rug.right - TABLE.right);
  });

  it('colours the whole rug in every furnishing choice, not just the old one', () => {
    const rug = reach('cafe.png', (p) => p.rgb === RUG_BORDER);
    for (const choice of ['blue', 'green', 'plum']) {
      const overlay = reach(`furnish-cafe-rug-${choice}.png`, (p) => p.alpha > 0);
      expect(overlay.left).toBeLessThanOrEqual(rug.left);
      expect(overlay.right).toBeGreaterThanOrEqual(rug.right);
    }
  });
});
