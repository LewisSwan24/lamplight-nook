import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A copy bigger than this is not kept; the result card then offers no way back. */
export const MAX_VERSION_BYTES = 50 * 1024 * 1024;

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

  /** Forget every kept copy (the notebook was cleared). */
  clear() {
    rmSync(this.root, { recursive: true, force: true });
  }
}
