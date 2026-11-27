import data from '../../../assets/sprites/town.json';
import river from '../../../assets/sprites/river.json';
import { ROOMS, type RoomId } from '../../shared/scenes';
import type { ShopId, StreetId } from '../../shared/town';
import type { ActorId } from '../../shared/types';
import { CANVAS } from './layout';
import { WALK_SPEED } from './life';
import { type Area, type Box, findPath, type Point } from './path';

/**
 * The town's street (road-to-1.4.md D1): seven shop fronts along a pavement, wider than the canvas, so the camera
 * pans along it. Where each front and door is comes from scripts/art/town.py, which draws them (assets/sprites/town.json).
 */

export type { ShopId };
export type Front = { id: ShopId; x: number; w: number; door: number };

/**
 * The street along the river (plan-2.0.md J1, scripts/art/river.py), put on at the end of the first street: it starts at
 * `x`, with the bridge, and its fronts, tower and props are where river.json has them, moved along by `x`.
 */
export const RIVER = { x: data.width, width: river.width, bridge: { x: data.width + river.bridge.x, w: river.bridge.w }, tower: { ...river.tower, x: data.width + river.tower.x } } as const;
/** The whole town end to end: the first street, then the river street. */
export const TOWN = { width: data.width + river.width, height: data.height, kerb: data.kerb, road: data.road } as const;
export const FRONTS = [...(data.fronts as Front[]), ...(river.fronts as Front[]).map((f) => ({ ...f, x: RIVER.x + f.x, door: RIVER.x + f.door }))];

/** Which street a point along the town is on: the bridge still belongs to the first. */
export const streetAt = (x: number): StreetId => (x < RIVER.bridge.x + RIVER.bridge.w ? 'main' : 'river');

/** The fronts one can go into: every room (D2). The bakery and the post office stay neighbours' doors. */
export const OPEN: ReadonlySet<ShopId> = new Set(ROOMS);

/**
 * What a click on a front does (D2): back into the room you came out of, into another room (the home shop is one, from
 * the others), or a word on the street. Every room keeps working while you are elsewhere (D3), so any can be gone into.
 */
export function entering(id: ShopId, at: { here: RoomId }): 'back' | 'visit' | 'closed' {
  if (id === at.here) return 'back';
  return OPEN.has(id) ? 'visit' : 'closed';
}

export { roomFor } from '../../shared/dispatch';

/**
 * Whether the view goes to the shop of a round that just started (D3): only one the user placed, and only if they have
 * not gone into another room or out on the street since. Once they walk off, nothing pulls them back.
 */
export const followsOrder = (at: { placedAt?: number; movedAt: number }): boolean => at.placedAt !== undefined && at.movedAt <= at.placedAt;

/** How much of the street the canvas shows at once. */
export const CAMERA_W = CANVAS.width;

/** Where feet stand at a door: on the pavement, just in front of it. */
export const doorOf = (id: ShopId): Point => ({ x: FRONTS.find((f) => f.id === id)!.door, y: TOWN.kerb + 4 });

/**
 * The pavement, with what stands on it: what is there from the start, and what grows there (D5), grown or not, so a
 * walk stays the same as the town grows.
 */
export function streetArea(): Area {
  const feet = [
    ...data.props,
    ...data.grow.flatMap((p) => ('foot' in p && p.foot ? [p.foot] : [])),
    ...river.props.map((p) => ({ ...p, left: RIVER.x + p.left, right: RIVER.x + p.right })),
  ];
  const obstacles: Box[] = feet.map((p) => ({ left: p.left - 1, right: p.right + 1, top: p.top - 1, bottom: p.bottom + 1 }));
  return { left: 4, right: TOWN.width - 4, top: TOWN.kerb + 4, bottom: TOWN.road - 4, obstacles };
}

/** A walk along the pavement. */
export const streetWalk = (from: Point, to: Point): Point[] => findPath(streetArea(), from, to);

/** The front at a point on the street, if the point is on a building. */
export function frontAt(x: number, y: number): ShopId | null {
  if (y >= TOWN.kerb) return null;
  return FRONTS.find((f) => x >= f.x && x < f.x + f.w)?.id ?? null;
}

/** How far the camera scrolls so that x sits in the middle, without showing past either end. */
export const cameraFor = (x: number): number => Math.round(Math.min(Math.max(x - CAMERA_W / 2, 0), TOWN.width - CAMERA_W));

/** The four who opened the shop, who carry it onto the street (road-to-1.4.md D7). */
export const MOVERS: ActorId[] = ['adeng', 'xiaoju', 'laoshi', 'qingdai'];
/** Between one mover setting off and the next. */
const PARADE_GAP_MS = 900;
/** How far past the right of the view they set off, so they walk in rather than appear. */
const OFFSTAGE = 12;

export type ParadeStep = { actor: ActorId; from: number; to: number; delay: number; ms: number };

/** Each mover walks along the pavement from beyond the right of the view to the shop's door, one after another, at their own pace. */
export function paradePlan(actors: ActorId[], at: ShopId): ParadeStep[] {
  const to = doorOf(at).x;
  const from = cameraFor(to) + CAMERA_W + OFFSTAGE;
  return actors.map((actor, i) => ({ actor, from, to, delay: i * PARADE_GAP_MS, ms: ((from - to) / WALK_SPEED[actor]) * 1000 }));
}
