import { readFileSync } from 'node:fs';
import { formulaProblem } from './formula';
import { readZip } from './unzip';
import { decode, elements, parseXml, type El } from './xml';

export type OfficeVerdict = { ok: true } | { ok: false; reason: 'macros' | 'embedded' | 'externalTemplate' | 'externalLink' | 'unreadable' };

/** Embedded objects and controls: each is a program of its own that Office may start, whether it is kept inside or not. */
const EMBEDDED_PART = /(^|\/)(embeddings|activeX)\/|oleObject\d*\.bin$/i;
const EMBEDDED_REL = /\/(oleObject|package|control|activeXControlBinary|aFChunk)$/i;
/** Formats Word imports whole (altChunk), with field codes of their own this check does not read. */
const IMPORTED_TYPE = /(text\/html|application\/xhtml\+xml|application\/rtf|text\/rtf|message\/rfc822|multipart\/related)/i;
/**
 * The binary parts Office keeps that are not pictures or sounds: printer settings and embedded fonts, opaque blobs it
 * does not read as text. Pictures and sounds pass by their bytes wherever they sit, the media folder included, so a part
 * there that is something else is not let through by its place.
 */
const BINARY_PART = /(^|\/)printerSettings\d*\.bin$|(^|\/)fonts\/[^/]+\.(odttf|fntdata)$/i;

/** Whether the bytes are a picture (PNG, JPEG, GIF, BMP, TIFF, EMF, WMF) or a sound or video, wherever the part sits. */
function isMedia(b: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  return starts(0x89, 0x50, 0x4e, 0x47) || starts(0xff, 0xd8, 0xff) || starts(0x47, 0x49, 0x46, 0x38) || starts(0x42, 0x4d)
    || starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a) || starts(0xd7, 0xcd, 0xc6, 0x9a)
    || (starts(0x01, 0x00, 0x00, 0x00) && b.toString('latin1', 40, 44) === ' EMF') || starts(0x01, 0x00, 0x09, 0x00) || starts(0x02, 0x00, 0x09, 0x00)
    // Sound and video: RIFF (WAV, AVI), MP3, MP4 and M4A, ASF (WMA, WMV), Ogg.
    || starts(0x52, 0x49, 0x46, 0x46) || starts(0x49, 0x44, 0x33) || starts(0xff, 0xfb) || b.toString('latin1', 4, 8) === 'ftyp'
    || starts(0x30, 0x26, 0xb2, 0x75) || starts(0x4f, 0x67, 0x67, 0x53);
}
/** Word fields that fetch a file or a picture when the document opens or updates, or start another program (DDE). */
const REACHING_FIELD = /\b(DDE|DDEAUTO|INCLUDEPICTURE|INCLUDETEXT|INCLUDE|LINK|IMPORT)\b/i;

/** Where field codes and formulas are kept, under any prefix: Word's field code runs, and a workbook's cells, defined
 * names, data validation, conditional formats and chart series. */
const FIELD_TAG = 'instrText';
const FORMULA_TAG = '(?:f|definedName|formula|formula1|formula2)';
/** A simple field's code, as an attribute under any prefix: every one counts, so a second one cannot stand in for it. */
const INSTR_ATTR = /[\s'"](?:[\w.-]+:)?instr\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

class Unreadable extends Error {}

/**
 * XML in a wide encoding with no mark this check reads (UTF-16 big-endian, UTF-32): its first bytes hold zeros and, with
 * them dropped, start with a tag. An XML reader finds such a part by those bytes, so it is not passed over as a picture.
 * A real picture that starts with zero bytes (EMF does) does not start with a tag once they are dropped.
 */
function looksWideXml(buf: Buffer): boolean {
  const head = buf.subarray(0, 64);
  if (!head.includes(0)) return false;
  const bytes = [...head].filter((b) => b !== 0);
  let i = 0;
  while (i < bytes.length && [0xfe, 0xff, 0x09, 0x0a, 0x0d, 0x20].includes(bytes[i])) i++;
  return bytes[i] === 0x3c;
}

/**
 * A part's text as Office reads it: UTF-16 little-endian with its byte order mark, otherwise UTF-8. When the encoding the
 * part declares is not the one its bytes are read in, or it holds a NUL (UTF-16 without its mark reads that way), Office
 * could see other text than this check does, so the file is not trusted. Big-endian UTF-16 is refused: Office writes none.
 */
function partText(buf: Buffer): string {
  const wide = buf[0] === 0xff && buf[1] === 0xfe;
  if (buf[0] === 0xfe && buf[1] === 0xff) throw new Unreadable();
  if (!wide && looksWideXml(buf)) throw new Unreadable();
  const text = wide ? buf.subarray(2).toString('utf16le') : (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf).toString('utf8');
  // Read as UTF-16, a NUL anywhere means it is not (UTF-32 starts FF FE 00 00), so it is not passed over as a picture.
  if (wide && text.includes('\0')) throw new Unreadable();
  if (!/^\s*</.test(text)) return text;
  if (text.includes('\0')) throw new Unreadable();
  const declared = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([^"']*)["']/i.exec(text)?.[1].toLowerCase();
  if (declared && declared !== (wide ? 'utf-16' : 'utf-8')) throw new Unreadable();
  return text;
}

/**
 * The text of every element called `name` (under any prefix), references decoded and CDATA unwrapped. Each opening tag
 * is read to its real end, attribute values in quotes and all; one that cannot be read that way (a < or > in a value, or
 * anything else odd) makes the file untrusted rather than read past. A field code or a formula holds only text; an
 * element or a comment inside one is nothing Office writes either.
 */
function contents(text: string, name: string): string[] {
  const out: string[] = [];
  const tag = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s+[\\w.:-]+\\s*=\\s*(?:"[^"<>]*"|'[^'<>]*'))*\\s*(/?)>`, 'y');
  for (const m of text.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}(?=[\\s/>])`, 'g'))) {
    tag.lastIndex = m.index;
    const open = tag.exec(text);
    if (!open) throw new Unreadable();
    if (open[1]) continue;
    let at = tag.lastIndex;
    let s = '';
    for (;;) {
      const lt = text.indexOf('<', at);
      if (lt < 0) throw new Unreadable();
      s += decode(text.slice(at, lt));
      if (text.startsWith('</', lt)) break;
      if (!text.startsWith('<![CDATA[', lt)) throw new Unreadable();
      const end = text.indexOf(']]>', lt);
      if (end < 0) throw new Unreadable();
      s += text.slice(lt + 9, end);
      at = end + 3;
    }
    out.push(s);
  }
  return out;
}

const everyElement = (el: El): El[] => elements(el).flatMap((k) => [k, ...everyElement(k)]);

/**
 * A look inside an Office package before the app opens it with a click (road-to-1.3.md C1). Opening runs whatever the
 * file brings, so it is opened only when it carries no macros, no embedded objects or controls, and reaches nothing
 * outside itself except plain web links, which Office asks about before following.
 *
 * The check is deliberately blunt, because a check that reads a file differently from Office can be steered round:
 * every part that is text starting with a tag is looked at, whatever it is called; field codes and formulas are found by
 * pattern under any prefix and nested at any depth, read together per part (a code may be split over several runs);
 * every `instr` attribute counts; and anything Office would not write itself (a DTD, an element inside a formula, two
 * attributes that differ only in prefix on a relationship) makes the file unreadable rather than guessed at. Anything
 * not opened is shown in its folder instead.
 */
export function officeSafe(file: string): OfficeVerdict {
  try {
    const zip = readZip(readFileSync(file));
    const names = [...zip.keys()];
    if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n))) return { ok: false, reason: 'macros' };
    if (names.some((n) => EMBEDDED_PART.test(n))) return { ok: false, reason: 'embedded' };
    let macros = false;
    let embedded = false;
    let template = false;
    // A part that is neither XML nor a binary part Office keeps: decided after embedded content, which names it better.
    let stray = false;
    let link = names.some((n) => /^xl\/externalLinks\//i.test(n));
    for (const name of names) {
      const bytes = zip.get(name)!();
      const text = partText(bytes);
      // Not XML: only the binary parts Office keeps, or a picture. Anything else may be read by Office in a way this is not.
      if (!/^\s*</.test(text)) {
        if (!(bytes.length === 0 || BINARY_PART.test(name) || isMedia(bytes))) stray = true;
        continue;
      }
      if (name === '[Content_Types].xml' && IMPORTED_TYPE.test(decode(text))) embedded = true;
      if (/<!(DOCTYPE|ENTITY)/i.test(text)) throw new Unreadable();
      if (name === '[Content_Types].xml' && /macroEnabled/i.test(text)) macros = true;
      if (name.toLowerCase().endsWith('.rels')) {
        for (const r of everyElement(parseXml(text))) {
          if (r.clash) throw new Unreadable();
          if (r.name !== 'Relationship') continue;
          const type = r.attrs.Type ?? '';
          if (r.attrs.TargetMode?.toLowerCase() !== 'external') {
            if (EMBEDDED_REL.test(type)) embedded = true;
          } else if (/\/attachedTemplate$/i.test(type)) template = true;
          else if (!type.endsWith('/hyperlink')) link = true;
        }
      }
      const codes = contents(text, FIELD_TAG).join('') + [...text.matchAll(INSTR_ATTR)].map((m) => ` ${decode(m[1] ?? m[2])} `).join('');
      if (REACHING_FIELD.test(codes)) link = true;
      if (contents(text, FORMULA_TAG).some((f) => formulaProblem(f, true))) link = true;
    }
    if (macros) return { ok: false, reason: 'macros' };
    if (embedded) return { ok: false, reason: 'embedded' };
    if (stray) return { ok: false, reason: 'unreadable' };
    if (template) return { ok: false, reason: 'externalTemplate' };
    return link ? { ok: false, reason: 'externalLink' } : { ok: true };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
