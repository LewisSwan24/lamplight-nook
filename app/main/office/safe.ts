import { readFileSync } from 'node:fs';
import { formulaProblem } from './formula';
import { readZip } from './unzip';
import { decode, elements, parseXml, type El } from './xml';

export type OfficeVerdict = { ok: true } | { ok: false; reason: 'macros' | 'embedded' | 'externalTemplate' | 'externalLink' | 'unreadable' };

/** Embedded objects and controls: each is a program of its own that Office may start, whether it is kept inside or not. */
const EMBEDDED_PART = /(^|\/)(embeddings|activeX)\/|oleObject\d*\.bin$/i;
const EMBEDDED_REL = /\/(oleObject|package|control|activeXControlBinary)$/;
/** Word fields that fetch a file or a picture when the document opens or updates, or start another program (DDE). */
const REACHING_FIELD = /\b(DDE|DDEAUTO|INCLUDEPICTURE|INCLUDETEXT|INCLUDE|LINK|IMPORT)\b/i;

/** Where field codes and formulas are kept, under any prefix: Word's field code runs, and a workbook's cells, defined
 * names, data validation, conditional formats and chart series. */
const FIELD_TAG = /<(?:[\w.-]+:)?instrText(?:\s[^>]*)?>/g;
const FORMULA_TAG = /<(?:[\w.-]+:)?(?:f|definedName|formula|formula1|formula2)(?:\s[^>]*)?>/g;
/** A simple field's code, as an attribute under any prefix: every one counts, so a second one cannot stand in for it. */
const INSTR_ATTR = /[\s'"](?:[\w.-]+:)?instr\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

class Unreadable extends Error {}

/** A part's text as Office reads it: UTF-8 or UTF-16 by its byte order mark. Big-endian UTF-16 is refused (Office writes none). */
function partText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) throw new Unreadable();
  return (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf).toString('utf8');
}

/**
 * The text of every element the pattern opens, references decoded and CDATA unwrapped. A field code or a formula holds
 * only text; an element or a comment inside one is nothing Office writes, so the file is not trusted.
 */
function contents(text: string, open: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(open)) {
    if (m[0].endsWith('/>')) continue;
    let at = m.index + m[0].length;
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
    let link = names.some((n) => /^xl\/externalLinks\//i.test(n));
    for (const name of names) {
      const text = partText(zip.get(name)!());
      if (!/^\s*</.test(text)) continue; // a picture or another binary part
      if (/<!(DOCTYPE|ENTITY)/i.test(text)) throw new Unreadable();
      if (name === '[Content_Types].xml' && /macroEnabled/i.test(text)) macros = true;
      if (name.toLowerCase().endsWith('.rels')) {
        for (const r of everyElement(parseXml(text))) {
          if (r.clash) throw new Unreadable();
          if (r.name !== 'Relationship') continue;
          const type = r.attrs.Type ?? '';
          if (r.attrs.TargetMode?.toLowerCase() !== 'external') {
            if (EMBEDDED_REL.test(type)) embedded = true;
          } else if (type.endsWith('/attachedTemplate')) template = true;
          else if (!type.endsWith('/hyperlink')) link = true;
        }
      }
      const codes = contents(text, FIELD_TAG).join('') + [...text.matchAll(INSTR_ATTR)].map((m) => ` ${decode(m[1] ?? m[2])} `).join('');
      if (REACHING_FIELD.test(codes)) link = true;
      if (contents(text, FORMULA_TAG).some((f) => formulaProblem(f, true))) link = true;
    }
    if (macros) return { ok: false, reason: 'macros' };
    if (embedded) return { ok: false, reason: 'embedded' };
    if (template) return { ok: false, reason: 'externalTemplate' };
    return link ? { ok: false, reason: 'externalLink' } : { ok: true };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
