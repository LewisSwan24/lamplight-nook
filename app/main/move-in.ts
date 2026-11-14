import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Memory, MoveOffer } from '../shared/types';

/**
 * The Microsoft Store build and the installer build on one computer (road-to-1.1.md A2).
 *
 * In an MSIX package Windows keeps the files an app creates under AppData in a private copy
 * (%LOCALAPPDATA%\Packages\<family>\LocalCache), removed on uninstall, while files that were already there are read
 * and changed in place. With the installer build's folder under the same name, the Store build would change some of
 * its files and shadow others with private copies whenever it writes a new file (every save writes one and renames
 * it), so neither build would see the whole shop and uninstalling would take part of it away. The Store build keeps
 * a folder of its own instead, and on its first open offers to copy the installer build's shop into it.
 */
export const STORE_DATA = 'Lamplight Nook Store';
export const storeDataDir = (appData: string): string => join(appData, STORE_DATA);

/** Any of these means a shop has been opened in the folder: the settings, the notebook (the works), the ledger. */
const SIGNS = ['settings.json', 'memory.json', 'spend.json'];
/**
 * What comes over. Not the key: it is encrypted with a key that lives in the other build's own browser data. Not
 * the unfinished commission, which stays with the build that started it. Not the logs, recordings or backups.
 */
const FILES = ['settings.json', 'memory.json', 'memory.last-good.json', 'spend.json', 'data-version.json'];
/** The kept versions of each work, for going back. */
const FOLDERS = ['versions'];
const MARKER = 'data-version.json';

const used = (dir: string) => SIGNS.some((f) => existsSync(join(dir, f)));

/** What the installer build's shop holds, when there is one to bring over and the Store build has none of its own. */
export function moveInOffer(from: string | undefined, to: string): MoveOffer | null {
  if (!from || !used(from) || used(to)) return null;
  const memory = readJson<Memory>(join(from, 'memory.json'));
  const spend = readJson<{ usd: number }[]>(join(from, 'spend.json'));
  return {
    works: memory?.commissions.filter((c) => c.result === 'done').length ?? 0,
    spentUsd: spend?.reduce((sum, e) => sum + e.usd, 0) ?? 0,
  };
}

/**
 * Copy the installer build's shop into the Store build's folder. The original is only read. Returns what was copied.
 * The data is brought up to date afterwards by migrate(), so the version mark must be the old folder's: a fresh
 * start marks an empty folder as current, and without the old mark that one would wrongly stand.
 */
export function moveIn(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const brought = FILES.filter((f) => existsSync(join(from, f)));
  for (const f of brought) copyFileSync(join(from, f), join(to, f));
  if (!brought.includes(MARKER)) rmSync(join(to, MARKER), { force: true });
  for (const d of FOLDERS.filter((d) => existsSync(join(from, d)))) {
    cpSync(join(from, d), join(to, d), { recursive: true });
    brought.push(d);
  }
  return brought;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}
