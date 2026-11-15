import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { reallyInside } from './paths';
import { MAX_VERSION_BYTES, entriesIn } from './versions';

/** What a project's versions may take up in all; past it the oldest rounds go (road-to-1.2.md B2). */
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;

const OBJECTS = 'objects';

/** A round's version: each file, by path inside the folder with "/", to the sha256 of its content. */
type Manifest = { files: Record<string, string>; savedAt: string };

/**
 * What goes in a version, and what going back may clear away. In the shop's own folder: everything but the user's own
 * entries (`keep`, absolute paths of what was there before the shop started). In a lent folder: only the files the work
 * touched (`touched`, by path inside it), and going back puts the user's `original` back where a later round changed it.
 */
export type Scope = { keep: Set<string> } | { touched: string[]; original?: (rel: string) => string | undefined };

/**
 * Every round's version of every project, kept by content (road-to-1.2.md B2): `objects/<sha256>` holds a file's bytes
 * once however many rounds have it, and `<project>/<round>.json` says which file was which. A file over
 * MAX_VERSION_BYTES is not kept, and past `cap` a project's oldest rounds go, though never its first or its latest.
 */
export class ProjectVersions {
  constructor(private root: string, private cap = MAX_PROJECT_BYTES) {}

  private manifestPath(project: string, round: number) {
    // Both come from the notebook (p<time>, 1, 2, 3...); anything else is refused rather than used in a path.
    if (!/^p\d+$/.test(project) || !Number.isInteger(round) || round < 1) throw new Error(`bad version: ${project} ${round}`);
    return join(this.root, project, `${round}.json`);
  }

  private object(sha: string) {
    return join(this.root, OBJECTS, sha);
  }

  /** The files a version is made of, as they are in the folder now: path inside it to absolute path. */
  private gather(workDir: string, scope: Scope): string[] {
    if ('touched' in scope) return scope.touched.filter((rel) => existsSync(join(workDir, rel)) && lstatSync(join(workDir, rel)).isFile());
    return entriesIn(workDir).filter((rel) => !rel.endsWith('/') && !scope.keep.has(join(workDir, rel.split('/')[0])));
  }

  /**
   * Keep the folder as it is after round `round` of the project, replacing what that round had. Returns the rounds whose
   * versions went to keep the project under its cap, oldest first.
   */
  save(project: string, round: number, workDir: string, scope: Scope): number[] {
    const file = this.manifestPath(project, round);
    const files: Record<string, string> = {};
    for (const rel of this.gather(workDir, scope)) {
      const path = join(workDir, rel);
      if (statSync(path).size > MAX_VERSION_BYTES) continue;
      const body = readFileSync(path);
      const sha = createHash('sha256').update(body).digest('hex');
      if (!existsSync(this.object(sha))) {
        mkdirSync(join(this.root, OBJECTS), { recursive: true });
        writeFileSync(this.object(sha), body);
      }
      files[rel] = sha;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ files, savedAt: new Date().toISOString() } satisfies Manifest));
    return this.prune(project);
  }

  has(project: string, round: number): boolean {
    return existsSync(this.manifestPath(project, round));
  }

  /** The rounds of a project that still have their version, in order. */
  rounds(project: string): number[] {
    const dir = join(this.root, project);
    if (!/^p\d+$/.test(project) || !existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => Number(f.slice(0, -5))).sort((a, b) => a - b);
  }

  files(project: string, round: number): Record<string, string> {
    return (JSON.parse(readFileSync(this.manifestPath(project, round), 'utf8')) as Manifest).files;
  }

  /** What a project's versions take up: each content once. */
  size(project: string): number {
    const shas = new Set(this.rounds(project).flatMap((n) => Object.values(this.files(project, n))));
    return [...shas].reduce((sum, sha) => sum + statSync(this.object(sha)).size, 0);
  }

  /** Past the cap, the oldest rounds go, but not the first or the latest. */
  private prune(project: string): number[] {
    const gone: number[] = [];
    let rounds = this.rounds(project);
    while (this.size(project) > this.cap && rounds.length > 2) {
      rmSync(this.manifestPath(project, rounds[1]));
      gone.push(rounds[1]);
      rounds = this.rounds(project);
    }
    if (gone.length) this.sweep();
    return gone;
  }

  /** Content no version of any project uses any more goes. */
  private sweep() {
    const used = new Set<string>();
    for (const project of readdirSync(this.root).filter((d) => /^p\d+$/.test(d))) {
      for (const n of this.rounds(project)) for (const sha of Object.values(this.files(project, n))) used.add(sha);
    }
    for (const sha of readdirSync(join(this.root, OBJECTS))) if (!used.has(sha)) rmSync(this.object(sha));
  }

  /** Write a round's files into `dir` (a new folder, or one to look at). */
  extract(project: string, round: number, dir: string) {
    for (const [rel, sha] of Object.entries(this.files(project, round))) {
      // Never through a link that leads out of the folder.
      if (!reallyInside(dir, dirname(join(dir, rel)))) continue;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      copyFileSync(this.object(sha), join(dir, rel));
    }
    mkdirSync(dir, { recursive: true });
  }

  /**
   * Put a round back in the folder: what the shop made there now goes (all but files too big to have been kept), then
   * the round's files come back. The user's own files stay as they are; in a lent folder those the work touched go back
   * to the round, or to how the user had them when the round had not touched them yet.
   */
  putBack(project: string, round: number, workDir: string, scope: Scope) {
    const files = this.files(project, round);
    for (const rel of this.gather(workDir, scope)) {
      if (rel in files || !reallyInside(workDir, dirname(join(workDir, rel)))) continue;
      const original = 'touched' in scope ? scope.original?.(rel) : undefined;
      if (original) copyFileSync(original, join(workDir, rel));
      else if (statSync(join(workDir, rel)).size <= MAX_VERSION_BYTES) rmSync(join(workDir, rel));
    }
    // Folders the shop made that are empty now go as well, deepest first.
    if ('keep' in scope) {
      for (const rel of entriesIn(workDir).filter((p) => p.endsWith('/')).reverse()) {
        const path = join(workDir, rel);
        if (!scope.keep.has(join(workDir, rel.split('/')[0])) && !readdirSync(path).length) rmSync(path, { recursive: true });
      }
    } else {
      for (const rel of scope.touched.filter((p) => !(p in files))) {
        for (let dir = dirname(join(workDir, rel)); dir.length > workDir.length && existsSync(dir) && reallyInside(workDir, dir) && !readdirSync(dir).length; dir = dirname(dir)) rmSync(dir, { recursive: true });
      }
    }
    this.extract(project, round, workDir);
  }

  /**
   * The previous version a commission had from before projects (versions/<commission>/, versions.ts) becomes the version
   * of `round` of its project, and the old copy goes. False when there was none.
   */
  takeOld(commission: string, project: string, round: number): boolean {
    const old = join(this.root, commission);
    if (!/^c\d+$/.test(commission) || !existsSync(join(old, 'manifest.json'))) return false;
    this.save(project, round, join(old, 'files'), { keep: new Set() });
    rmSync(old, { recursive: true, force: true });
    return true;
  }
}
