import { readFileSync } from 'node:fs';
import { formulaProblem } from './formula';
import { readZip } from './unzip';
import { children, findAll, ownText, parseXml } from './xml';

export type OfficeVerdict = { ok: true } | { ok: false; reason: 'macros' | 'embedded' | 'externalTemplate' | 'externalLink' | 'unreadable' };

/** Embedded objects and controls: each is a program of its own that Office may start, whether it is kept inside or not. */
const EMBEDDED_PART = /(^|\/)(embeddings|activeX)\/|oleObject\d*\.bin$/i;
const EMBEDDED_REL = /\/(oleObject|package|control|activeXControlBinary)$/;
/** Word fields that fetch a file or a picture when the document opens or updates, or start another program (DDE). */
const REACHING_FIELD = /\b(DDE|DDEAUTO|INCLUDEPICTURE|INCLUDETEXT|INCLUDE|LINK|IMPORT)\b/i;

/** Where a workbook keeps formulas: cells, defined names, data validation and conditional formats, chart series. */
const FORMULAS = ['f', 'definedName', 'formula', 'formula1', 'formula2'];

/**
 * A look inside an Office package before the app opens it with a click (road-to-1.3.md C1). Opening runs whatever the
 * file brings, so it is opened only when it carries no macros, no embedded objects or controls, and reaches nothing
 * outside itself except plain web links, which Office asks about before following. That covers relationships, Word fields
 * (whose codes may be split over several runs, so a part's are read together) and workbook formulas. Anything else, the
 * file is only shown in its folder.
 */
export function officeSafe(file: string): OfficeVerdict {
  try {
    const zip = readZip(readFileSync(file));
    const names = [...zip.keys()];
    const text = (name: string) => zip.get(name)!().toString('utf8');
    if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n))) return { ok: false, reason: 'macros' };
    if (/macroEnabled/i.test(zip.has('[Content_Types].xml') ? text('[Content_Types].xml') : '')) return { ok: false, reason: 'macros' };
    if (names.some((n) => EMBEDDED_PART.test(n))) return { ok: false, reason: 'embedded' };
    let link = names.some((n) => /^xl\/externalLinks\//i.test(n));
    for (const name of names.filter((n) => n.toLowerCase().endsWith('.rels'))) {
      for (const r of parseXml(text(name)).kids.flatMap((k) => (typeof k === 'string' ? [] : children(k, 'Relationship')))) {
        const type = r.attrs.Type ?? '';
        if (r.attrs.TargetMode?.toLowerCase() !== 'external') {
          if (EMBEDDED_REL.test(type)) return { ok: false, reason: 'embedded' };
          continue;
        }
        if (type.endsWith('/hyperlink')) continue;
        if (type.endsWith('/attachedTemplate')) return { ok: false, reason: 'externalTemplate' };
        link = true;
      }
    }
    // Every XML part, wherever it sits and whatever prefix it uses, through the same parser Office's own would agree with
    // (character references, CDATA): a field in a header or a formula behind &#87; must not slip past a pattern.
    for (const name of names.filter((n) => /\.xml$/i.test(n) && n !== '[Content_Types].xml')) {
      const root = parseXml(text(name));
      const codes = findAll(root, 'instrText').map(ownText).join('') + findAll(root, 'fldSimple').map((e) => ` ${e.attrs.instr ?? ''} `).join('');
      if (REACHING_FIELD.test(codes)) link = true;
      for (const el of FORMULAS.flatMap((f) => findAll(root, f))) if (formulaProblem(ownText(el), true)) link = true;
    }
    return link ? { ok: false, reason: 'externalLink' } : { ok: true };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
