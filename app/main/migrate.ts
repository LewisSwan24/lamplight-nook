import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { grownBy } from '../shared/growth';
import { shortTitle } from './commission';
import { LOCALES } from '../shared/i18n';
import { localDay } from '../shared/localday';
import { readable } from './memory';
import { addProjects } from './projects';
import type { CommissionMemo, GuestId, Memory, Project } from '../shared/types';

/**
 * The shape of the app's data folder. Bump it with a new step in STEPS whenever stored data changes shape.
 * 1: everything up to 0.8.1 (no marker file).
 * 2: the marker exists; the shop has counted commissions finished before 0.7, old notebook entries
 *    know their main piece of work, and English titles from before 0.8.1 read as words.
 * 3: a shop that was already open counts every neighbour as known, so none is met for the first time on upgrade day.
 * 4: every commission is a project of one (1.2, road-to-1.2.md B1). The notebook does the same again whenever it opens,
 *    for a notebook saved by an older version since.
 */
export const DATA_VERSION = 4;
// A step that changes memory.json has to change memory.last-good.json the same way: that copy can take its place later.
const MARKER = 'data-version.json';
/** Data files copied aside before a migration touches anything. */
const BACKED_UP = ['settings.json', 'memory.json', 'spend.json', 'pending.json'];

/**
 * Copy the data files to backup/<date>-<label>/ (an upgrade's own copy, or the one before a new version goes in).
 * The folder they went to, or undefined when there were none to copy. Throws when they cannot be copied.
 */
export function backUp(dir: string, label: string, now = new Date()): string | undefined {
  const present = BACKED_UP.filter((f) => existsSync(join(dir, f)));
  if (!present.length) return undefined;
  const to = join(dir, 'backup', `${localDay(now)}-${label}`);
  mkdirSync(to, { recursive: true });
  for (const f of present) copyFileSync(join(dir, f), join(to, f));
  return to;
}

export type MigrationResult ={ from: number; to: number; backup?: string; changes: string[] };

type Step = (dir: string, now: Date) => string[];

const STEPS: Record<number, Step> = {
  // 1 -> 2
  2: (dir, now) => {
    const file = join(dir, 'memory.json');
    const memory = readJson<Memory>(file);
    if (!memory || !Array.isArray(memory.commissions)) return [];
    const changes = [...countEarlierWork(memory, now), ...findMainWork(memory), ...readableTitles(memory)];
    if (changes.length) writeJson(file, memory);
    return changes;
  },
  // 2 -> 3
  3: (dir) => {
    const file = join(dir, 'memory.json');
    const memory = readJson<Memory>(file);
    if (!memory?.shop || memory.shop.met) return [];
    const neighbours = Object.keys(Object.values(LOCALES)[0].guests) as GuestId[];
    memory.shop.met = neighbours.map((id) => ({ id, date: '' }));
    writeJson(file, memory);
    return ['neighbours counted as known'];
  },
  // 3 -> 4
  4: (dir) => {
    const changes: string[] = [];
    for (const name of ['memory.json', 'memory.last-good.json']) {
      const file = join(dir, name);
      const memory = readJson<Omit<Memory, 'projects'> & { projects?: Project[] }>(file);
      if (!memory || !Array.isArray(memory.commissions)) continue;
      const notebook = { commissions: memory.commissions.filter(readable), projects: memory.projects ?? [] };
      const added = addProjects(notebook);
      if (!added.length) continue;
      memory.projects = notebook.projects;
      writeJson(file, memory);
      changes.push(`${name}: ${added.length} projects`);
    }
    return changes;
  },
};

/**
 * Bring the data folder up to DATA_VERSION before any store reads it. The data files are copied to
 * backup/<date>-v<from>/ first; a folder without any data (a first start) is only marked.
 * Never throws: a step that fails leaves its files as they were and the next start tries again.
 */
export function migrate(dir: string, now = new Date()): MigrationResult {
  const from = readJson<{ data?: number }>(join(dir, MARKER))?.data ?? 1;
  if (from >= DATA_VERSION) return { from, to: from, changes: [] };
  let backup: string | undefined;
  try {
    mkdirSync(dir, { recursive: true });
    backup = backUp(dir, `v${from}`, now);
  } catch (err) {
    // Without a copy aside, nothing is changed.
    return { from, to: from, changes: [`not migrated, no backup: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const changes: string[] = [];
  let at = from;
  try {
    for (let v = from + 1; v <= DATA_VERSION; v++) {
      changes.push(...(STEPS[v]?.(dir, now) ?? []));
      at = v;
    }
  } catch (err) {
    changes.push(`stopped at version ${at}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    if (at > from) writeJson(join(dir, MARKER), { data: at });
  } catch (err) {
    changes.push(`marker not written: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { from, to: at, backup, changes };
}

/**
 * Before 0.7 the shop did not count finished commissions, and 0.7 started counting from zero, so a shop
 * used since 0.5 or 0.6 grew less than it should have. The notebook keeps its last 20 commissions, so the
 * finished ones there are a floor for the count; what the shop gathers by that count is added, dated today.
 */
function countEarlierWork(memory: Memory, now: Date): string[] {
  const finished = memory.commissions.filter((c) => c && c.result === 'done').length;
  const shop = memory.shop ?? { done: 0, grown: [], told: [] };
  if (finished <= shop.done) return [];
  const date = localDay(now);
  const have = new Set(shop.grown.map((g) => g.id));
  const added = grownBy(finished).filter((id) => !have.has(id));
  memory.shop = { ...shop, done: finished, grown: [...shop.grown, ...added.map((id) => ({ id, date }))] };
  return [`shop count ${shop.done} -> ${finished}${added.length ? `, gathered ${added.join(', ')}` : ''}`];
}

/** Names the shop itself put in a folder that are not the work: the check script, copies, lists, materials. */
function notWork(name: string): boolean {
  if (name === 'check.js' || name.startsWith('.')) return true;
  return Object.values(LOCALES).some((S) => {
    const F = S.ui.files;
    return name.startsWith(F.originalPrefix) || name === F.listing || name === F.materials;
  });
}

/**
 * Notebook entries from before 0.7 do not say which file is the work, so the works shelf could only open
 * their folder. Pick it the way the result card does: index.html, an edited document, any page, a write-up,
 * a table or a letter.
 */
function findMainWork(memory: Memory): string[] {
  const changes: string[] = [];
  for (const c of memory.commissions as CommissionMemo[]) {
    if (!c || c.result !== 'done' || c.main || typeof c.folder !== 'string' || !existsSync(c.folder)) continue;
    let names: string[];
    try {
      names = readdirSync(c.folder).filter((n) => !notWork(n) && statSync(join(c.folder, n)).isFile());
    } catch {
      continue;
    }
    const revised = Object.values(LOCALES).map((S) => S.ui.files.revisedPrefix);
    const main = names.find((n) => /^index\.html?$/i.test(n))
      ?? names.find((n) => revised.some((p) => n.startsWith(p)))
      ?? names.find((n) => /\.html?$/i.test(n))
      ?? names.find((n) => /\.md$/i.test(n))
      ?? names.find((n) => /\.(csv|txt)$/i.test(n));
    if (main) {
      c.main = basename(main);
      changes.push(`main work of ${c.id}: ${c.main}`);
    }
  }
  return changes;
}

/**
 * Before 0.8.1, English titles were cut at 16 characters with dashes for spaces ("Make-me-a-small-").
 * Entries that kept the request get a title made the current way; older ones get their spaces back.
 * Stuck notes are filed under the title, so they follow it.
 */
function readableTitles(memory: Memory): string[] {
  const changes: string[] = [];
  for (const c of memory.commissions as CommissionMemo[]) {
    if (!c || typeof c.title !== 'string' || !/^[\x21-\x7e]+$/.test(c.title) || !c.title.includes('-')) continue;
    const words = c.title.replace(/-+/g, ' ').trim();
    const title = typeof c.form?.want === 'string' && !c.form.demo ? shortTitle(c.form.want) : words && words[0].toUpperCase() + words.slice(1);
    if (!title || title === c.title) continue;
    for (const n of memory.stuckNotes ?? []) if (n.commission === c.title) n.commission = title;
    changes.push(`title of ${c.id}: ${c.title} -> ${title}`);
    c.title = title;
  }
  return changes;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${file}.tmp`, file);
}
