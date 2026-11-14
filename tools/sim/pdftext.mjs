// Reads back the PDFs the shop makes (Chromium's printToPDF, written by Skia), for the acceptance scenarios: how many
// pages, and the words on them. Not a general PDF reader: no object streams, no encryption, no layout, which Skia's
// output does not use. Text is shown as glyph numbers, so each font's ToUnicode map turns them back into letters.
import { inflateSync } from 'node:zlib';

/** Every object in the file: number -> { dict, stream } (the stream inflated when it is compressed). */
function objects(pdf) {
  const text = pdf.toString('latin1');
  const out = new Map();
  for (const m of text.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const body = m[2];
    const at = body.search(/stream\r?\n/);
    if (at < 0) { out.set(Number(m[1]), { dict: body, stream: null }); continue; }
    const dict = body.slice(0, at);
    const start = at + body.slice(at).indexOf('\n') + 1;
    let raw = Buffer.from(body.slice(start, body.lastIndexOf('endstream')), 'latin1');
    if (raw.at(-1) === 0x0a) raw = raw.subarray(0, raw.at(-2) === 0x0d ? -2 : -1);
    out.set(Number(m[1]), { dict, stream: /\/FlateDecode/.test(dict) ? inflateSync(raw) : raw });
  }
  return out;
}

const hexText = (hex) => Buffer.from(hex.length % 4 ? `00${hex}` : hex, 'hex').swap16().toString('utf16le');

/** A ToUnicode map: glyph code (hex, upper case) -> text, and how many hex digits a code has. */
function cmap(stream) {
  const s = stream.toString('latin1');
  const map = new Map();
  let width = 4;
  for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      width = src.length;
      map.set(src.toUpperCase(), hexText(dst));
    }
  }
  for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      width = lo.length;
      const first = parseInt(dst, 16);
      for (let c = parseInt(lo, 16); c <= parseInt(hi, 16); c++) {
        map.set(c.toString(16).toUpperCase().padStart(lo.length, '0'), hexText((first + c - parseInt(lo, 16)).toString(16).padStart(dst.length, '0')));
      }
    }
  }
  return { map, width };
}

/**
 * Whether the PDF's text says this, spaces aside. A font may map a character's glyph back to a look-alike radical: 小 to
 * U+2F29, which NFKC folds back, or 页 to U+2EDA, which nothing folds back, so a radical stands for any Han character.
 */
export function pdfSays(text, phrase) {
  const plain = (s) => s.normalize('NFKC').replace(/\s+/g, '');
  const pattern = [...plain(phrase)].map((c) => (/\p{Script=Han}/u.test(c) ? `[${c}\\u2E80-\\u2EFF]` : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(pattern, 'u').test(plain(text));
}

/** Pages and their text, in order. */
export function readPdf(pdf) {
  const objs = objects(pdf);
  const dictOf = (ref) => objs.get(Number(ref))?.dict ?? '';
  const pages = [...objs.values()].filter((o) => /\/Type \/Page\b(?!s)/.test(o.dict));
  const texts = pages.map((page) => {
    const resources = /\/Resources (\d+) 0 R/.exec(page.dict)?.[1];
    const res = resources ? dictOf(resources) : page.dict;
    const fontBlock = /\/Font\s*(?:<<([\s\S]*?)>>|(\d+) 0 R)/.exec(res);
    const fontDict = fontBlock?.[1] ?? dictOf(fontBlock?.[2]);
    const fonts = new Map();
    for (const [, name, ref] of fontDict.matchAll(/\/(\S+?)\s+(\d+) 0 R/g)) {
      const to = /\/ToUnicode (\d+) 0 R/.exec(dictOf(ref))?.[1];
      if (to) fonts.set(name, cmap(objs.get(Number(to)).stream));
    }
    const contents = /\/Contents\s*(?:\[([^\]]*)\]|(\d+) 0 R)/.exec(page.dict);
    const refs = contents[1] ? [...contents[1].matchAll(/(\d+) 0 R/g)].map((m) => m[1]) : [contents[2]];
    let font = null;
    let out = '';
    for (const ref of refs) {
      const ops = objs.get(Number(ref)).stream.toString('latin1');
      for (const m of ops.matchAll(/\/(\S+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>|\bET\b/g)) {
        if (m[1]) font = fonts.get(m[1]) ?? null;
        else if (m[2] !== undefined && font) for (let i = 0; i < m[2].length; i += font.width) out += font.map.get(m[2].slice(i, i + font.width).toUpperCase()) ?? '';
        else if (m[0] === 'ET') out += ' ';
      }
    }
    return out;
  });
  return { pages: pages.length, text: texts.join('\n') };
}
