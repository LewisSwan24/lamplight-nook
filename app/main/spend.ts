import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** One run's spend as Claude Code estimated it. A resumed session reports its running total, so it replaces. */
type Entry = { key: string; usd: number; month: string };

const MAX_ENTRIES = 500;
const month = (d: Date) => d.toISOString().slice(0, 7);

/**
 * What the commissions cost, from the totals Claude Code reports (an estimate, not Anthropic's bill).
 * Keyed by folder and session: a retry or a resume of the same session reports a running total and
 * replaces the earlier figure; a fresh session in the same folder adds to it.
 */
export class SpendLedger {
  private entries: Entry[];

  constructor(private file: string) {
    this.entries = this.read();
  }

  /** Keeps a run's reported total and returns what this run itself added. */
  record(workDir: string, sessionId: string | undefined, usd: number | undefined, now = new Date()): number {
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return 0;
    const key = `${workDir}|${sessionId ?? ''}`;
    const old = this.entries.find((e) => e.key === key);
    const added = old && usd > old.usd ? usd - old.usd : usd;
    if (old) {
      // Running totals only grow; a crash result may carry zeros and must not shrink what was spent.
      old.usd = Math.max(old.usd, usd);
      old.month = month(now);
    } else {
      this.entries.push({ key, usd, month: month(now) });
    }
    this.entries = this.entries.slice(-MAX_ENTRIES);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.entries));
    renameSync(`${this.file}.tmp`, this.file);
    return added;
  }

  /** What one commission folder has cost across all its sessions. */
  forCommission(workDir: string): number {
    return this.entries.filter((e) => e.key.startsWith(`${workDir}|`)).reduce((sum, e) => sum + e.usd, 0);
  }

  thisMonth(now = new Date()): number {
    const m = month(now);
    return this.entries.filter((e) => e.month === m).reduce((sum, e) => sum + e.usd, 0);
  }

  private read(): Entry[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.key === 'string' && typeof e.usd === 'number' && typeof e.month === 'string') : [];
    } catch {
      return [];
    }
  }
}
