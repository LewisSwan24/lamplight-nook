import { localMonth } from '../shared/localday';
import { forgetAside, putAside } from './aside';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** What a session cost in one month, as Claude Code estimated it. A session spanning months has one entry for each. */
type Entry = { key: string; usd: number; month: string; /** Estimated from tokens: a stretch Claude Code never reported (B7). */ estimated?: true;
  /** The paired device whose person handed the commission in (docs/plan-1.5.md E5); absent: the owner. */ who?: string };

const month = localMonth;
/** The part of a key before the session: a commission's folder, or `consult:<id>` for a talk with Adeng (B4). */
const folderOf = (key: string) => key.slice(0, key.lastIndexOf('|'));
const isConsult = (key: string) => key.startsWith('consult:');

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
  record(workDir: string, sessionId: string | undefined, usd: number | undefined, now = new Date(), who?: string): number {
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return 0;
    const key = `${workDir}|${sessionId ?? ''}`;
    const earlier = this.entries.filter((e) => e.key === key && !e.estimated);
    const reported = earlier.reduce((sum, e) => sum + e.usd, 0);
    // Running totals only grow: a lower figure never shrinks what was spent. What is new goes to this month, and what
    // a session cost last month stays last month's. Under a millionth of a dollar is only the rounding of the sum.
    const grew = earlier.length ? usd - reported : usd;
    if (grew > 0.000001) {
      const here = earlier.find((e) => e.month === month(now));
      if (here) here.usd += grew;
      else this.entries.push({ key, usd: grew, month: month(now), ...(who ? { who } : {}) });
    }
    this.save();
    return Math.max(grew, 0);
  }

  /**
   * A stretch of a session that stopped before Claude Code reported what it cost (called off, the computer shut down),
   * estimated from its tokens (road-to-1.2.md B7). Kept on a line of its own, apart from the session's reported total, so
   * the total's growth later is still counted once; returns what it added.
   */
  estimate(workDir: string, sessionId: string | undefined, usd: number, now = new Date(), who?: string): number {
    if (!(usd > 0.000001)) return 0;
    this.entries.push({ key: `${workDir}|${sessionId ?? ''}`, usd, month: month(now), estimated: true, ...(who ? { who } : {}) });
    this.save();
    return usd;
  }

  /** A commission's folder moved: what it cost goes with it. */
  moved(from: string, to: string) {
    for (const e of this.entries) {
      if (e.key.startsWith(`${from}|`)) e.key = `${to}${e.key.slice(from.length)}`;
    }
    this.save();
  }

  /** Forgetting everything: the money was spent and stays in its months, but folder names say what it was spent on. */
  forget() {
    const anonymous = new Map<string, number>();
    this.entries = this.entries.map((e) => {
      const folder = folderOf(e.key);
      if (!anonymous.has(folder)) anonymous.set(folder, anonymous.size + 1);
      // A talk with Adeng stays a talk, so the ledger still shows it apart.
      return { ...e, key: `${isConsult(e.key) ? 'consult:' : ''}${anonymous.get(folder)}|` };
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

  /** What each person spent this month, by device id ('' is the owner): together, the whole shop's month (E5). */
  byPerson(now = new Date()): Record<string, number> {
    return this.people(this.entries.filter((e) => e.month === month(now)));
  }

  /** What one person has spent this month, for their own cap. */
  thisMonthBy(who: string, now = new Date()): number {
    return this.byPerson(now)[who] ?? 0;
  }

  private people(entries: Entry[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of entries) out[e.who ?? ''] = (out[e.who ?? ''] ?? 0) + e.usd;
    return out;
  }

  thisMonth(now = new Date()): number {
    const m = month(now);
    return this.entries.filter((e) => e.month === m).reduce((sum, e) => sum + e.usd, 0);
  }

  /** What the talks with Adeng this month cost, and how many there were. */
  consultsThisMonth(now = new Date()): { count: number; usd: number } {
    const here = this.entries.filter((e) => e.month === month(now) && isConsult(e.key));
    return { count: new Set(here.map((e) => folderOf(e.key))).size, usd: here.reduce((sum, e) => sum + e.usd, 0) };
  }

  /** Each month that cost anything, newest first, and how many commissions it went on (talks with Adeng are not commissions). */
  months(): { month: string; usd: number; estimated?: number; commissions: number; people?: Record<string, number> }[] {
    const months = new Set(this.entries.map((e) => e.month));
    return [...months].sort().reverse().map((m) => {
      const here = this.entries.filter((e) => e.month === m);
      const estimated = here.filter((e) => e.estimated).reduce((sum, e) => sum + e.usd, 0);
      return { month: m, usd: here.reduce((sum, e) => sum + e.usd, 0), ...(estimated ? { estimated } : {}), commissions: new Set(here.filter((e) => !isConsult(e.key)).map((e) => folderOf(e.key))).size,
        // Who spent what, once anyone but the owner has (E5).
        ...(here.some((e) => e.who) ? { people: this.people(here) } : {}) };
    });
  }

  private read(): Entry[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('not a ledger');
      return parsed.filter((e) => e && typeof e.key === 'string' && typeof e.usd === 'number' && typeof e.month === 'string' && (e.who === undefined || typeof e.who === 'string'));
    } catch {
      putAside(this.file);
      this.damaged = true;
      return [];
    }
  }
}
