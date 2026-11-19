/** What a picture is and how big, read from its first bytes, so a made file can keep its shape. */
export type Picture = { type: 'png' | 'jpg' | 'gif'; mime: string; width: number; height: number };

export function picture(buf: Buffer): Picture {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { type: 'png', mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.toString('ascii', 0, 4) === 'GIF8') return { type: 'gif', mime: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    // The size is in the first start-of-frame segment (SOF0 to SOF15, without the DHT, JPG and DAC markers).
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) break;
      const marker = buf[at + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', mime: 'image/jpeg', width: buf.readUInt16BE(at + 7), height: buf.readUInt16BE(at + 5) };
      }
      at += 2 + buf.readUInt16BE(at + 2);
    }
  }
  throw new Error('That picture is not a PNG, JPEG or GIF this app can read.');
}

/** Fitted inside maxW x maxH, keeping its shape; made bigger than it is only when asked (a slide, not a page). */
export function fit(p: { width: number; height: number }, maxW: number, maxH: number, grow = false): { width: number; height: number } {
  const scale = Math.min(grow ? Infinity : 1, maxW / (p.width || 1), maxH / (p.height || 1));
  return { width: Math.max(1, Math.round(p.width * scale)), height: Math.max(1, Math.round(p.height * scale)) };
}

/** A picture as a data: address, for the preview page. */
export const dataUri = (buf: Buffer) => `data:${picture(buf).mime};base64,${buf.toString('base64')}`;
