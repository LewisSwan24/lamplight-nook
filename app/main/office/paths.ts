import { readFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { isInside, reallyInside } from '../paths';

/** The pictures a made file may take: the ones Word and PowerPoint show without help. */
const PICTURES = ['.png', '.jpg', '.jpeg', '.gif'];

/**
 * Where make_docx, make_xlsx or make_pptx may write (road-to-1.3.md C1): the rule Write has, inside the commission folder
 * once links are followed, and never over a file that was there before the round, so the user's own file is not
 * replaced by a made one. Reasons are for Claude, in English.
 */
export function outputPath(workDir: string, rel: string, ext: string, preexisting: Set<string>): string {
  const full = isAbsolute(rel) ? rel : resolve(workDir, rel);
  if (!isInside(workDir, full) || !reallyInside(workDir, full)) throw new Error(`${rel} is outside the commission folder; write inside it.`);
  if (extname(full).toLowerCase() !== ext) throw new Error(`${rel} must end in ${ext}.`);
  if (preexisting.has(full)) throw new Error(`${rel} was already there before this round; pick a new name rather than replace it.`);
  return full;
}

/** A picture for a made file, read from inside the commission folder only, by a path relative to it. */
export function imageFile(workDir: string, rel: string): Buffer {
  if (isAbsolute(rel)) throw new Error(`${rel}: give the picture as a relative path inside the commission folder.`);
  const full = resolve(workDir, rel);
  if (!isInside(workDir, full) || !reallyInside(workDir, full)) throw new Error(`${rel} is outside the commission folder; use a picture inside it.`);
  if (!PICTURES.includes(extname(full).toLowerCase())) throw new Error(`${rel}: pictures must be .png, .jpg, .jpeg or .gif.`);
  return readFileSync(full);
}
