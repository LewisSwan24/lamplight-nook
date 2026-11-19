import { readFileSync } from 'node:fs';
import { readZip } from './unzip';
import { children, parseXml } from './xml';

export type OfficeVerdict = { ok: true } | { ok: false; reason: 'macros' | 'externalTemplate' | 'externalLink' | 'unreadable' };

/**
 * A look inside an Office package before the app opens it with a click (road-to-1.3.md C1). Opening runs whatever the
 * file brings, so it is opened only when it carries no macros and reaches nothing outside itself except plain web links,
 * which Office asks about before following. Anything else, the file is only shown in its folder.
 */
export function officeSafe(file: string): OfficeVerdict {
  try {
    const zip = readZip(readFileSync(file));
    const names = [...zip.keys()];
    if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n))) return { ok: false, reason: 'macros' };
    const types = zip.get('[Content_Types].xml')?.().toString('utf8') ?? '';
    if (/macroEnabled/i.test(types)) return { ok: false, reason: 'macros' };
    let link = false;
    for (const name of names.filter((n) => n.toLowerCase().endsWith('.rels'))) {
      const root = parseXml(zip.get(name)!().toString('utf8'));
      for (const r of root.kids.flatMap((k) => (typeof k === 'string' ? [] : children(k, 'Relationship')))) {
        if (r.attrs.TargetMode?.toLowerCase() !== 'external') continue;
        const type = r.attrs.Type ?? '';
        if (type.endsWith('/hyperlink')) continue;
        if (type.endsWith('/attachedTemplate')) return { ok: false, reason: 'externalTemplate' };
        link = true;
      }
    }
    return link ? { ok: false, reason: 'externalLink' } : { ok: true };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
