import { isAbsolute, relative, resolve } from 'node:path';

/** True if `target` (absolute, or relative to workDir) is workDir itself or inside it. */
export function isInside(workDir: string, target: string): boolean {
  const abs = isAbsolute(target) ? target : resolve(workDir, target);
  const rel = relative(workDir, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
