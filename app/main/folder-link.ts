import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SEEN } from '../shared/pictures';
import { listFolder } from './commission';
import { readDocument } from './office/read';
import { isInside, reallyInside } from './paths';
import { SECRET_NAME } from './risk-classifier';

/**
 * A synced folder (OneDrive, Dropbox and the like) linked as a connection (road-to-1.3.md C5). The staff may list it two
 * levels deep, read a file in it, and save a copy of something the commission made into one subfolder of its own. Nothing
 * else: no deleting, renaming, moving or changing the user's files. The cloud account is never touched; syncing stays
 * with the folder's own program. Every refusal is a FolderLinkError, whose message is for Claude.
 */
export class FolderLinkError extends Error {}

/** One file read or copied in: the same limit as a file handed over. */
export const MAX_READ_BYTES = 20 * 1024 * 1024;
/** Text handed back as it is, cut here so one file cannot fill the round. */
const MAX_TEXT_CHARS = 200_000;
const TEXT = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.html', '.htm', '.xml', '.ics', '.log']);
const OFFICE = new Set(['.docx', '.xlsx', '.pptx']);
/** Copied into the commission folder for the Read tool, which shows PDFs and pictures. */
const FOR_READ = new Set(['.pdf', ...[...SEEN].map((e) => `.${e}`)]);

/** Hidden, or named like a key: never listed, never read. */
const offLimits = (name: string) => name.startsWith('.') || SECRET_NAME.test(name);

/** The listing the staff get: what listFolder gives, without names that look like keys. */
export const listLinked = (root: string) => listFolder(root, 2, 500, offLimits);

/** A path the staff name, made absolute: inside the folder once links are followed, and nothing on the way hidden or key-like. */
function linked(root: string, rel: string): string {
  const full = isAbsolute(rel) ? resolve(rel) : resolve(root, rel);
  if (!isInside(root, full) || !reallyInside(root, full)) throw new FolderLinkError(`${rel} is outside the connected folder.`);
  if (relative(root, full).split(sep).some(offLimits)) throw new FolderLinkError(`${rel} is hidden or looks like it holds a key, so it is not read.`);
  return full;
}

/** "name.ext", or "name (2).ext" and on while that is taken, in `dir`. */
function freeName(dir: string, name: string): string {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; existsSync(join(dir, candidate)); n++) candidate = `${stem} (${n})${ext}`;
  return candidate;
}

/**
 * One file of the folder: text as it is, a Word, Excel or PowerPoint file as its text, a PDF or a picture copied into
 * `copyDir` in the commission folder for the Read tool (its path there, relative, comes back).
 */
export function readLinked(root: string, rel: string, workDir: string, copyDir: string): { text: string } | { copied: string } {
  const full = linked(root, rel);
  const st = statSync(full, { throwIfNoEntry: false });
  if (!st?.isFile()) throw new FolderLinkError(`${rel} is not a file in the connected folder.`);
  if (st.size > MAX_READ_BYTES) throw new FolderLinkError(`${rel} is over 20 MB, too big to read.`);
  const ext = extname(full).toLowerCase();
  if (TEXT.has(ext)) {
    const text = readFileSync(full, 'utf8');
    return { text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n[cut here: the file goes on]` : text };
  }
  if (OFFICE.has(ext)) return { text: readDocument(full) };
  if (FOR_READ.has(ext)) {
    const dir = join(workDir, copyDir);
    mkdirSync(dir, { recursive: true });
    const name = freeName(dir, basename(full));
    copyFileSync(full, join(dir, name), constants.COPYFILE_EXCL);
    return { copied: `${copyDir}/${name}` };
  }
  throw new FolderLinkError(`${rel} is a kind of file the shop cannot read (${ext || 'no extension'}).`);
}

/**
 * A copy of a file the commission made, saved into the folder's own subfolder `saveTo`, under a free name: nothing there
 * is ever replaced. Returns where it went, which is all its undo may delete.
 */
export function saveCopy(root: string, saveTo: string, workDir: string, rel: string): string {
  const src = isAbsolute(rel) ? resolve(rel) : resolve(workDir, rel);
  if (!isInside(workDir, src) || !reallyInside(workDir, src)) throw new FolderLinkError(`${rel} is not in the commission folder; only what this commission made can be saved.`);
  if (!statSync(src, { throwIfNoEntry: false })?.isFile()) throw new FolderLinkError(`${rel} is not a file in the commission folder.`);
  const dir = join(root, saveTo);
  if (lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink() || !reallyInside(root, dir)) throw new FolderLinkError(`"${saveTo}" in the connected folder leads somewhere else, so nothing is saved.`);
  mkdirSync(dir, { recursive: true });
  for (;;) {
    const to = join(dir, freeName(dir, basename(src)));
    try {
      copyFileSync(src, to, constants.COPYFILE_EXCL);
      return to;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/** Undo a saved copy: only a file directly in the folder's own subfolder, and only that one. True once it is gone. */
export function undoCopy(root: string, saveTo: string, made: string): boolean {
  const dir = resolve(root, saveTo);
  const file = resolve(made);
  if (dirname(file) !== dir || !reallyInside(dir, file) || !lstatSync(file, { throwIfNoEntry: false })?.isFile()) return false;
  rmSync(file);
  return true;
}
