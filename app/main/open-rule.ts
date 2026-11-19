import { readFileSync } from 'node:fs';
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

/** Lines with their folded continuations joined back, as both mail headers and calendar files fold them. */
const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

/**
 * Whether a mail or calendar file is as plain as the shop's own (road-to-1.3.md C5): a mail of one plain-text part, no
 * attachment and no page; an event that neither brings a file (ATTACH) nor starts a program (an alarm's PROCEDURE).
 * Undefined when it cannot be read.
 */
function plain(path: string, ext: string): boolean | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  if (ext === '.ics') {
    return !unfold(text).some((l) => /^ATTACH[;:]/i.test(l) || /^ACTION(;[^:]*)?:\s*PROCEDURE\b/i.test(l));
  }
  const head = unfold(text.split(/\r?\n\r?\n/)[0]);
  const type = head.find((l) => /^content-type\s*:/i.test(l));
  return !!type && /^content-type\s*:\s*text\/plain\b/i.test(type) && !head.some((l) => /^content-disposition\s*:/i.test(l));
}

/**
 * Whether a click opens the file or only shows it in its folder: the result card, the works shelf and an old version
 * all go by this. An Office file that failed the look inside says why, for the card.
 */
export function howToOpen(path: string): { open: true } | { open: false; why?: NotOpened } {
  const ext = extname(path).toLowerCase();
  if (!OPENABLE.has(ext)) return { open: false };
  if (ext === '.eml' || ext === '.ics') {
    const ok = plain(path, ext);
    return ok ? { open: true } : { open: false, why: ok === undefined ? 'unreadable' : 'notPlain' };
  }
  if (!OFFICE.has(ext)) return { open: true };
  const look = officeSafe(path);
  return look.ok ? { open: true } : { open: false, why: look.reason };
}
