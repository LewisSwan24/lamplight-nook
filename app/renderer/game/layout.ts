import { strings } from '../../shared/i18n';
import type { ActorId, AnchorId } from '../../shared/types';
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
  { id: 'counter', label: Z.counter, x: 216, y: 46, w: 54, h: 32 },
  { id: 'door', label: Z.door, x: 288, y: 16, w: 15, h: 32 },
];

/** The writable slate of the blackboard in cafe.png (inside its wooden frame), where progress steps are chalked. */
export const BOARD_SLATE = { x: 94, y: 18, w: 24, h: 13 } as const;

/** Anchors: where characters stand (feet position) and which way they face there. */
export const ANCHORS: Record<AnchorId, { x: number; y: number; facing: Facing }> = {
  window: { x: 70, y: 60, facing: 'up' },
  board: { x: 100, y: 60, facing: 'up' },
  shelf: { x: 66, y: 140, facing: 'left' },
  table: { x: 196, y: 102, facing: 'left' },
  corner: { x: 170, y: 160, facing: 'left' },
  counter: { x: 244, y: 98, facing: 'down' },
  door: { x: 295, y: 56, facing: 'up' },
};

/** Each character's place at an anchor, so two characters at the same spot stand side by side. */
const SLOT: Record<ActorId, number> = { adeng: 0, xiaoju: -1, laoshi: 1, qingdai: 2, cat: 0 };
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
    // No third chair fits; Laoshi stands at Adeng's shoulder, Qingdai at Xiaoju's.
    laoshi: { x: 212, y: 114, facing: 'left' },
    qingdai: { x: 90, y: 114, facing: 'right' },
  },
  // Qingdai's place by the blackboard, where she pins up her colour swatches, facing the room.
  // The left chair stands right under the board, so everyone else keeps to its left.
  board: {
    qingdai: { x: 116, y: 62, facing: 'down' },
    adeng: { x: 92, y: 60, facing: 'up' },
    xiaoju: { x: 80, y: 60, facing: 'up' },
    laoshi: { x: 68, y: 60, facing: 'up' },
  },
  // Between the bookshelf and the left chair. The cat keeps its old place by the window.
  window: {
    xiaoju: { x: 62, y: 60, facing: 'up' },
    cat: { x: 70, y: 60, facing: 'up' },
    adeng: { x: 78, y: 60, facing: 'up' },
    laoshi: { x: 86, y: 60, facing: 'up' },
    qingdai: { x: 92, y: 68, facing: 'up' },
  },
  // Above the aisle: the study's sofa takes the floor below it.
  shelf: {
    laoshi: { x: 78, y: 128, facing: 'left' },
    qingdai: { x: 78, y: 140, facing: 'left' },
  },
  corner: {
    qingdai: { x: 182, y: 160, facing: 'left' },
  },
  // Clear of the plant under the door.
  door: {
    laoshi: { x: 289, y: 62, facing: 'up' },
    qingdai: { x: 295, y: 68, facing: 'up' },
  },
  // By Adeng's feet, close enough to rub against a leg.
  counter: {
    cat: { x: 236, y: 106, facing: 'right' },
  },
};

/** Where a character's feet go at an anchor, and which way it faces there. */
export function standPoint(anchor: AnchorId, actor?: ActorId): Spot {
  const seat = actor && SEATS[anchor]?.[actor];
  if (seat) return seat;
  const { x, y, facing } = ANCHORS[anchor];
  const d = actor ? SLOT[actor] * SLOT_GAP : 0;
  return facing === 'left' || facing === 'right' ? { x, y: y + d, facing } : { x: x + d, y, facing };
}

/** The walk across the floor from one point to another (path.ts), leaving out where it starts. */
export const walkBetween = (from: Point, to: Point, scene?: 'cafe' | 'study'): Point[] => findPath(shopArea(scene), from, to);

/** The walk from a point to an anchor. */
export function pathBetween(from: Point, to: AnchorId, actor?: ActorId, scene?: 'cafe' | 'study'): Point[] {
  return walkBetween(from, standPoint(to, actor), scene);
}

/** Largest integer scale that fits the canvas in the viewport, at least 1. */
export function integerScale(viewW: number, viewH: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / CANVAS.width, viewH / CANVAS.height)));
}

/**
 * How much the cards and text grow on a big window: 1 up to 1280x720, then with the window, in steps of
 * 0.05, up to 1.75 (a full-screen 4K window at 100% scaling). Small windows keep 1 so text stays readable.
 */
export function uiScale(viewW: number, viewH: number): number {
  const s = Math.min(viewW / 1280, viewH / 720);
  return Math.min(1.75, Math.max(1, Math.floor(s * 20) / 20));
}

const A = strings.actors;

/** `height` is how tall the visible sprite is above the feet, for placing name labels and bubbles. */
export const ACTORS: { id: ActorId; name: string; home: AnchorId; height: number }[] = [
  { id: 'adeng', name: A.adeng, home: 'counter', height: 30 },
  { id: 'xiaoju', name: A.xiaoju, home: 'shelf', height: 30 },
  { id: 'laoshi', name: A.laoshi, home: 'corner', height: 30 },
  { id: 'qingdai', name: A.qingdai, home: 'board', height: 30 },
  { id: 'cat', name: A.cat, home: 'window', height: 12 },
];
