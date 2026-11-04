import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// The handwriting font is cut down to the characters we use (scripts/art/font.py). A character it lacks falls back
// to the system's KaiTi, so one sentence shows two different hands. Rebuild the font when this fails.

const ROOT = resolve(__dirname, '..');
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** The code points a WOFF2 font has glyphs for, read from its cmap table (formats 4 and 12). */
function fontCodePoints(file: string): Set<number> {
  const woff = readFileSync(file);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (;;) {
      const byte = woff[at++];
      value = value * 128 + (byte & 127);
      if (!(byte & 128)) return value;
    }
  };
  const tables: { tag: string; length: number }[] = [];
  for (let i = woff.readUInt16BE(12); i > 0; i--) {
    const flags = woff[at++];
    let tag = KNOWN_TAGS[flags & 63];
    if ((flags & 63) === 63) {
      tag = woff.toString('latin1', at, at + 4);
      at += 4;
    }
    const version = flags >> 6;
    const original = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : original });
  }
  const data = brotliDecompressSync(woff.subarray(at));
  let cmap = 0;
  let offset = 0;
  for (const t of tables) {
    if (t.tag === 'cmap') cmap = offset;
    offset += t.length;
  }
  const points = new Set<number>();
  for (let i = 0; i < data.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + data.readUInt32BE(cmap + 8 + i * 8);
    const format = data.readUInt16BE(sub);
    if (format === 12) {
      for (let g = 0; g < data.readUInt32BE(sub + 12); g++) {
        const end = data.readUInt32BE(sub + 20 + g * 12);
        for (let c = data.readUInt32BE(sub + 16 + g * 12); c <= end; c++) points.add(c);
      }
    } else if (format === 4) {
      const segments = data.readUInt16BE(sub + 6) / 2;
      for (let s = 0; s < segments; s++) {
        const end = data.readUInt16BE(sub + 14 + s * 2);
        const start = data.readUInt16BE(sub + 16 + segments * 2 + s * 2);
        for (let c = start; c <= end && c < 0xffff; c++) points.add(c);
      }
    }
  }
  return points;
}

const isHan = (c: string) => /\p{Script=Han}/u.test(c);
const have = fontCodePoints(join(ROOT, 'assets', 'fonts', 'hand.woff2'));
const missing = (text: string) => [...new Set(text)].filter((c) => isHan(c) && !have.has(c.codePointAt(0)!)).join('');

describe('the handwriting font', () => {
  it('has every Chinese character in the interface text', () => {
    expect(missing(readFileSync(join(ROOT, 'locales', 'zh-CN.json'), 'utf8'))).toBe('');
  });

  it('has every Chinese character in the staff lines', () => {
    const dir = join(ROOT, 'lines');
    const files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
    expect(files.length).toBeGreaterThan(0);
    expect(missing(files.map((f) => readFileSync(join(dir, f), 'utf8')).join(''))).toBe('');
  });

  it('has the common characters, for what Claude writes on the plan', () => {
    // Text we cannot list in advance: the plan on the blackboard card, in whatever words Claude picks.
    expect(missing('阳台种番茄游泳换气退租房东秋天出游相册配色布局账单预算旅行菜谱简历毕业论文邻居搬家')).toBe('');
  });
});
