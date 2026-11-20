import data from '../../../assets/sprites/town.json';
import { ROOMS, type RoomId } from '../../shared/scenes';
import type { ShopId } from '../../shared/town';
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

export const TOWN = { width: data.width, height: data.height, kerb: data.kerb, road: data.road } as const;
export const FRONTS = data.fronts as Front[];

/** The fronts one can go into: every room (D2). The bakery and the post office stay neighbours' doors. */
export const OPEN: ReadonlySet<ShopId> = new Set(ROOMS);

/**
 * What a click on a front does (D2): back into the room you came out of, into another room (the home shop is one, from
 * the others), or a word on the street. Another room waits while work goes on: only one room works at a time until D3.
 */
export function entering(id: ShopId, at: { here: RoomId; busy: boolean }): 'back' | 'visit' | 'busy' | 'closed' {
  if (id === at.here) return 'back';
  if (!OPEN.has(id)) return 'closed';
  return at.busy ? 'busy' : 'visit';
}

/** How much of the street the canvas shows at once. */
export const CAMERA_W = CANVAS.width;

/** Where feet stand at a door: on the pavement, just in front of it. */
export const doorOf = (id: ShopId): Point => ({ x: FRONTS.find((f) => f.id === id)!.door, y: TOWN.kerb + 4 });

/** The pavement, with what stands on it. */
export function streetArea(): Area {
  const obstacles: Box[] = data.props.map((p) => ({ left: p.left - 1, right: p.right + 1, top: p.top - 1, bottom: p.bottom + 1 }));
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
