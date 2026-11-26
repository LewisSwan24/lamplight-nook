import type { StreetShop } from './dispatch';
import type { Made } from './growth';
import { TEMPLATES, type BroughtRoomId, type TemplateId } from './templates';
import { ROOMS, type RoomId, type SceneId } from './scenes';
import type { TownDays } from './town';

/**
 * The town grows with the work (road-to-1.4.md D5). The street by everything done together: two lamps, a bench, tubs of
 * flowers on the pavement, then a stall, a little park and a fountain in the lot between the workshop and the bakery.
 * Each front by its own shop's work: a pot by the door, a new sign, a string of flags. Inside, each shop along the street
 * gathers four pieces of its own. What is shown follows the counts, like the beds behind the shop, so a shop from before
 * 1.4 opens onto a street that has grown already; memory.ts writes down the day each piece came.
 * Where each piece stands: scripts/art/town.py (town.json) and scripts/art/growth.py (the rooms' overlays).
 */
export const STREET_GROWTH = [
  { id: 'lamps', at: 3 },
  { id: 'bench', at: 6 },
  { id: 'flowers', at: 10 },
  { id: 'stall', at: 20 },
  { id: 'park', at: 40 },
  { id: 'fountain', at: 70 },
] as const;
export type StreetPiece = (typeof STREET_GROWTH)[number]['id'];

export const FRONT_GROWTH = [
  { id: 'pot', at: 2 },
  { id: 'sign', at: 8 },
  { id: 'bunting', at: 20 },
] as const;
export type FrontPiece = (typeof FRONT_GROWTH)[number]['id'];

export const ROOM_GROWTH = {
  print: [{ id: 'proof', at: 1 }, { id: 'ivy', at: 3 }, { id: 'typecase', at: 8 }, { id: 'ribbon', at: 20 }],
  studio: [{ id: 'sketch', at: 1 }, { id: 'ivy', at: 3 }, { id: 'palette', at: 8 }, { id: 'gallery', at: 20 }],
  workshop: [{ id: 'gear', at: 1 }, { id: 'ivy', at: 3 }, { id: 'clock', at: 8 }, { id: 'blueprint', at: 20 }],
  // The bakery (plan-1.6.md F1): a sheaf of wheat, the ivy, a rolling pin on its hook, a string of little loaves.
  bakery: [{ id: 'wheat', at: 1 }, { id: 'ivy', at: 3 }, { id: 'pin', at: 8 }, { id: 'garland', at: 20 }],
  // The post office (plan-1.6.md F2): the first stamp framed, the ivy, a brass post horn, a map of the rounds.
  post: [{ id: 'stamp', at: 1 }, { id: 'ivy', at: 3 }, { id: 'horn', at: 8 }, { id: 'map', at: 20 }],
} as const satisfies Record<StreetShop, readonly { id: string; at: number }[]>;
/**
 * Pieces a kind of work brings into the shop along the street that does it (plan-1.8.md H5), counted by that kind
 * rather than by the shop's own count: a family ledger lying on the print shop's counter. The templates say which.
 */
export const ROOM_WORK: { shop: StreetShop; id: BroughtRoomId; at: number; work: TemplateId }[] = TEMPLATES.flatMap((t) =>
  ('roomGrowth' in t ? [{ shop: ('then' in t ? t.then : t.shop) as StreetShop, id: t.roomGrowth.id, at: t.roomGrowth.at, work: t.id }] : []));
export type RoomPiece<S extends StreetShop = StreetShop> = (typeof ROOM_GROWTH)[S][number]['id'] | BroughtRoomId;
/** Everything a shop along the street can come to have in its room: its own four, then what its kinds of work bring. */
export const roomPieceIds = (shop: StreetShop): RoomPiece[] => [...ROOM_GROWTH[shop].map((g) => g.id), ...ROOM_WORK.filter((g) => g.shop === shop).map((g) => g.id)];

const due = <T extends { id: string; at: number }>(pieces: readonly T[], count: number): T['id'][] =>
  pieces.filter((g) => count >= g.at).map((g) => g.id);

export const streetGrown = (done: number): StreetPiece[] => due(STREET_GROWTH, done);
export const frontGrown = (count: number): FrontPiece[] => due(FRONT_GROWTH, count);
/** A shop's pieces by its own count, and those its kinds of work bring by how many of each kind there have been. */
export const roomGrown = (shop: StreetShop, count: number, made: Made = {}): RoomPiece[] => [
  ...due<{ id: RoomPiece; at: number }>(ROOM_GROWTH[shop], count),
  ...ROOM_WORK.filter((g) => g.shop === shop && (made[g.work] ?? 0) >= g.at).map((g) => g.id),
];

const STREET_SHOPS = Object.keys(ROOM_GROWTH) as StreetShop[];
export const isStreetShop = (room: RoomId): room is StreetShop => (STREET_SHOPS as string[]).includes(room);

/** Everything done, and how much of it each room's shop did. */
export type TownCounts = { total: number; shops: Record<RoomId, number> };

/**
 * How much each shop has done. The home shop's `done` counts every commission, as it always has (the apprentice, the
 * beds and the plaque go by it); a shop along the street counts its own too. The home shop's own is what is left over.
 * The other of the cafe and the study is nobody's shop: nothing is sent there.
 */
export function townCounts(days: { done: number; town?: TownDays }, home: SceneId): TownCounts {
  const shops = Object.fromEntries(ROOMS.map((r) => [r, 0])) as Record<RoomId, number>;
  for (const s of STREET_SHOPS) shops[s] = days.town?.shops[s]?.done ?? 0;
  shops[home] = days.done - STREET_SHOPS.reduce((n, s) => n + shops[s], 0);
  return { total: days.done, shops };
}

export type TownNews = { line: string; shop?: RoomId };

/**
 * What came with the last commission, as the lines that mention it: on the street, at a front, inside a shop. `made`,
 * how many of each kind of work there were before and after, brings in what a kind of work put in a shop (H5).
 */
export function townNews(before: TownCounts, after: TownCounts, made: { before: Made; after: Made } = { before: {}, after: {} }): TownNews[] {
  const fresh = <T extends string>(was: T[], now: T[]) => now.filter((id) => !was.includes(id));
  const out: TownNews[] = fresh(streetGrown(before.total), streetGrown(after.total)).map((id) => ({ line: `grow_street_${id}` }));
  for (const room of ROOMS) {
    for (const id of fresh(frontGrown(before.shops[room]), frontGrown(after.shops[room]))) out.push({ line: `grow_front_${id}`, shop: room });
  }
  for (const room of ROOMS) {
    if (!isStreetShop(room)) continue;
    for (const id of fresh(roomGrown(room, before.shops[room], made.before), roomGrown(room, after.shops[room], made.after))) out.push({ line: `grow_${room}_${id}` });
  }
  return out;
}
