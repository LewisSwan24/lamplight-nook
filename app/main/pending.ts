import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CommissionForm } from '../shared/types';

/** A commission that is running (or was, when the app went down). Enough to retry or resume it. */
export type Job = {
  /** The round it runs as (r<time>, road-to-1.2.md B5); absent in a file an older version left. */
  run?: string;
  form: CommissionForm;
  workDir: string;
  /** Files in the folder before the first run; overwriting them still needs confirmation on a resume. */
  preexisting: string[];
  /** SDK session to resume, once the run has reported it. */
  sessionId?: string;
  startedAt: number;
  /** A round of changes to finished work: its notebook entry, what to change, the session to pick up. */
  revise?: { id: string; ask: string; fromSession?: string; summary?: string; restored?: boolean; scheduled?: boolean };
};

const isJob = (job: Job | null) => Boolean(job && typeof job.workDir === 'string' && job.form && typeof job.form.want === 'string');

/**
 * Remembers the running commissions on disk, each by its run id. A job is removed whenever its run ends, and the file
 * when none is left, so finding one at startup means the app was closed or crashed mid-commission.
 */
export class PendingStore {
  private jobs: Job[] = [];

  constructor(private file: string) {}

  save(job: Job) {
    this.jobs = [...this.jobs.filter((j) => j.run !== job.run), job].sort((a, b) => a.startedAt - b.startedAt);
    this.write();
  }

  /** What was under way when the app last went down: a list now, a single job from before B5. */
  load(): Job[] {
    try {
      const read = JSON.parse(readFileSync(this.file, 'utf8')) as Job | Job[];
      this.jobs = (Array.isArray(read) ? read : [read]).filter(isJob);
    } catch {
      this.jobs = [];
    }
    return [...this.jobs];
  }

  clear(run: string | undefined) {
    this.jobs = this.jobs.filter((j) => j.run !== run);
    this.write();
  }

  private write() {
    if (!this.jobs.length) return rmSync(this.file, { force: true });
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.jobs, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
