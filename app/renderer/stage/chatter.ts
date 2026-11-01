import type { Period } from '../game/daytime';
import type { Holiday, Sky } from '../game/weather';
import type { ActorId } from '../../shared/types';
import type { Chat, Line } from '../translator/lines';

/** At least this long between two chats, and before the first one. */
export const CHAT_GAP_MS = 120_000;
/** A single character muttering to themselves: once every 3 to 5 minutes at most. */
export const MUTTER_GAP_MS = [180_000, 300_000] as const;
/** Keep a mutter clear of a chat on either side. */
const QUIET_AROUND_CHAT_MS = 30_000;

/**
 * What the shop is doing right now, as far as small talk is concerned:
 * idle (no commission), waiting (a long command runs), working (busy, so nobody chats),
 * blocked (a decision or serious card is open, or the window is hidden).
 */
export type ShopMood = 'idle' | 'waiting' | 'working' | 'blocked';

export type Talk = { kind: 'chat' | 'mutter'; id: string; turns: { speaker: ActorId; text: string }[]; once?: boolean };

/** How far the shop has come with the user: commissions finished together, and the one-off stories already told. */
export type ShopProgress = { done: number; told: ReadonlySet<string> };
const NEW_SHOP: ShopProgress = { done: 0, told: new Set() };

/** Draws without repeats until every item has been used once, then starts a fresh round. */
class Bag<T extends { id: string }> {
  private used = new Set<string>();
  constructor(private rand: () => number) {}

  /** `first`: items to pick before any other, while some of them have not been used this round. */
  draw(items: T[], first: (item: T) => boolean = () => false): T | undefined {
    if (!items.length) return undefined;
    const freshFirst = items.filter((i) => first(i) && !this.used.has(i.id));
    if (freshFirst.length) {
      const pick = freshFirst[Math.floor(this.rand() * freshFirst.length)];
      this.used.add(pick.id);
      return pick;
    }
    let fresh = items.filter((i) => !this.used.has(i.id));
    if (!fresh.length) {
      for (const i of items) this.used.delete(i.id);
      fresh = items;
    }
    const pick = fresh[Math.floor(this.rand() * fresh.length)];
    this.used.add(pick.id);
    return pick;
  }
}

/**
 * Small talk scheduler (story.md section 4 and 5.13): pick a chat or a mutter when the shop is quiet,
 * never more often than the gaps allow, and without repeating until everything has been heard.
 * Pure: the caller asks `next` every few seconds and plays what comes back.
 */
export class Chatter {
  private chats: Bag<Chat>;
  private mutters: Bag<Line>;
  private lastChat: number;
  private lastMutter: number;
  private mutterGap: number;

  constructor(
    private allChats: Chat[],
    private allMutters: Line[],
    now: number,
    private rand: () => number = Math.random,
  ) {
    this.chats = new Bag(rand);
    this.mutters = new Bag(rand);
    // Nobody talks the moment the shop opens.
    this.lastChat = now;
    this.lastMutter = now;
    this.mutterGap = this.pickMutterGap();
  }

  /** Swap the libraries (hot reload); what was already said stays said. */
  reload(chats: Chat[], mutters: Line[]) {
    this.allChats = chats;
    this.allMutters = mutters;
  }

  /**
   * Something to say now, or null. `period` filters chats tied to a time of day, `outside` those tied to
   * the weather or a holiday; those come up before the everyday ones, since they only fit for a while.
   * `shop` unlocks chats that need a few commissions done together; a one-off story not yet told comes first.
   */
  next(mood: ShopMood, now: number, period: Period, outside: { sky: Sky; holiday: Holiday | null } = { sky: 'clear', holiday: null }, shop: ShopProgress = NEW_SHOP): Talk | null {
    if (mood === 'blocked' || mood === 'working') return null;
    if (now - this.lastChat >= CHAT_GAP_MS) {
      // Neighbours' visits are played when they drop in (game/guests.ts), not here.
      const fits = this.allChats.filter((c) => !c.guest && c.when === mood && (!c.period || c.period === period)
        && (!c.sky || c.sky === outside.sky) && (!c.holiday || c.holiday === outside.holiday)
        && (c.after === undefined || shop.done >= c.after) && !(c.once && shop.told.has(c.id)));
      const chat = this.chats.draw(fits, (c) => !!(c.sky || c.holiday || c.once || c.scene));
      if (chat) {
        this.lastChat = now;
        return { kind: 'chat', id: chat.id, turns: chat.turns as Talk['turns'], ...(chat.once ? { once: true } : {}) };
      }
    }
    if (mood === 'idle' && now - this.lastMutter >= this.mutterGap && now - this.lastChat >= QUIET_AROUND_CHAT_MS
      && CHAT_GAP_MS - (now - this.lastChat) >= QUIET_AROUND_CHAT_MS) {
      const line = this.mutters.draw(this.allMutters);
      if (line) {
        this.lastMutter = now;
        this.mutterGap = this.pickMutterGap();
        return { kind: 'mutter', id: line.id, turns: line.bubbles.map((text) => ({ speaker: line.speaker, text })) };
      }
    }
    return null;
  }

  private pickMutterGap() {
    const [lo, hi] = MUTTER_GAP_MS;
    return lo + this.rand() * (hi - lo);
  }
}
