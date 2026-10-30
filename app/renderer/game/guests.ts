import type { GuestId, Speaker } from '../../shared/types';
import type { Chat } from '../translator/lines';
import type { Period } from './daytime';
import { ANCHORS } from './layout';
import type { Holiday, Sky } from './weather';

/**
 * Neighbours who drop in now and then while the shop is quiet: Auntie Gui from the bakery down the
 * street with something fresh from the oven, and Axin the postman with the letters. They come in at
 * the front door, stop by the counter for a few words (lines/chats.yaml, chats with `guest:`) and go
 * again; they leave at once when a commission comes in. Pure: the caller asks every few seconds.
 */
export const GUEST_IDS: GuestId[] = ['baker', 'postman'];

type Point = { x: number; y: number };

/** Where a guest stands to talk: by the end of the counter, facing Adeng behind it. */
export const GUEST_SPOT = { x: 284, y: 100 } as const;
/** Just inside the front door, and the way from there to the counter (clear of the counter and the plant). */
export const GUEST_DOOR = { x: ANCHORS.door.x, y: ANCHORS.door.y } as const;
export const GUEST_PATH: Point[] = [{ x: GUEST_DOOR.x, y: 92 }, { ...GUEST_SPOT }];
export const GUEST_SPEED = 34;

/** The first visit comes a while after opening; after that, one every so often. */
export const FIRST_VISIT_MS = [240_000, 540_000] as const;
export const VISIT_GAP_MS = [600_000, 1_200_000] as const;
/** Once things are quiet again after work, wait at least this long before anyone drops in. */
export const AFTER_WORK_MS = 120_000;

/** Decides when someone drops in and who. Nobody calls after dark. */
export class VisitPlanner {
  private nextAt: number;
  private last: GuestId | null = null;

  constructor(now: number, private rand: () => number = Math.random) {
    this.nextAt = now + this.between(FIRST_VISIT_MS);
  }

  next(now: number, quiet: boolean, period: Period): GuestId | null {
    if (!quiet) {
      this.nextAt = Math.max(this.nextAt, now + AFTER_WORK_MS);
      return null;
    }
    if (period === 'night' || now < this.nextAt) return null;
    this.nextAt = now + this.between(VISIT_GAP_MS);
    // Mostly taking turns, now and then the same one again.
    const other = GUEST_IDS.find((g) => g !== this.last)!;
    const guest = this.last && this.rand() < 0.75 ? other : GUEST_IDS[Math.floor(this.rand() * GUEST_IDS.length)];
    this.last = guest;
    return guest;
  }

  private between([lo, hi]: readonly [number, number]) {
    return lo + this.rand() * (hi - lo);
  }
}

/**
 * What a guest says on this visit: one of their chats whose staff are all in the shop and whose
 * weather, holiday and time of day fit, preferring ones for today's weather or holiday, without
 * repeating until all have been heard (`used` keeps track).
 */
export function pickVisit(
  chats: Chat[], guest: GuestId, outside: { sky: Sky; holiday: Holiday | null }, period: Period,
  present: (who: Speaker) => boolean, used: Set<string>, rand: () => number = Math.random,
): Chat | null {
  const fits = chats.filter((c) => c.guest === guest && (!c.period || c.period === period)
    && (!c.sky || c.sky === outside.sky) && (!c.holiday || c.holiday === outside.holiday)
    && c.turns.every((t) => t.speaker === guest || present(t.speaker)));
  if (!fits.length) return null;
  let fresh = fits.filter((c) => !used.has(c.id));
  if (!fresh.length) {
    for (const c of fits) used.delete(c.id);
    fresh = fits;
  }
  const special = fresh.filter((c) => c.sky || c.holiday || c.period);
  const from = special.length ? special : fresh;
  const pick = from[Math.floor(rand() * from.length)];
  used.add(pick.id);
  return pick;
}
