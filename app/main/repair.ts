import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { readNotes, type RepairTally } from '../shared/repair';
import type { RepairBranch, RepairRecord } from '../shared/types';

/**
 * The workshop's repairs (plan-1.8.md H9): a code repository the user lends is worked on in a worktree of its own, on a
 * new branch, inside the commission folder. The user's checkout, their branches and their remotes are never touched,
 * and nothing is pushed. Kept, the branch stays for the user to merge; dropped, it goes (Q-F12).
 */

/** The shop's name on its commits: the work is the shop's until the user merges it. */
const AUTHOR = ['-c', 'user.name=Lamplight Nook', '-c', 'user.email=nook@lamplight.invalid'];
/**
 * An empty folder of the shop's own, outside every worktree, as git's hooks folder: no hook runs, neither the
 * repository's nor one the fixer planted (a relative path would be looked up inside the worktree).
 */
let hooks: string | undefined;
const noHooks = () => (hooks ??= mkdtempSync(join(tmpdir(), 'nook-no-hooks-')));

/**
 * Every git call: no hooks run (a checkout or commit here must not run anyone's scripts), nor a file system monitor,
 * long paths work on Windows, and nothing is signed or asks for a password.
 */
const quiet = () => ['-c', `core.hooksPath=${noHooks()}`, '-c', 'core.fsmonitor=false', '-c', 'core.longpaths=true', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...quiet(), ...args], {
    cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

/** Whether git is there to use at all. */
export function gitReady(): boolean {
  try { git(process.cwd(), '--version'); return true; } catch { return false; }
}

/** The top of the repository a folder is in, if it is one with a commit to start from; never a bare one. */
export function repoOf(folder: string): string | null {
  try {
    if (git(folder, 'rev-parse', '--is-bare-repository') !== 'false') return null;
    git(folder, 'rev-parse', '--verify', '-q', 'HEAD');
    return resolve(git(folder, 'rev-parse', '--show-toplevel'));
  } catch {
    return null;
  }
}

/** The branch's name, from the commission folder's date and time; a second one the same second gets a number. */
function branchName(repo: string, workDir: string): string {
  const stamp = /^\d{4}-\d{2}-\d{2}-\d{6}/.exec(basename(workDir))?.[0] ?? String(Date.now());
  const taken = (name: string) => git(repo, 'branch', '--list', name) !== '';
  let name = `nook/${stamp}`;
  for (let n = 2; taken(name); n++) name = `nook/${stamp}-${n}`;
  return name;
}

/** Lends the repository to a commission: its last commit checked out on a new branch, in a folder of the same name inside workDir. */
export function borrowRepo(repo: string, workDir: string): RepairBranch {
  const branch = branchName(repo, workDir);
  const dir = join(workDir, basename(repo));
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'worktree', 'add', '-q', '-b', branch, dir, base);
  // Where git keeps this worktree, read once now: afterwards the fixer may have written anything into dir/.git.
  const gitDir = resolve(dir, git(dir, 'rev-parse', '--git-dir'));
  return { repo, branch, base, dir, gitDir };
}

/** git in the worktree, never by what dir/.git says: the git dir and work tree are the ones borrowRepo set up. */
const inTree = (b: RepairBranch, ...args: string[]) => git(b.dir, `--git-dir=${b.gitDir}`, `--work-tree=${b.dir}`, ...args);

/** Lines added and removed per file from the branch's start; a binary file is -1 for both. */
function changedFiles(b: RepairBranch): { path: string; added: number; removed: number }[] {
  const out = inTree(b, 'diff', '--numstat', '--no-renames', '--no-ext-diff', '--no-textconv', b.base, 'HEAD');
  return out.split('\n').filter(Boolean).map((line) => {
    const [added, removed, ...path] = line.split('\t');
    const n = (s: string) => (s === '-' ? -1 : Number(s));
    return { path: path.join('\t'), added: n(added), removed: n(removed) };
  });
}

/**
 * The work done: everything changed in the worktree is committed on the branch, under the commission's title, and the
 * review sheet is written from git (which files) and the fixer's notes (why, and the tests).
 */
export function handBack(b: RepairBranch, o: { notes: string; title: string; seen: RepairTally }): RepairRecord {
  inTree(b, 'add', '-A');
  const staged = inTree(b, 'diff', '--cached', '--name-only', '--no-ext-diff', '--no-textconv');
  if (staged) inTree(b, ...AUTHOR, 'commit', '-q', '--no-verify', '-m', o.title);
  const notes = readNotes(existsSync(o.notes) ? readFileSync(o.notes, 'utf8') : undefined);
  const files = changedFiles(b).map((f) => {
    const why = notes.why.get(f.path);
    return why ? { ...f, why } : f;
  });
  return { ...b, files, tests: notes.tests, testsSeen: o.seen.tests !== 'none', state: 'waiting' };
}

/**
 * The worktree's folder is taken away and git told it is gone. The shop does it itself rather than asking git to: git
 * would go by the folder's .git, which the fixer may have rewritten.
 */
function giveBack(b: RepairBranch): void {
  rmSync(b.dir, { recursive: true, force: true });
  git(b.repo, 'worktree', 'prune');
}

/** The worktree folder goes; the branch stays in the repository for the user to merge when they choose. */
export function keepBranch(b: RepairBranch): void {
  giveBack(b);
}

/** The worktree and its branch both go: the repository is as it was before the commission. */
export function dropBranch(b: RepairBranch): void {
  giveBack(b);
  git(b.repo, 'branch', '-D', b.branch);
}
