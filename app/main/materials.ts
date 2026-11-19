import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { strings } from '../shared/i18n';
import { cannotOpen, needsPng } from '../shared/pictures';
import type { HandOver, Material } from '../shared/types';

/** How much can be handed over with one commission (plan.md S2). */
export const MAX_MATERIALS = 10;
export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
export const MAX_MATERIALS_TOTAL = 50 * 1024 * 1024;

/** The folder inside the commission folder where copies of what was handed over go. */
export const materialsDir = () => strings.ui.files.materials;

/**
 * Sort what the user dropped or picked into what can be handed over and what can't, and why.
 * `already` is what the form holds so far, so the limits count the whole pile.
 */
export function sortHandOver(paths: string[], already: Material[] = []): HandOver {
  const items: Material[] = [];
  const refused: HandOver['refused'] = [];
  let count = already.length;
  let total = already.reduce((n, m) => n + m.size, 0);
  const seen = new Set(already.map((m) => m.path));
  for (const path of paths) {
    const name = basename(path);
    if (seen.has(path)) continue;
    let st;
    try { st = statSync(path); } catch { refused.push({ name, why: 'missing' }); continue; }
    if (st.isDirectory()) { refused.push({ name, why: 'folder' }); continue; }
    if (!st.isFile()) { refused.push({ name, why: 'missing' }); continue; }
    if (cannotOpen(name)) { refused.push({ name, why: 'picture' }); continue; }
    if (st.size > MAX_MATERIAL_BYTES) { refused.push({ name, why: 'too-big' }); continue; }
    if (count >= MAX_MATERIALS) { refused.push({ name, why: 'too-many' }); continue; }
    if (total + st.size > MAX_MATERIALS_TOTAL) { refused.push({ name, why: 'too-big' }); continue; }
    seen.add(path);
    count++;
    total += st.size;
    items.push({ path, name, size: st.size });
  }
  return { items, refused };
}

/** File names the copies get: the original names, with "name (2).ext" when two are called the same. */
export function materialNames(paths: string[]): string[] {
  const used = new Set<string>();
  return paths.map((p) => {
    const name = basename(p);
    const ext = extname(name);
    const stem = name.slice(0, name.length - ext.length);
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * The PNG copies pictures Claude can't look at get (road-to-1.3.md C2): "<stem>.png" beside the copy, numbered like
 * materialNames when that name is taken. Pairs of [copy, its PNG].
 */
export function pngCopies(names: string[]): [string, string][] {
  const used = new Set(names.map((n) => n.toLowerCase()));
  return names.filter(needsPng).map((name) => {
    const stem = name.slice(0, name.length - extname(name).length);
    let candidate = `${stem}.png`;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n}).png`;
    used.add(candidate.toLowerCase());
    return [name, candidate];
  });
}

/** Turns one picture into a PNG at `to` (print.ts pictureToPng in the app). */
export type ToPng = (from: string, to: string) => Promise<void>;

/**
 * Copy what was handed over into the commission folder; the originals are never touched. A picture Claude can't look at
 * also gets a PNG copy beside it. Returns the copies' names.
 */
export async function copyMaterials(workDir: string, paths: string[], toPng?: ToPng): Promise<string[]> {
  if (!paths.length) return [];
  const dir = join(workDir, materialsDir());
  mkdirSync(dir, { recursive: true });
  const names = materialNames(paths);
  paths.forEach((p, i) => copyFileSync(p, join(dir, names[i])));
  if (!toPng) return names;
  for (const [from, to] of pngCopies(names)) {
    // A picture Chromium can't decode after all gets no copy; the prompt has the staff say so.
    try {
      await toPng(join(dir, from), join(dir, to));
    } catch {
      continue;
    }
  }
  return names;
}

/** What the prompt says about the materials. */
export function materialsSteps(paths: string[] | undefined): string[] {
  if (!paths?.length) return [];
  const all = materialNames(paths);
  const names = all.map((n) => `"${n}"`).join(', ');
  const copies = pngCopies(all).map(([from, to]) => `"${from}" is in "${to}"`).join(', ');
  return [
    `The user handed over some material for this. Copies are in the folder "${materialsDir()}": ${names}.`,
    'Look at them before you start (images too) and use them for what the user asked.',
    ...(copies ? [`Some pictures are in a format you can't look at, so each has a PNG copy beside it; look at that instead: ${copies}. If one of those copies is missing, that picture could not be opened: say so in your reply.`] : []),
    `Do not change, move or delete anything in "${materialsDir()}"; put what you make next to that folder, not inside it.`,
  ];
}
