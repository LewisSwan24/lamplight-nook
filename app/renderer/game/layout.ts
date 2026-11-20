import { strings } from '../../shared/i18n';
import type { ActorId, AnchorId } from '../../shared/types';
import type { RoomId } from '../../shared/scenes';
import { findPath, type Point } from './path';
import { shopArea } from './pieces';

/** Fixed 320x180 canvas, scaled up by integer factors to fit the window. */
export const CANVAS = { width: 320, height: 180 } as const;

export type Zone = { id: AnchorId; label: string; x: number; y: number; w: number; h: number };

/** Which way a character faces when standing at an anchor (the sheet's four directions). */
export type Facing = 'right' | 'up' | 'left' | 'down';

const Z = strings.zones;

/** The seven zones of the cafe, in canvas pixels; they match the furniture in assets/sprites/cafe.png. */
export const ZONES: Zone[] = [
  { id: 'window', label: Z.window, x: 16, y: 12, w: 64, h: 28 },
  { id: 'board', label: Z.board, x: 92, y: 14, w: 28, h: 23 },
  { id: 'shelf', label: Z.shelf, x: 8, y: 112, w: 48, h: 40 },
  { id: 'table', label: Z.table, x: 116, y: 72, w: 68, h: 58 },
  { id: 'corner', label: Z.corner, x: 128, y: 144, w: 32, h: 18 },
  { id: 'counter', label: Z.counter, x: 216, y: 62, w: 54, h: 32 },
  { id: 'door', label: Z.door, x: 288, y: 16, w: 15, h: 32 },
];

/** The writable slate of the blackboard in cafe.png (inside its wooden frame), where progress steps are chalked. */
export const BOARD_SLATE = { x: 94, y: 18, w: 24, h: 13 } as const;

/**
 * The back room and the post (road-to-1.3.md C8), as scripts/art/backroom.py paints them into both scenes: the letter
 * holder on the wall right of the front door, and the outbox basket on the counter (the study's right-hand desk).
 */
export const MAILSLOT = { x: 309, y: 31, w: 10, h: 12 } as const;
export const OUTBOX = { cafe: { x: 262, y: 79, w: 8, h: 5 }, study: { x: 256, y: 80, w: 8, h: 5 },
  // The shops along the street have no basket (D2): a draft lies on the counter.
  print: { x: 248, y: 80, w: 8, h: 5 }, studio: { x: 258, y: 80, w: 8, h: 5 }, workshop: { x: 258, y: 78, w: 8, h: 5 } } as const;
/** Where the cup stands on the counter in each room (its picture's top left). */
export const CUP_AT = { cafe: { x: 256, y: 64 }, study: { x: 232, y: 62 }, print: { x: 236, y: 64 }, studio: { x: 236, y: 60 }, workshop: { x: 244, y: 60 } } as const;

/** Anchors: where characters stand (feet position) and which way they face there. */
export const ANCHORS: Record<AnchorId, { x: number; y: number; facing: Facing }> = {
  window: { x: 70, y: 60, facing: 'up' },
  board: { x: 100, y: 60, facing: 'up' },
  shelf: { x: 66, y: 140, facing: 'left' },
  table: { x: 196, y: 102, facing: 'left' },
  // On the far side of the workbench from the back door, which everyone needs to get through.
  corner: { x: 118, y: 148, facing: 'right' },
  counter: { x: 228, y: 84, facing: 'down' },
  door: { x: 295, y: 56, facing: 'up' },
  // Beside the filing cabinet, as at the bookcase; and under the letter holder, left of where Axin stands.
  cabinet: { x: 88, y: 118, facing: 'left' },
  mailslot: { x: 303, y: 60, facing: 'up' },
};

/** Each character's place at an anchor, so two characters at the same spot stand side by side. */
// The shops' own people stand beside Adeng, the only one with them (D2).
const SLOT: Record<ActorId, number> = { adeng: 0, xiaoju: -1, laoshi: 1, qingdai: 2, xiaodou: -2, aqian: 1, xiaozhe: 1, xiaoding: 1, cat: 0 };
const SLOT_GAP = 12;

/** `chair`: there is a chair here, so the character can sit. */
export type Spot = { x: number; y: number; facing: Facing; chair?: boolean };

/**
 * Seats: anchors with chairs give each character a fixed spot instead of a slot.
 * The chairs are drawn into the background at these spots (scripts/art/scene.py, CHAIRS).
 * The other spots here are where a plain slot would put someone in the way of furniture or on top of someone else.
 */
export const SEATS: Partial<Record<AnchorId, Partial<Record<ActorId, Spot>>>> = {
  table: {
    adeng: { x: 196, y: 100, facing: 'left', chair: true },
    xiaoju: { x: 104, y: 100, facing: 'right', chair: true },
    // On the bench, turned towards each other.
    laoshi: { x: 140, y: 122, facing: 'right', chair: true },
    qingdai: { x: 168, y: 122, facing: 'left', chair: true },
  },
  // Qingdai's place by the blackboard, where she pins up her colour swatches, facing the room.
  // The left chair stands right under the board, so everyone else keeps to its left.
  board: {
    qingdai: { x: 116, y: 62, facing: 'down' },
    adeng: { x: 92, y: 60, facing: 'up' },
    xiaoju: { x: 80, y: 60, facing: 'up' },
    laoshi: { x: 68, y: 60, facing: 'up' },
    // In front of Adeng, clear of Qingdai, who may be at work for the other round while Adeng's crew meets (B9).
    xiaodou: { x: 96, y: 72, facing: 'up' },
  },
  // Between the bookshelf and the left chair. The cat keeps its old place by the window.
  window: {
    xiaoju: { x: 62, y: 60, facing: 'up' },
    cat: { x: 70, y: 60, facing: 'up' },
    adeng: { x: 78, y: 60, facing: 'up' },
    laoshi: { x: 86, y: 60, facing: 'up' },
    qingdai: { x: 92, y: 68, facing: 'up' },
    xiaodou: { x: 100, y: 60, facing: 'up' },
  },
  // Above the aisle: the study's sofa takes the floor below it.
  shelf: {
    laoshi: { x: 78, y: 128, facing: 'left' },
    qingdai: { x: 78, y: 140, facing: 'left' },
    // Below the others: a slot of her own would stand her behind the filing cabinet (road-to-1.3.md C8).
    xiaodou: { x: 78, y: 152, facing: 'left' },
  },
  corner: {
    qingdai: { x: 104, y: 160, facing: 'right' },
  },
  // The wall ends right of the letter holder.
  mailslot: {
    qingdai: { x: 311, y: 70, facing: 'up' },
  },
  // Clear of the plant under the door.
  door: {
    laoshi: { x: 289, y: 62, facing: 'up' },
    qingdai: { x: 295, y: 68, facing: 'up' },
  },
  // On the customers' side: Adeng is behind the counter, and it is the customers who get rubbed against.
  // The coffee machine takes the middle of the counter, so the others stand either side of it.
  counter: {
    xiaoju: { x: 216, y: 84, facing: 'down' },
    laoshi: { x: 264, y: 84, facing: 'down' },
    qingdai: { x: 276, y: 84, facing: 'left' },
    cat: { x: 226, y: 104, facing: 'right' },
    // The apprentice's own place: in front of the counter, watching Adeng work and ready to run.
    xiaodou: { x: 246, y: 106, facing: 'down' },
  },
};

/**
 * Who can work in the second crew (road-to-1.2.md B9): Qingdai, who leads it, and the helpers both crews share. Adeng
 * always leads the first.
 */
export const SECOND_CREW: ActorId[] = ['qingdai', 'xiaoju', 'laoshi', 'xiaodou'];

/**
 * The second crew's own places, part of the seating above: where its people stand while they work for the second round
 * at once. The crew takes and hands over its work at Qingdai's seat by the blackboard, so its helpers gather to her right,
 * clear of Adeng's crew on the left. In every other zone their own seat or slot is already clear of the first crew,
 * and Qingdai's own seats are hers in both crews.
 */
export const SECOND_SEATS: typeof SEATS = {
  board: {
    xiaoju: { x: 128, y: 60, facing: 'left' },
    laoshi: { x: 140, y: 62, facing: 'left' },
    xiaodou: { x: 130, y: 70, facing: 'left' },
  },
};

/** The study's own places, where its furniture differs from the shop's (docs/floor-plans.md). */
const STUDY_SEATS: typeof SEATS = {
  table: {
    // On the sofa under the reading table.
    laoshi: { x: 141, y: 125, facing: 'right', chair: true },
    qingdai: { x: 165, y: 125, facing: 'left', chair: true },
  },
  // The desk is two pieces with a gap between them: everyone keeps to a piece.
  counter: {
    adeng: { x: 232, y: 84, facing: 'down' },
    xiaoju: { x: 222, y: 84, facing: 'down' },
    laoshi: { x: 256, y: 84, facing: 'down' },
    qingdai: { x: 285, y: 84, facing: 'left' },
  },
};

/** In the shops along the street (D2), the press, the easel and the tool wall stand right of the blackboard: their person works there. */
const AT_WORK: Spot = { x: 138, y: 60, facing: 'up' };
/** At the counter's right end, turned to Adeng: the workbench is too tall to stand behind. */
const AT_COUNTER: Spot = { x: 284, y: 84, facing: 'left' };
const ROOM_SEATS: Partial<Record<RoomId, typeof SEATS>> = {
  study: STUDY_SEATS,
  print: { board: { aqian: AT_WORK }, counter: { aqian: AT_COUNTER } },
  studio: { board: { xiaozhe: AT_WORK }, counter: { xiaozhe: AT_COUNTER } },
  workshop: { board: { xiaoding: AT_WORK }, counter: { xiaoding: AT_COUNTER } },
};

/** Every fixed place in a room, its own over the shared ones. */
export function seatsIn(scene: RoomId): typeof SEATS {
  const own = ROOM_SEATS[scene];
  if (!own) return SEATS;
  const out: typeof SEATS = { ...SEATS };
  for (const [anchor, seats] of Object.entries(own)) out[anchor as AnchorId] = { ...SEATS[anchor as AnchorId], ...seats };
  return out;
}

/** Where a character's feet go at an anchor, and which way it faces there; `second`: working in the second crew (B9). */
export function standPoint(anchor: AnchorId, actor: ActorId | undefined, scene: RoomId, second = false): Spot {
  const seat = actor && ((second && SECOND_SEATS[anchor]?.[actor]) || seatsIn(scene)[anchor]?.[actor]);
  if (seat) return seat;
  const { x, y, facing } = ANCHORS[anchor];
  const d = actor ? SLOT[actor] * SLOT_GAP : 0;
  return facing === 'left' || facing === 'right' ? { x, y: y + d, facing } : { x: x + d, y, facing };
}

/** The walk across the floor from one point to another (path.ts), leaving out where it starts. */
export const walkBetween = (from: Point, to: Point, scene: RoomId): Point[] => findPath(shopArea(scene), from, to);

/** The walk from a point to an anchor. */
export function pathBetween(from: Point, to: AnchorId, actor: ActorId | undefined, scene: RoomId, second = false): Point[] {
  return walkBetween(from, standPoint(to, actor, scene, second), scene);
}

/** Largest integer scale that fits the canvas in the viewport, at least 1. */
export function integerScale(viewW: number, viewH: number, dpr = 1): number {
  // In real pixels: on a display Windows scales by 125%, 3 CSS pixels would be 3.75 real ones, and uneven.
  return Math.max(1, Math.floor(Math.min((viewW * dpr) / CANVAS.width, (viewH * dpr) / CANVAS.height))) / dpr;
}

/**
 * How much the cards and text grow on a big window: 1 up to 1280x720, then with the window, in steps of
 * 0.05, up to 1.75 (a full-screen 4K window at 100% scaling). Small windows keep 1 so text stays readable.
 */
export function uiScale(viewW: number, viewH: number): number {
  const s = Math.min(viewW / 1280, viewH / 720);
  return Math.min(1.75, Math.max(1, Math.floor(s * 20) / 20));
}

/**
 * How many CSS pixels one pixel of a toolbar icon takes: twice the window's scale, rounded so that it is always a
 * whole number of real pixels, whatever the display scale. Anything else would make the pixels uneven.
 */
export function toolIconPx(ui: number, dpr: number): number {
  return Math.round(2 * ui * dpr) / dpr;
}

const A = strings.actors;

/** `height` is how tall the visible sprite is above the feet, for placing name labels and bubbles. */
export const ACTORS: { id: ActorId; name: string; home: AnchorId; height: number }[] = [
  { id: 'adeng', name: A.adeng, home: 'counter', height: 30 },
  { id: 'xiaoju', name: A.xiaoju, home: 'shelf', height: 30 },
  { id: 'laoshi', name: A.laoshi, home: 'corner', height: 30 },
  { id: 'qingdai', name: A.qingdai, home: 'board', height: 30 },
  { id: 'xiaodou', name: A.xiaodou, home: 'counter', height: 30 },
  // Each in a shop of their own along the street (D2): at the press, the easel and the tool wall.
  { id: 'aqian', name: A.aqian, home: 'board', height: 30 },
  { id: 'xiaozhe', name: A.xiaozhe, home: 'board', height: 30 },
  { id: 'xiaoding', name: A.xiaoding, home: 'board', height: 30 },
  { id: 'cat', name: A.cat, home: 'window', height: 12 },
];
