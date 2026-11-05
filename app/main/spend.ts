import { localMonth } from '../shared/localday';
import { forgetAside, putAside } from './aside';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** What a session cost in one month, as Claude Code estimated it. A session spanning months has one entry for each. */
type Entry = { key: string; usd: number; month: string };

const month = localMonth;

/**
 * What the commissions cost, from the totals Claude Code reports (an estimate, not Anthropic's bill).
 * Keyed by folder and session: a retry or a resume of the same session reports a running total, and only what
 * that adds counts; a fresh session in the same folder adds to the commission.
 */
export class SpendLedger {
  private entries: Entry[];

  /** The file could not be read when the shop opened, for the shop to tell the user. */
  damaged = false;

  constructor(private file: string) {
    this.entries = this.read();
  }

  /** Keeps a run's reported total and returns what this run itself added. */
  record(workDir: string, sessionId: string | undefined, usd: number | undefined, now = new Date()): number {
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return 0;
    const key = `${workDir}|${sessionId ?? ''}`;
    const earlier = this.entries.filter((e) => e.key === key);
    const reported = earlier.reduce((sum, e) => sum + e.usd, 0);
    const added = earlier.length && usd > reported ? usd - reported : usd;
    // Running totals only grow: a lower figure never shrinks what was spent. What is new goes to this month, and what
    // a session cost last month stays last month's. Under a millionth of a dollar is only the rounding of the sum.
    const grew = earlier.length ? usd - reported : usd;
    if (grew > 0.000001) {
      const here = earlier.find((e) => e.month === month(now));
      if (here) here.usd += grew;
      else this.entries.push({ key, usd: grew, month: month(now) });
    }
    this.save();
    return added;
  }

  /** Forgetting everything: the money was spent and stays in its months, but folder names say what it was spent on. */
  forget() {
    const anonymous = new Map<string, number>();
    this.entries = this.entries.map((e) => {
      const folder = e.key.slice(0, e.key.lastIndexOf('|'));
      if (!anonymous.has(folder)) anonymous.set(folder, anonymous.size + 1);
      return { ...e, key: `${anonymous.get(folder)}|` };
    });
    this.save();
    forgetAside(this.file);
    const backups = join(dirname(this.file), 'backup');
    if (!existsSync(backups)) return;
    for (const dir of readdirSync(backups)) rmSync(join(backups, dir, basename(this.file)), { force: true });
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.entries));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** What one commission folder has cost across all its sessions. */
  forCommission(workDir: string): number {
    return this.entries.filter((e) => e.key.startsWith(`${workDir}|`)).reduce((sum, e) => sum + e.usd, 0);
  }

  thisMonth(now = new Date()): number {
    const m = month(now);
    return this.entries.filter((e) => e.month === m).reduce((sum, e) => sum + e.usd, 0);
  }

  /** Each month that cost anything, newest first, and how many commissions it went on. */
  months(): { month: string; usd: number; commissions: number }[] {
    const months = new Set(this.entries.map((e) => e.month));
    return [...months].sort().reverse().map((m) => {
      const here = this.entries.filter((e) => e.month === m);
      return { month: m, usd: here.reduce((sum, e) => sum + e.usd, 0), commissions: new Set(here.map((e) => e.key.slice(0, e.key.lastIndexOf('|')))).size };
    });
  }

  private read(): Entry[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('not a ledger');
      return parsed.filter((e) => e && typeof e.key === 'string' && typeof e.usd === 'number' && typeof e.month === 'string');
    } catch {
      putAside(this.file);
      this.damaged = true;
      return [];
    }
  }
}
