import type { StreetShop } from './dispatch';
import { FURNISH_CHOICES, FURNISH_PARTS, cleanFurnishings, type Furnishings } from './furnish';
import { GROWTH, type GrowthId } from './growth';
import { SCENES, type SceneId } from './scenes';
import { CHAPTERS, TELLERS, type Teller } from './stories';
import type { TownDays } from './town';
import { ROOM_GROWTH } from './towngrow';
import type { ShopDays } from './types';

/**
 * A postcard of the shop (docs/plan-1.5.md E3): what makes it look the way it does, for a friend to walk round in their
 * own copy of the app. The name the user goes by, where the home shop is, how both rooms are furnished, what the shop has
 * gathered, how much each shop on the street has done and how far each neighbour's story has got. No dates, no works,
 * no commissions, no spending: what has grown is drawn from the counts, as it is at home.
 */
export type Postcard = {
  name: string;
  home: SceneId;
  furnish: Furnishings;
  grown: GrowthId[];
  done: number;
  shops: Record<StreetShop, number>;
  stories: Record<Teller, number>;
};

/** The mark a postcard file opens with, and the only version there is. */
const MARK = 'lamplight-nook';
const VERSION = 1;
/** A postcard is a few hundred bytes; anything past this is not read at all. */
export const POSTCARD_MAX_BYTES = 64 * 1024;
export const POSTCARD_NAME_MAX = 40;
/** More commissions than any shop will finish. */
const DONE_MAX = 100_000;

const STREET_SHOPS = Object.keys(ROOM_GROWTH) as StreetShop[];
/**
 * The shops a postcard from 1.5 counts: the bakery and the post office opened in 1.6 (plan-1.6.md F1, F2), so there it has
 * done nothing.
 */
const STREET_SHOPS_1_5: StreetShop[] = ['print', 'studio', 'workshop'];
const GROWTH_IDS = new Set<string>(GROWTH.map((g) => g.id));
const KEYS = ['postcard', 'version', 'name', 'home', 'furnish', 'grown', 'done', 'shops', 'stories'];

/** The name, cut to what a postcard holds. */
const shortName = (name: string) => [...name.replace(/\p{Cc}/gu, ' ').trim()].slice(0, POSTCARD_NAME_MAX).join('').trim();

export function makePostcard(name: string, settings: { scene: SceneId; furnish: Furnishings }, days: ShopDays): Postcard {
  const town = days.town;
  return {
    name: shortName(name),
    home: settings.scene,
    furnish: cleanFurnishings(settings.furnish),
    grown: [...new Set(days.grown.map((g) => g.id))].filter((id) => GROWTH_IDS.has(id)),
    done: days.done,
    shops: Object.fromEntries(STREET_SHOPS.map((s) => [s, town?.shops[s]?.done ?? 0])) as Record<StreetShop, number>,
    stories: Object.fromEntries(TELLERS.map((t) => [t, Math.min(town?.stories[t]?.length ?? 0, CHAPTERS[t].length)])) as Record<Teller, number>,
  };
}

/** The file's text: the mark and version first, so it says what it is to anyone who opens it. */
export const postcardText = (card: Postcard): string =>
  `${JSON.stringify({ postcard: MARK, version: VERSION, ...card }, null, 1)}\n`;

export type PostcardRead = { ok: true; card: Postcard } | { ok: false; reason: 'notPostcard' | 'broken' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Exactly these keys, none missing and none more. */
const exactly = (o: Record<string, unknown>, keys: readonly string[]) => {
  const have = Object.keys(o);
  return have.length === keys.length && keys.every((k) => Object.hasOwn(o, k));
};
const count = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/**
 * Someone else's file, read as data only: every key and every name must be one the shop knows, every number whole and in
 * range. Anything else and the postcard does not open; nothing in it is ever fixed up or guessed at.
 */
export function readPostcard(text: string): PostcardRead {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notPostcard' };
  }
  if (!isObject(o) || o.postcard !== MARK) return { ok: false, reason: 'notPostcard' };
  const card = check(o);
  return card ? { ok: true, card } : { ok: false, reason: 'broken' };
}

function check(o: Record<string, unknown>): Postcard | null {
  if (!exactly(o, KEYS) || o.version !== VERSION) return null;
  const { name, home, furnish, grown, done, shops, stories } = o;
  if (typeof name !== 'string' || /\p{Cc}/u.test(name) || name.trim() !== name) return null;
  const length = [...name].length;
  if (length < 1 || length > POSTCARD_NAME_MAX) return null;
  if (!(SCENES as readonly unknown[]).includes(home)) return null;
  if (!isObject(furnish) || !exactly(furnish, SCENES)) return null;
  for (const scene of SCENES) {
    const f = furnish[scene];
    if (!isObject(f) || !exactly(f, FURNISH_PARTS)) return null;
    for (const part of FURNISH_PARTS) if (!(FURNISH_CHOICES[part] as readonly unknown[]).includes(f[part])) return null;
  }
  if (!Array.isArray(grown) || grown.some((id) => typeof id !== 'string' || !GROWTH_IDS.has(id)) || new Set(grown).size !== grown.length) return null;
  if (!count(done, DONE_MAX)) return null;
  if (!isObject(shops)) return null;
  if (exactly(shops, STREET_SHOPS_1_5)) Object.assign(shops, { bakery: 0, post: 0 });
  if (!exactly(shops, STREET_SHOPS) || !STREET_SHOPS.every((s) => count(shops[s], done))) return null;
  if (STREET_SHOPS.reduce((n, s) => n + (shops[s] as number), 0) > done) return null;
  if (!isObject(stories) || !exactly(stories, TELLERS) || !TELLERS.every((t) => count(stories[t], CHAPTERS[t].length))) return null;
  return {
    name, home: home as SceneId, furnish: furnish as Furnishings, grown: grown as GrowthId[], done,
    shops: shops as Record<StreetShop, number>, stories: stories as Record<Teller, number>,
  };
}

/** The postcard as the shop's own days, for drawing: the counts the town grows by, and each story told so far (undated). */
export function postcardDays(card: Postcard): { done: number; grown: GrowthId[]; town: TownDays } {
  return {
    done: card.done,
    grown: [...card.grown],
    town: {
      shops: Object.fromEntries(STREET_SHOPS.map((s) => [s, { done: card.shops[s], grown: [] }])),
      street: [],
      stories: Object.fromEntries(TELLERS.map((t) => [t, Array<string>(card.stories[t]).fill('')])),
    },
  };
}

/** How many opened postcards the post office keeps on its wall (plan-1.6.md F2). */
export const KEPT_MAX = 6;

/**
 * The wall after one more postcard is opened: it goes first, and the very same card, opened again, moves up instead of
 * hanging twice. A later card from the same friend is a different picture of their shop, so both stay. The oldest goes
 * when the wall is full.
 */
export function keepPostcard(wall: readonly Postcard[], card: Postcard): Postcard[] {
  const text = postcardText(card);
  return [card, ...wall.filter((c) => postcardText(c) !== text)].slice(0, KEPT_MAX);
}

/** What the wall shows of each card: who sent it and where their shop is. */
export const wallCards = (wall: readonly Postcard[]): { name: string; home: SceneId }[] => wall.map((c) => ({ name: c.name, home: c.home }));
