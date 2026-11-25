import type { Season } from '../../shared/growth';
import type { Period } from '../game/daytime';
import type { Holiday, Sky } from '../game/weather';
import type { Line } from '../translator/lines';

/**
 * The keepers of the shops along the street talking while you are in their shop (plan-1.6.md F5). Walking in, the
 * keeper says a word (lines group `shop_in`); while the shop is quiet they say something now and then (`shop_idle`).
 * A line's `when` ties it to the moment: `period_<dawn|day|dusk|night>`, `sky_<sky>`, `holiday_<holiday>` or
 * `season_<season>`; a line without one fits any time. Pure: the caller asks `next` every few seconds and says what
 * comes back.
 */

/** Whose birthday it is (plan-1.7.md G3, shared/calendar.ts): a keeper says so in their own shop before anything else. */
export type Moment = { period: Period; sky: Sky; holiday: Holiday | null; season: Season; birthdays?: readonly string[] };

/** How long after walking in before the first idle word, and the gap between one and the next. */
export const ENTER_QUIET_MS = [15_000, 25_000] as const;
export const SHOP_TALK_GAP_MS = [45_000, 90_000] as const;

/** What holds right now, most particular first. */
export const momentFlags = (m: Moment): string[] =>
  [...(m.birthdays ?? []).map((b) => `birthday_${b}`), ...(m.holiday ? [`holiday_${m.holiday}`] : []), `sky_${m.sky}`, `period_${m.period}`, `season_${m.season}`];

export const fitsMoment = (line: Line, m: Moment): boolean => !line.when || momentFlags(m).includes(line.when);

export class ShopTalk {
  private due = Infinity;
  private heard = new Set<string>();

  constructor(now: number, private rand: () => number = Math.random) {
    this.due = now + this.between(ENTER_QUIET_MS);
  }

  /**
   * The word as you walk in: the keeper's birthday's if it is today, then the holiday's if there is one, else the weather's, else one for the hour, the season or
   * any time, picked at random among those.
   */
  greet(lines: Line[], m: Moment): Line | null {
    const fits = lines.filter((l) => fitsMoment(l, m));
    const tiers = [fits.filter((l) => l.when?.startsWith('birthday_')), fits.filter((l) => l.when?.startsWith('holiday_')), fits.filter((l) => l.when?.startsWith('sky_')), fits];
    const tier = tiers.find((t) => t.length);
    return tier ? this.pick(tier) : null;
  }

  /** You have just walked in: the first idle word comes a little later. */
  enter(now: number) {
    this.due = now + this.between(ENTER_QUIET_MS);
  }

  /**
   * Something to say now, or null: only while quiet and once the gap has passed. What belongs to the moment comes
   * before the everyday lines, and nothing is said twice until everything that fits has been.
   */
  next(now: number, quiet: boolean, lines: Line[], m: Moment): Line | null {
    if (!quiet || now < this.due) return null;
    const fits = lines.filter((l) => fitsMoment(l, m));
    if (!fits.length) return null;
    let fresh = fits.filter((l) => !this.heard.has(l.id));
    if (!fresh.length) {
      for (const l of fits) this.heard.delete(l.id);
      fresh = fits;
    }
    const marked = fresh.filter((l) => l.when);
    const said = this.pick(marked.length ? marked : fresh);
    this.heard.add(said.id);
    this.due = now + this.between(SHOP_TALK_GAP_MS);
    return said;
  }

  private pick<T>(from: T[]): T {
    return from[Math.floor(this.rand() * from.length)];
  }

  private between([lo, hi]: readonly [number, number]): number {
    return lo + Math.floor(this.rand() * (hi - lo));
  }
}
