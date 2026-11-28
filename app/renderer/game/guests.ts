import type { Made } from '../../shared/growth';
import { TEMPLATES } from '../../shared/templates';
import type { GuestId, Speaker } from '../../shared/types';
import type { Chat } from '../translator/lines';
import type { Period } from './daytime';
import { ANCHORS } from './layout';
import type { Holiday, Season, Sky } from './weather';

/**
 * Neighbours who drop in now and then while the shop is quiet: Auntie Gui from the bakery down the
 * street with something fresh from the oven, and Axin the postman with the letters. They come in at
 * the front door, stop by the counter for a few words (lines/chats.yaml, chats with `guest:`) and go
 * again; they leave at once when a commission comes in. Pure: the caller asks every few seconds.
 */
export const GUEST_IDS: GuestId[] = ['baker', 'postman', 'mechanic', 'granny', 'student', 'cook', 'lodger', 'florist', 'organizer', 'pupil', 'bookkeeper', 'dad', 'editor', 'mum', 'bookseller'];
/** Old friends of the shop, who come from the start. */
const OLD_FRIENDS: GuestId[] = ['baker', 'postman'];

/**
 * Who may drop in, given what the shop has made: the old friends, and those a kind of work brings
 * (shared/templates.ts): Old Zhou from the garage once there has been a web page, Granny Chen with her
 * photographs once there has been an album, Xiaohe with her thesis once there has been research; and since plan-1.6.md F1
 * Old Ma from the noodle bar once the bakery has made a menu, and Lin from upstairs once it has written a recipe; since F2
 * Fern from the flower shop once the post office has made a card, and Mrs Wu once it has put together a newsletter; since
 * plan-1.8.md H1 Lele, a schoolgirl with exams coming, once the shop has made revision cards; since H5 Auntie Qin, who
 * keeps her household's accounts, once the print shop has made a family ledger; since H2 Duoduo's dad, once the
 * workshop has made a small game; since H3 Xiaosu, who edits a newsletter account, once the studio has drawn a comic.
 */
export function welcomeGuests(made: Made): GuestId[] {
  const brought: GuestId[] = TEMPLATES.flatMap((t) => ('guest' in t && made[t.id] ? [t.guest] : []));
  return GUEST_IDS.filter((g) => OLD_FRIENDS.includes(g) || brought.includes(g));
}

type Point = { x: number; y: number };

/** Where a guest stands to talk: at the end of the counter, facing Adeng, who stands behind it. */
export const GUEST_SPOT = { x: 285, y: 90 } as const;
/** Where Axin stands at the letter holder (road-to-1.3.md C8), right of Adeng's place there. */
export const POST_SPOT = { x: 314, y: 56 } as const;
/** Just inside the front door. */
export const GUEST_DOOR = { x: ANCHORS.door.x, y: ANCHORS.door.y } as const;
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
  private seen = new Set<GuestId>();

  constructor(now: number, private rand: () => number = Math.random) {
    this.nextAt = now + this.between(FIRST_VISIT_MS);
  }

  next(now: number, quiet: boolean, period: Period, guests: GuestId[] = OLD_FRIENDS): GuestId | null {
    if (!quiet) {
      this.nextAt = Math.max(this.nextAt, now + AFTER_WORK_MS);
      return null;
    }
    if (period === 'night' || now < this.nextAt) return null;
    this.nextAt = now + this.between(VISIT_GAP_MS);
    // Everyone comes round once, the newly welcome included; then mostly taking turns, now and then the same one again.
    const unseen = guests.filter((g) => !this.seen.has(g));
    const others = guests.filter((g) => g !== this.last);
    const from = unseen.length ? unseen : this.last && this.rand() < 0.75 ? others : guests;
    const guest = from[Math.floor(this.rand() * from.length)];
    this.last = guest;
    this.seen.add(guest);
    return guest;
  }

  private between([lo, hi]: readonly [number, number]) {
    return lo + this.rand() * (hi - lo);
  }
}

/**
 * What a guest says on this visit: one of their chats whose staff are all in the shop and whose
 * weather, holiday, season and time of day fit, preferring a festival's, then ones for today's weather,
 * season or time, without repeating until all have been heard (`used` keeps track). What the shop has made
 * comes up first too. Past the twentieth commission (`after`) each neighbour has something for the season.
 */
export function pickVisit(
  chats: Chat[], guest: GuestId, outside: { sky: Sky; holiday: Holiday | null; season: Season }, period: Period,
  present: (who: Speaker) => boolean, used: Set<string>, shop: { made: Made; done: number; lastWork?: string }, rand: () => number = Math.random,
): Chat | null {
  const fits = chats.filter((c) => c.guest === guest && (!c.period || c.period === period)
    && (!c.sky || c.sky === outside.sky) && (!c.holiday || c.holiday === outside.holiday) && (!c.season || c.season === outside.season)
    && (c.after === undefined || shop.done >= c.after)
    && (!c.made || !!shop.made[c.made]) && (!c.mentions || !!shop.lastWork)
    && c.turns.every((t) => t.speaker === guest || present(t.speaker)));
  if (!fits.length) return null;
  let fresh = fits.filter((c) => !used.has(c.id));
  if (!fresh.length) {
    for (const c of fits) used.delete(c.id);
    fresh = fits;
  }
  const festive = fresh.filter((c) => c.holiday);
  const special = fresh.filter((c) => c.sky || c.season || c.period || c.made || c.mentions);
  const from = festive.length ? festive : special.length ? special : fresh;
  const pick = from[Math.floor(rand() * from.length)];
  used.add(pick.id);
  return pick;
}
