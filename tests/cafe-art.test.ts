import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const SPRITES = resolve(__dirname, '..', 'assets', 'sprites');

/** The big table in cafe.png (scripts/art/scene.py), left and right edge. */
const TABLE = { left: 124, right: 181 };

/** RGBA pixels of a non-interlaced 8-bit PNG, which is all scripts/art writes. */
function readPng(name: string) {
  const png = readFileSync(join(SPRITES, name));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const channels = { 2: 3, 6: 4 }[png[25]];
  if (png[24] !== 8 || !channels) throw new Error(`${name}: unexpected PNG format`);
  const parts: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const predict = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      px[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predict) & 255;
    }
  }
  const at = (x: number, y: number) => {
    const i = y * stride + x * channels;
    return { rgb: (px[i] << 16) | (px[i + 1] << 8) | px[i + 2], alpha: channels === 4 ? px[i + 3] : 255 };
  };
  return { width, height, at };
}

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
