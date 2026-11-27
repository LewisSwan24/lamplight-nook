import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommissionForm, RepairBranch } from '../shared/types';

/**
 * Where a round stands (road-to-1.2.md B7): under way, waiting in the queue, stopped by the user on closing, failed (the
 * network, a busy service, a budget: `why`), or interrupted by the computer shutting down.
 */
export type PendingState = 'running' | 'queued' | 'stopped' | 'failed' | 'interrupted';

/** A commission that is running (or was, when the app went down). Enough to retry or resume it. */
export type Job = {
  /** The round it runs as (r<time>, road-to-1.2.md B5); absent only in a file an older version left. */
  run?: string;
  /** Absent only in a file an older version left. */
  state?: PendingState;
  /** Why a failed round stopped: the error the result card shows (net, busy, budget, monthCap...). */
  why?: string;
  /** When it took its state. */
  at?: number;
  /** The scheduled commission it is a round of (B6): it is carried on, not run again at its next time. */
  schedule?: string;
  /** Carried on by itself once after the computer woke (B7): never twice. */
  autoResumed?: boolean;
  form: CommissionForm;
  workDir: string;
  /** Files in the folder before the first run; overwriting them still needs confirmation on a resume. */
  preexisting: string[];
  /** SDK session to resume, once the run has reported it. */
  sessionId?: string;
  startedAt: number;
  /** A repair's branch (plan-1.8.md H9): carried on, the round goes on in the same worktree. */
  repair?: RepairBranch;
  /** A round of changes to finished work: its notebook entry, what to change, the session to pick up. */
  revise?: { id: string; ask: string; fromSession?: string; summary?: string; restored?: boolean; scheduled?: boolean };
};

/** A run id as runs.ts makes them; nothing else goes into a file name. */
const RUN = /^r\d{1,16}$/;
const isJob = (job: Job | null) => Boolean(job && typeof job.workDir === 'string' && job.form && typeof job.form.want === 'string');
/** States a round can be carried on from in the session that left it so; anything left from before can be. */
const CARRY_ON = new Set<PendingState>(['stopped', 'failed', 'interrupted']);

/**
 * The rounds under way or waiting to be carried on, one file each in pending/<run>.json (road-to-1.2.md B7). A round's
 * file goes when it finishes or is called off; one that stops another way stays with its state, so the shop can offer
 * it again after it was closed, crashed or the computer went down.
 */
export class PendingStore {
  private jobs = new Map<string, Job>();
  /** Read at opening: left over from before, so offered whatever their state says. */
  private before = new Set<string>();

  constructor(private dir: string, private old: string) {}

  /** What was under way or stopped when the shop last went down; the pending.json an older version kept is turned into files first. */
  load(): Job[] {
    this.convert();
    this.jobs.clear();
    const names = existsSync(this.dir) ? readdirSync(this.dir) : [];
    for (const name of names) {
      const run = name.slice(0, -'.json'.length);
      if (!name.endsWith('.json') || !RUN.test(run)) continue;
      try {
        const job = JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as Job;
        if (isJob(job)) this.jobs.set(run, { ...job, run });
      } catch {
        continue;
      }
    }
    this.before = new Set(this.jobs.keys());
    return this.list();
  }

  /** The rounds left from before that are still to be offered, oldest first. */
  left(): Job[] {
    return this.list().filter((j) => this.before.has(j.run!));
  }

  /** Every round on disk, oldest first. */
  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => a.startedAt - b.startedAt);
  }

  save(job: Job) {
    const run = this.checked(job.run);
    this.jobs.set(run, job);
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, `${run}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(job, null, 2));
    renameSync(`${file}.tmp`, file);
  }

  clear(run: string | undefined) {
    if (!run || !this.jobs.has(run)) return;
    this.jobs.delete(run);
    this.before.delete(run);
    rmSync(join(this.dir, `${this.checked(run)}.json`), { force: true });
  }

  /**
   * Hands a round over to be carried on, and forgets it: the round that carries it on keeps its own file. Once only, so
   * the wake and the user asking at the same time carry it on once (B7); a round under way in this session is not handed.
   */
  take(run: string): Job | undefined {
    const job = this.jobs.get(run);
    if (!job || !(this.before.has(run) || CARRY_ON.has(job.state!))) return undefined;
    this.clear(run);
    return job;
  }

  /** The computer is shutting down: every round under way or waiting is interrupted, written down before anything else. */
  interrupt(at: number): Job[] {
    const hit = this.list().filter((j) => j.state === 'running' || j.state === 'queued');
    for (const j of hit) this.save({ ...j, state: 'interrupted', at });
    return hit.map((j) => this.jobs.get(j.run!)!);
  }

  private checked(run: string | undefined): string {
    if (!run || !RUN.test(run)) throw new Error(`not a run id: ${run}`);
    return run;
  }

  /** B5 kept a list in pending.json, 1.1 a single job without a run id; each becomes a file, as under way when the shop went down. */
  private convert() {
    if (!existsSync(this.old)) return;
    try {
      const read = JSON.parse(readFileSync(this.old, 'utf8')) as Job | Job[];
      for (const job of (Array.isArray(read) ? read : [read]).filter(isJob)) {
        this.save({ ...job, run: job.run && RUN.test(job.run) ? job.run : `r${job.startedAt}`, state: job.state ?? 'running' });
      }
    } catch {
      // A broken old file holds nothing that could be carried on.
    }
    rmSync(this.old, { force: true });
  }
}
