import { localMonth } from '../shared/localday';
import { MONTH_CAP_CHOICES } from '../shared/types';

/** The monthly cap a shop starts with (road-to-1.2.md Q-B4). */
export const MONTH_CAP_DEFAULT = 20;
/**
 * Less than this left under a cap and a round does not start. Claude Code only tells what a round cost once it ends, and
 * stops a little past the most it was given, so this is the room left for that.
 */
export const MIN_START_USD = 0.5;
/** Past this share of a cap, Adeng says so once. */
export const WARN_SHARE = 0.8;

/** `person`: what the owner lets one paired device's person spend in a month (docs/plan-1.5.md E5). */
export type CapKind = 'month' | 'project' | 'person';
/** The caps on a round, in US dollars; 0 or absent is no cap. */
export type Caps = { roundUsd: number; monthUsd: number; projectUsd?: number; personUsd?: number };
/** What the ledger says was spent this month, on the project, and by the person who handed the round in. */
export type Spent = { month: number; project: number; person?: number };
/** A round that may not start: the cap it ran into, what was spent under it and what is left (never below nothing). */
export type Refusal = { cap: CapKind; capUsd: number; spentUsd: number; leftUsd: number };
/** The most a round may spend (undefined: no limit), and which cap set it. */
export type Grant = { usd: number | undefined; by: 'round' | CapKind | null };
/** A cap past eight tenths, keyed by month or project so it is said only once. */
export type Warning = Refusal & { key: string };

const cents = (usd: number) => Math.floor(usd * 100 + 1e-6) / 100;

/**
 * What the rounds under way hold (road-to-1.2.md B8). Claude Code reports a round's cost only when it ends, so a round
 * holds the most it may spend from the moment it starts, and rounds that start while it runs count that as spent. Once it
 * ends its cost is in the ledger and the hold goes. Keyed by run, so two rounds at once (B5) each hold their own.
 */
export class Reservations {
  private holds = new Map<string, { project?: string; person?: string; usd: number }>();

  /** Hold what a round may spend, or say which cap stops it starting. `person`: the device it was handed in from (E5). */
  reserve(run: string, project: string | undefined, caps: Caps, spent: Spent, person?: string): Grant | { refused: Refusal } {
    const month = caps.monthUsd ? caps.monthUsd - spent.month - this.held() : Infinity;
    const mine = project && caps.projectUsd ? caps.projectUsd - spent.project - this.held(project) : Infinity;
    const theirs = person && caps.personUsd ? caps.personUsd - (spent.person ?? 0) - this.heldBy(person) : Infinity;
    const left = Math.min(month, mine, theirs);
    if (left < MIN_START_USD) {
      const cap: CapKind = left === month ? 'month' : left === mine ? 'project' : 'person';
      const capUsd = { month: caps.monthUsd, project: caps.projectUsd ?? 0, person: caps.personUsd ?? 0 }[cap];
      const spentUsd = { month: spent.month, project: spent.project, person: spent.person ?? 0 }[cap];
      return { refused: { cap, capUsd, spentUsd, leftUsd: Math.max(0, left) } };
    }
    const limit = Math.min(caps.roundUsd || Infinity, left);
    this.holds.set(run, { project, person, usd: limit });
    if (limit === Infinity) return { usd: undefined, by: null };
    return { usd: cents(limit), by: limit === month ? 'month' : limit === mine ? 'project' : limit === theirs ? 'person' : 'round' };
  }

  /** What one person's rounds under way hold. */
  heldBy(person: string): number {
    return [...this.holds.values()].filter((h) => h.person === person).reduce((sum, h) => sum + h.usd, 0);
  }

  /** The round ended and the ledger has what it cost: what it held is free again. */
  settle(run: string) {
    this.holds.delete(run);
  }

  /** What the rounds under way hold, all of them or one project's. */
  held(project?: string): number {
    return [...this.holds.values()].filter((h) => !project || h.project === project).reduce((sum, h) => sum + h.usd, 0);
  }
}

/** The caps a settled round has taken past eight tenths for the first time this month, or on this project. */
export function warnings(caps: Caps, spent: Spent, said: string[], month: string, project?: string): Warning[] {
  const over = (cap: CapKind, key: string, capUsd: number | undefined, spentUsd: number): Warning[] =>
    capUsd && spentUsd >= WARN_SHARE * capUsd && !said.includes(key) ? [{ cap, key, capUsd, spentUsd, leftUsd: Math.max(0, capUsd - spentUsd) }] : [];
  return [...over('month', month, caps.monthUsd, spent.month), ...(project ? over('project', project, caps.projectUsd, spent.project) : [])];
}

/**
 * The monthly cap for a shop from before there was one: the default, or one step up when this month or one of the three
 * before it cost more, so an upgrade does not stop someone who spends more straight away.
 */
export function startingMonthCap(months: { month: string; usd: number }[], now: Date): number {
  const recent = [0, 1, 2, 3].map((back) => localMonth(new Date(now.getFullYear(), now.getMonth() - back, 1)));
  const over = months.some((m) => recent.includes(m.month) && m.usd > MONTH_CAP_DEFAULT);
  return over ? MONTH_CAP_CHOICES[MONTH_CAP_CHOICES.indexOf(MONTH_CAP_DEFAULT) + 1] : MONTH_CAP_DEFAULT;
}
