import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** RGBA pixels of a non-interlaced 8-bit PNG, which is all scripts/art writes. */
export function readPng(path: string) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const channels = { 2: 3, 6: 4 }[png[25]];
  if (png[24] !== 8 || !channels) throw new Error(`${path}: unexpected PNG format`);
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
