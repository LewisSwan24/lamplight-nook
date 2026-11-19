import { extname } from 'node:path';
import type { NotOpened } from '../shared/types';
import { officeSafe } from './office/safe';

/**
 * Kinds of file the shop opens with a click. The staff write files, and a page or a file they read could talk
 * them into writing a program, a script or a shortcut; opening that would run it. Anything else is shown in
 * its folder instead, for the user to decide. Word, Excel and PowerPoint files come in only in their kinds without
 * macros, never .docm, .xlsm or .pptm (road-to-1.3.md C1).
 */
const OPENABLE = new Set(['.html', '.htm', '.md', '.txt', '.csv', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.xlsx', '.pptx', '.eml', '.ics']);
/** Office opens these and runs what they bring, so each is looked inside first. */
const OFFICE = new Set(['.docx', '.xlsx', '.pptx']);

/**
 * Whether a click opens the file or only shows it in its folder: the result card, the works shelf and an old version
 * all go by this. An Office file that failed the look inside says why, for the card.
 */
export function howToOpen(path: string): { open: true } | { open: false; why?: NotOpened } {
  const ext = extname(path).toLowerCase();
  if (!OPENABLE.has(ext)) return { open: false };
  if (!OFFICE.has(ext)) return { open: true };
  const look = officeSafe(path);
  return look.ok ? { open: true } : { open: false, why: look.reason };
}
