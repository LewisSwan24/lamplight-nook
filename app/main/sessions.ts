import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where Claude Code keeps its sessions: one folder per working directory under <config>/projects. */
export function sessionsRoot(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'projects');
}

/**
 * Whether Claude Code still has a session on disk (it clears old ones after a while), so it can be resumed.
 * Looked up by file name in every project folder, since the folder name encoding is Claude Code's own.
 */
export function sessionExists(id: string, root = sessionsRoot()): boolean {
  if (!/^[\w-]+$/.test(id) || !existsSync(root)) return false;
  try {
    return readdirSync(root).some((dir) => existsSync(join(root, dir, `${id}.jsonl`)));
  } catch {
    return false;
  }
}
