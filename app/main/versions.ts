import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { reallyInside } from './paths';

/** A copy bigger than this is not kept; the result card then offers no way back. */
export const MAX_VERSION_BYTES = 50 * 1024 * 1024;
/**
 * The biggest folder of the user's own the shop will work in (road-to-1.1.md A6). Any file in it could be changed,
 * and each one's original must fit here, so a bigger folder is refused before the work starts.
 */
export const MAX_LENT_BYTES = 100 * 1024 * 1024;

const MANIFEST = 'manifest.json';
const FILES = 'files';

/** Total size of a file or folder, giving up (Infinity) once it passes `limit`; links count as nothing. */
function sizeOf(path: string, limit: number): number {
  let total = 0;
  const walk = (p: string) => {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) return;
    if (st.isFile()) total += st.size;
    else if (st.isDirectory()) for (const name of readdirSync(p)) {
      walk(join(p, name));
      if (total > limit) return;
    }
  };
  walk(path);
  return total > limit ? Infinity : total;
}

/** Whether a folder holds more than the shop can keep the originals of. */
export const tooBigToLend = (folder: string, cap = MAX_LENT_BYTES) => sizeOf(folder, cap) > cap;

/** Everything in a folder, all the way down: paths relative to it with "/", folders ending in "/", links left out. */
export function entriesIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const path = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(dir, path));
      if (st.isDirectory()) {
        out.push(`${path}/`);
        walk(path);
      } else if (st.isFile()) out.push(path);
    }
  };
  walk('');
  return out;
}

/** What is kept for a lent folder: the originals of the user's files the shop changed, and what it made there. */
type Lent = { kept: string[]; added: string[] };
const LENT = 'lent.json';
const ORIGINALS = 'originals';

/**
 * The work as it was before the last round of changes ("the previous version"), kept in the app's data
 * folder, one per commission, so the user can go back if they liked it better. Only what the shop made
 * is copied: entries that were in the folder before the first run (the user's own files, the copy of a
 * document to edit) are never touched.
 */
export class VersionStore {
  constructor(private root: string) {}

  private dir(id: string) {
    // Ids come from the notebook (c<timestamp>); anything else is refused rather than used in a path.
    if (!/^c\d+$/.test(id)) throw new Error(`bad commission id: ${id}`);
    return join(this.root, id);
  }

  /** Top-level entries of the folder that the shop made (not in `keep`), by name. */
  private madeByShop(workDir: string, keep: Set<string>): string[] {
    if (!existsSync(workDir)) return [];
    return readdirSync(workDir).filter((name) => !keep.has(join(workDir, name)) && !lstatSync(join(workDir, name)).isSymbolicLink()).sort();
  }

  /**
   * Keep a copy of what the shop made so far, replacing any earlier copy. Returns false (and keeps
   * nothing) when there is nothing to keep or it is too big.
   */
  save(id: string, workDir: string, keep: Set<string>): boolean {
    const dir = this.dir(id);
    rmSync(dir, { recursive: true, force: true });
    const names = this.madeByShop(workDir, keep);
    const size = names.reduce((sum, name) => sum + sizeOf(join(workDir, name), MAX_VERSION_BYTES), 0);
    if (!names.length || size > MAX_VERSION_BYTES) return false;
    mkdirSync(join(dir, FILES), { recursive: true });
    for (const name of names) cpSync(join(workDir, name), join(dir, FILES, name), { recursive: true });
    writeFileSync(join(dir, MANIFEST), JSON.stringify({ names, savedAt: new Date().toISOString() }));
    return true;
  }

  has(id: string): boolean {
    return existsSync(join(this.dir(id), MANIFEST));
  }

  /**
   * Swap the kept copy with what is in the folder now: the previous version comes back, and the newer one
   * is kept in its place, so the same button takes the user back again. Nothing the shop made is lost.
   * False when there is no copy.
   */
  restore(id: string, workDir: string, keep: Set<string>): boolean {
    if (!this.has(id) || !existsSync(workDir)) return false;
    const dir = this.dir(id);
    const swap = `${dir}.swap`;
    rmSync(swap, { recursive: true, force: true });
    renameSync(dir, swap);
    const { names } = JSON.parse(readFileSync(join(swap, MANIFEST), 'utf8')) as { names: string[] };
    // The newer work must be kept before it is cleared away; if it can't be (too big), nothing changes.
    if (!this.save(id, workDir, keep) && this.madeByShop(workDir, keep).length) {
      renameSync(swap, dir);
      return false;
    }
    for (const name of this.madeByShop(workDir, keep)) rmSync(join(workDir, name), { recursive: true, force: true });
    for (const name of names) cpSync(join(swap, FILES, name), join(workDir, name), { recursive: true });
    rmSync(swap, { recursive: true, force: true });
    return true;
  }

  drop(id: string) {
    rmSync(this.dir(id), { recursive: true, force: true });
  }

  /** Where a lent folder's originals are kept: named after the folder, which is the user's own and has no id of its own. */
  private lentDir(folder: string) {
    return join(this.root, 'lent', createHash('sha1').update(folder).digest('hex').slice(0, 16));
  }

  private lent(folder: string): Lent {
    const file = join(this.lentDir(folder), LENT);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Lent : { kept: [], added: [] };
  }

  private writeLent(folder: string, lent: Lent) {
    mkdirSync(this.lentDir(folder), { recursive: true });
    writeFileSync(join(this.lentDir(folder), LENT), JSON.stringify(lent));
  }

  /**
   * Keep the original of one of the user's files, just before the shop changes it. Only the first time: a file changed
   * in several rounds goes back to how the user had it, not to an earlier change. One the user let the staff delete
   * first has nothing left to keep.
   */
  keepOriginal(folder: string, file: string) {
    const lent = this.lent(folder);
    const rel = relative(folder, file).split(sep).join('/');
    if (lent.kept.includes(rel) || !existsSync(file)) return;
    const copy = join(this.lentDir(folder), ORIGINALS, rel);
    mkdirSync(dirname(copy), { recursive: true });
    copyFileSync(file, copy);
    lent.kept.push(rel);
    this.writeLent(folder, lent);
  }

  /** What a round made in a lent folder: what is there now (`after`) that was not when it started (`before`). */
  noteAdded(folder: string, before: string[], after: string[]) {
    const had = new Set(before);
    const made = after.filter((p) => !had.has(p));
    if (!made.length) return;
    const lent = this.lent(folder);
    lent.added = [...new Set([...lent.added, ...made])];
    this.writeLent(folder, lent);
  }

  /** The user's files in a lent folder (absolute paths): all of them but what the shop made there. */
  usersFiles(folder: string): string[] {
    const made = new Set(this.lent(folder).added);
    return entriesIn(folder).filter((p) => !p.endsWith('/') && !made.has(p)).map((p) => join(folder, p));
  }

  /** For the result card: which of the user's files are not as they were, and which files the shop made. */
  lentChanges(folder: string): { changed: string[]; added: string[] } {
    const { kept, added } = this.lent(folder);
    const differs = (rel: string) => !existsSync(join(folder, rel))
      || !readFileSync(join(folder, rel)).equals(readFileSync(join(this.lentDir(folder), ORIGINALS, rel)));
    return {
      changed: kept.filter(differs).sort(),
      added: added.filter((p) => !p.endsWith('/') && existsSync(join(folder, p))).sort(),
    };
  }

  canUndo(folder: string): boolean {
    return existsSync(join(this.lentDir(folder), LENT));
  }

  /**
   * Undo the shop's work in a lent folder: the user's files go back byte for byte, what the shop made goes, and
   * anything else is left alone. Nothing is written or removed through a link that leads out of the folder; what was
   * skipped for that is returned (empty when all went back), and kept for another try. Null when nothing was kept.
   */
  undo(folder: string): string[] | null {
    if (!this.canUndo(folder)) return null;
    const { kept, added } = this.lent(folder);
    const skipped: string[] = [];
    for (const rel of kept) {
      const path = join(folder, rel);
      if (!reallyInside(folder, path)) { skipped.push(rel); continue; }
      mkdirSync(dirname(path), { recursive: true });
      copyFileSync(join(this.lentDir(folder), ORIGINALS, rel), path);
    }
    // Backwards, so what is in a folder goes before the folder.
    for (const rel of [...added].sort().reverse()) {
      const path = join(folder, rel);
      if (!reallyInside(folder, dirname(path))) { if (!rel.endsWith('/')) skipped.push(rel); continue; }
      if (!rel.endsWith('/')) rmSync(path, { force: true });
      // A folder the shop made goes only when empty: the user may have put something of theirs in it since.
      else if (existsSync(path) && !readdirSync(path).length) rmSync(path, { recursive: true });
    }
    if (!skipped.length) this.dropLent(folder);
    return skipped.sort();
  }

  dropLent(folder: string) {
    rmSync(this.lentDir(folder), { recursive: true, force: true });
  }

  /** Forget every kept copy (the notebook was cleared). */
  clear() {
    rmSync(this.root, { recursive: true, force: true });
  }
}
