import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CommissionForm } from '../shared/types';

/** A commission that is running (or was, when the app went down). Enough to retry or resume it. */
export type Job = {
  form: CommissionForm;
  workDir: string;
  /** Files in the folder before the first run; overwriting them still needs confirmation on a resume. */
  preexisting: string[];
  /** SDK session to resume, once the run has reported it. */
  sessionId?: string;
  startedAt: number;
  /** A round of changes to finished work: its notebook entry, what to change, the session to pick up. */
  revise?: { id: string; ask: string; fromSession?: string; summary?: string; restored?: boolean };
};

/**
 * Remembers the running commission on disk. The file is removed whenever a run ends, so finding it at
 * startup means the app was closed or crashed mid-commission.
 */
export class PendingStore {
  constructor(private file: string) {}

  save(job: Job) {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(job, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }

  load(): Job | null {
    try {
      const job = JSON.parse(readFileSync(this.file, 'utf8')) as Job;
      return job && typeof job.workDir === 'string' && job.form && typeof job.form.want === 'string' ? job : null;
    } catch {
      return null;
    }
  }

  clear() {
    rmSync(this.file, { force: true });
  }
}
