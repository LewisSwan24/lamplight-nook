import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { folderName } from './commission';
import { isInside, reallyInside } from './paths';
import { entriesIn } from './versions';
import type { ZipEntry } from './zip';

/**
 * What goes in a work's zip (road-to-1.1.md A8). A work in its own folder: every file there, subfolders too. One done
 * in a folder the user lent: only the files the commission changed or made (`touched`), never the rest of their
 * folder. Links are left out, so nothing from outside the folder can end up in the zip.
 */
export function workEntries(folder: string, touched?: string[]): ZipEntry[] {
  const files = touched
    // A touched file may be gone since (the user let the staff delete it), or sit behind a link made later.
    ? [...touched].sort().filter((rel) => lstatSync(join(folder, rel), { throwIfNoEntry: false })?.isFile() && reallyInside(folder, join(folder, rel)))
    : entriesIn(folder).filter((rel) => !rel.endsWith('/'));
  return files.map((rel) => ({ name: rel, data: readFileSync(join(folder, rel)) }));
}

/**
 * What the page being printed may load: files in the work's own folder once links are followed, and data written into
 * the page itself. Nothing from the network and no other file on the computer, so a PDF the user passes on cannot
 * carry anything but the work. A file on another computer (file://server/...) is refused before the disk is asked,
 * which would reach out to that computer.
 */
export function printMayLoad(folder: string, url: string): boolean {
  const u = new URL(url);
  if (u.protocol === 'data:') return true;
  if (u.protocol !== 'file:' || u.host) return false;
  const path = fileURLToPath(u);
  return isInside(folder, path) && reallyInside(folder, path);
}

/** The name the save dialog offers: the work's own, made safe the way its folder's was. */
export const exportName = (title: string, ext: 'zip' | 'pdf') => `${folderName(title)}.${ext}`;
