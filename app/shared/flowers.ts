import type { Season } from './growth';
import type { GuestId } from './types';

/**
 * The flower shop's stand (plan-2.0.md J12): six vases on three wooden steps. Each morning, every vase whose flowers are
 * over gets new ones, picked from what is in season and not already on the stand. They come in as buds, open, and wilt
 * on their last day. Neighbours come in and buy one; that vase stands empty, its water still in it, until its next
 * delivery.
 *
 * What is on the stand comes from the day alone, played forward from EPOCH, so it is the same on every computer and
 * every time it is asked for. A sale only marks a bunch sold: it never changes what comes next, so old sales can be let go
 * of without changing a single later day. Pure.
 */
export const SLOTS = 6;
/** The day the stand was first filled. Each vase starts part-way through a bunch, so they do not all change together. */
const EPOCH = '2026-01-01';

type FlowerDef = { id: string; seasons: readonly Season[]; days: number };
const ALL_YEAR = ['spring', 'summer', 'autumn', 'winter'] as const;
export const FLOWERS = [
  { id: 'rose', seasons: ALL_YEAR, days: 6 },
  { id: 'carnation', seasons: ALL_YEAR, days: 7 },
  { id: 'babysbreath', seasons: ALL_YEAR, days: 8 },
  { id: 'tulip', seasons: ['spring'], days: 5 },
  { id: 'peony', seasons: ['spring', 'summer'], days: 4 },
  { id: 'freesia', seasons: ['spring'], days: 6 },
  { id: 'cherry', seasons: ['spring'], days: 4 },
  { id: 'sunflower', seasons: ['summer', 'autumn'], days: 6 },
  { id: 'lily', seasons: ['summer'], days: 7 },
  { id: 'hydrangea', seasons: ['summer'], days: 5 },
  { id: 'lotus', seasons: ['summer'], days: 3 },
  { id: 'chrysanthemum', seasons: ['autumn', 'winter'], days: 9 },
  { id: 'cosmos', seasons: ['autumn'], days: 5 },
  { id: 'dahlia', seasons: ['autumn'], days: 5 },
  { id: 'osmanthus', seasons: ['autumn'], days: 4 },
  { id: 'plum', seasons: ['winter'], days: 7 },
  { id: 'narcissus', seasons: ['winter', 'spring'], days: 6 },
  { id: 'camellia', seasons: ['winter'], days: 6 },
  { id: 'wintersweet', seasons: ['winter'], days: 8 },
] as const satisfies readonly FlowerDef[];
export type FlowerId = (typeof FLOWERS)[number]['id'];
export type Flower = (typeof FLOWERS)[number];
export const FLOWER_IDS: FlowerId[] = FLOWERS.map((f) => f.id);
export const flowerOf = (id: FlowerId | string): Flower => FLOWERS.find((f) => f.id === id)!;
export const inSeason = (f: FlowerDef, season: Season): boolean => f.seasons.includes(season);

export type Stage = 'bud' | 'open' | 'wilting';
export type Bunch = { flower: FlowerId; came: string };
export type Vase = { bunch: Bunch | null; soldTo?: GuestId };
export type FlowerSale = { day: string; slot: number; who: GuestId };

/** Which neighbours come in for flowers, in the order they think of it. */
export const BUYERS: GuestId[] = ['granny', 'student', 'mechanic', 'baker', 'postman', 'bookseller'];
/** Each one's favourites, first choice first; anyone takes something else when none of them is there. */
const LIKES: Partial<Record<GuestId, FlowerId[]>> = {
  granny: ['chrysanthemum', 'camellia', 'osmanthus', 'carnation'],
  student: ['sunflower', 'tulip', 'cosmos', 'babysbreath'],
  mechanic: ['narcissus', 'lily', 'rose'],
  baker: ['wintersweet', 'freesia', 'peony', 'dahlia'],
  postman: ['hydrangea', 'cherry', 'plum'],
  bookseller: ['plum', 'lotus', 'lily', 'babysbreath'],
};
/** Neighbours come in for flowers from OPENS to CLOSES, no more than SALES_A_DAY of them. */
export const OPENS = 8;
export const CLOSES = 19;
export const SALES_A_DAY = 3;
/** Sales older than the longest-lasting flower can no longer empty a vase on the stand. */
export const SALES_KEPT_DAYS = Math.max(...FLOWERS.map((f) => f.days));

export const seasonOfDay = (day: string): Season => {
  const m = Number(day.slice(5, 7)) - 1;
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
};

const toDays = (day: string) => Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000);
const fromDays = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => toDays(to) - toDays(from);
export const addDays = (day: string, n: number): string => fromDays(toDays(day) + n);

/** A small number from a day and a vase, the same everywhere. */
function hash(n: number, slot: number): number {
  let h = (n * 2654435761 + slot * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

export function stageOf(bunch: Bunch, day: string, flower: FlowerDef = flowerOf(bunch.flower)): Stage {
  const age = daysBetween(bunch.came, day);
  return age <= 0 ? 'bud' : age >= flower.days - 1 ? 'wilting' : 'open';
}

/** What is in each vase on each morning from EPOCH, kept as the stand is played forward. */
const played: Bunch[][] = [];
function standOn(day: string): Bunch[] {
  const n = Math.max(0, daysBetween(EPOCH, day));
  const start = toDays(EPOCH);
  while (played.length <= n) {
    const d = played.length;
    const today = fromDays(start + d);
    const season = seasonOfDay(today);
    const yesterday = played[d - 1];
    const stand: Bunch[] = [];
    for (let slot = 0; slot < SLOTS; slot++) {
      const was = yesterday?.[slot];
      // Still good this morning: it stays. Over, or the very first morning: something new.
      if (was && daysBetween(was.came, today) < flowerOf(was.flower).days) {
        stand.push(was);
        continue;
      }
      const taken = new Set([...stand.map((b) => b.flower), ...(yesterday ?? []).slice(slot + 1).map((b) => b.flower)]);
      const choice = FLOWERS.filter((f) => inSeason(f, season) && !taken.has(f.id));
      const flower = choice[hash(start + d, slot) % choice.length];
      // On the first morning each vase is already part-way through its bunch.
      const came = was ? today : fromDays(start + d - (slot % flower.days));
      stand.push({ flower: flower.id, came });
    }
    played.push(stand);
  }
  return played[n];
}

/** The stand on `day`: each vase's bunch, and who bought it if it has been sold. */
export function shelfOn(day: string, sales: readonly FlowerSale[]): Vase[] {
  return standOn(day).map((bunch, slot) => {
    const sale = sales.find((s) => s.slot === slot && s.day >= bunch.came && s.day <= day);
    return sale ? { bunch, soldTo: sale.who } : { bunch };
  });
}

/** Who bought what on `day`, in the order they came. */
export function soldOn(day: string, sales: readonly FlowerSale[]): { who: GuestId; flower: FlowerId }[] {
  const stand = standOn(day);
  return sales.filter((s) => s.day === day).map((s) => ({ who: s.who, flower: stand[s.slot].flower }));
}

/**
 * The next neighbour to come in for flowers, and which vase they take: while the shop is open, up to SALES_A_DAY a day,
 * someone who has not been in today, for a favourite if one is out, else anything open. Never a wilting bunch, and
 * nobody comes for an empty stand.
 */
export function nextBuyer(at: { day: string; hour: number }, sales: readonly FlowerSale[]): { who: GuestId; slot: number } | null {
  if (at.hour < OPENS || at.hour >= CLOSES) return null;
  const today = sales.filter((s) => s.day === at.day);
  if (today.length >= SALES_A_DAY) return null;
  const shelf = shelfOn(at.day, sales);
  const fresh = shelf.flatMap((v, slot) => (v.bunch && !v.soldTo && stageOf(v.bunch, at.day) !== 'wilting' ? [{ slot, flower: v.bunch.flower }] : []));
  if (!fresh.length) return null;
  const came = new Set(today.map((s) => s.who));
  const waiting = BUYERS.filter((b) => !came.has(b));
  if (!waiting.length) return null;
  const who = waiting[hash(toDays(at.day), today.length) % waiting.length];
  const likes = LIKES[who] ?? [];
  const liked = fresh.find((f) => likes.includes(f.flower));
  return { who, slot: (liked ?? fresh[hash(toDays(at.day) + 1, today.length) % fresh.length]).slot };
}

/** The sales after one more, the ones too old to matter let go of. */
export function withSale(sales: readonly FlowerSale[], sale: FlowerSale): FlowerSale[] {
  return [...sales, sale].filter((s) => daysBetween(s.day, sale.day) < SALES_KEPT_DAYS);
}
