import { GROWTH } from './growth';
import { HOLIDAYS } from './holidays';
import { YEAR_TELLERS } from './mainstory';
import type { SceneId } from './scenes';
import { STAFF_CHAPTERS, STAFF_TELLERS } from './staffstories';
import { CHAPTERS, TELLERS } from './stories';
import { STREET_GROWTH } from './towngrow';
import type { ShopDays } from './types';

/**
 * The town's record (plan-2.0.md J8): a book on the home shop's shelf with everything the shop has seen, each with the
 * day it came. What has not come yet is still there, as a blank. Pure: the parts and their entries, from the shop's
 * days and the postcards received; the book (ui/chronicle.ts) gives them their words.
 */
export const CHRONICLE_PARTS = ['year', 'stories', 'staff', 'grown', 'holidays', 'postcards'] as const;
export type ChroniclePart = (typeof CHRONICLE_PARTS)[number];

/** One thing in the record: whose chapter and which, or what it is; the day it came, or null for a blank. */
export type ChronicleEntry = { id: string; date: string | null; who?: string; n?: number; home?: SceneId };
export type ChronicleInput = { shop: ShopDays; postcards: { name: string; home: SceneId; date: string | null }[] };

export function chronicle({ shop, postcards }: ChronicleInput): { id: ChroniclePart; entries: ChronicleEntry[] }[] {
  const town = shop.town;
  const chapters = (who: string, count: number, days: string[] = []): ChronicleEntry[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${who}-${i + 1}`, who, n: i + 1, date: days[i] ?? null }));
  const parts: Record<ChroniclePart, ChronicleEntry[]> = {
    year: YEAR_TELLERS.map((who, i) => ({ id: `year-${i + 1}`, who, n: i + 1, date: town?.year?.[i]?.day ?? null })),
    stories: TELLERS.flatMap((t) => chapters(t, CHAPTERS[t].length, town?.stories[t])),
    staff: STAFF_TELLERS.flatMap((t) => chapters(t, STAFF_CHAPTERS[t].length, town?.staff?.[t])),
    grown: [
      ...GROWTH.map((g) => ({ id: g.id, date: shop.grown.find((x) => x.id === g.id)?.date ?? null })),
      ...STREET_GROWTH.map((g) => ({ id: `street-${g.id}`, date: town?.street.find((x) => x.id === g.id)?.date ?? null })),
    ],
    holidays: HOLIDAYS.map((h) => ({ id: h, date: town?.holidays?.find((x) => x.id === h)?.date ?? null })),
    postcards: postcards.map((p, i) => ({ id: `postcard-${i + 1}`, who: p.name, home: p.home, date: p.date })),
  };
  return CHRONICLE_PARTS.map((id) => ({ id, entries: parts[id] }));
}
