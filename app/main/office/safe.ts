import { readFileSync } from 'node:fs';
import { formulaProblem } from './formula';
import { readZip } from './unzip';
import { children, parseXml } from './xml';

export type OfficeVerdict = { ok: true } | { ok: false; reason: 'macros' | 'embedded' | 'externalTemplate' | 'externalLink' | 'unreadable' };

/** Embedded objects and controls: each is a program of its own that Office may start, whether it is kept inside or not. */
const EMBEDDED_PART = /(^|\/)(embeddings|activeX)\/|oleObject\d*\.bin$/i;
const EMBEDDED_REL = /\/(oleObject|package|control|activeXControlBinary)$/;
/** Word fields that fetch a file or a picture when the document opens or updates, or start another program (DDE). */
const REACHING_FIELD = /\b(DDE|DDEAUTO|INCLUDEPICTURE|INCLUDETEXT|INCLUDE|LINK|IMPORT)\b/i;

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

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
    for (const name of names.filter((n) => /^word\/[^/]+\.xml$/i.test(n))) {
      const xml = text(name);
      const codes = [...xml.matchAll(/<w:instrText[^>]*>([^<]*)</g)].map((m) => m[1]).join('')
        + [...xml.matchAll(/w:instr="([^"]*)"/g)].map((m) => ` ${m[1]} `).join('');
      if (REACHING_FIELD.test(unescape(codes))) link = true;
    }
    for (const name of names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n))) {
      if ([...text(name).matchAll(/<f(?:\s[^>]*)?>([^<]*)<\/f>/g)].some((m) => formulaProblem(unescape(m[1]), true))) link = true;
    }
    return link ? { ok: false, reason: 'externalLink' } : { ok: true };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
