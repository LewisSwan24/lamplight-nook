import { existsSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** True if `target` (absolute, or relative to workDir) is workDir itself or inside it. */
export function isInside(workDir: string, target: string): boolean {
  const abs = isAbsolute(target) ? target : resolve(workDir, target);
  const rel = relative(workDir, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Where a path really is once links and junctions on the way are followed. For one that is not there yet, its nearest
 * existing folder decides; a link whose target is not there yet leads to that target.
 */
export function realPlace(path: string): string {
  const missing: string[] = [];
  let at = resolve(path);
  while (!existsSync(at)) {
    if (lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) return join(resolve(dirname(at), readlinkSync(at)), ...missing);
    missing.unshift(basename(at));
    at = dirname(at);
  }
  return join(realpathSync(at), ...missing);
}

/** Inside the folder once links are followed, so a link inside cannot lead somewhere else. */
export const reallyInside = (dir: string, path: string) => isInside(realPlace(dir), realPlace(path));
