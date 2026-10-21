import { strings } from '../../shared/i18n';
import type { ActorId, AnchorId } from '../../shared/types';

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

/** The free aisle across the room. Every move goes via the aisle so characters never walk through furniture. */
export const AISLE_Y = 136;

/** Each character's place at an anchor, so two characters at the same spot stand side by side. */
const SLOT: Record<ActorId, number> = { adeng: 0, xiaoju: -1, laoshi: 1, cat: 0 };
const SLOT_GAP = 12;

/** Where a character's feet go at an anchor: beside the others, across the way they face. */
export function standPoint(anchor: AnchorId, actor?: ActorId): { x: number; y: number } {
  const { x, y, facing } = ANCHORS[anchor];
  const d = actor ? SLOT[actor] * SLOT_GAP : 0;
  return facing === 'left' || facing === 'right' ? { x, y: y + d } : { x: x + d, y };
}

export function pathBetween(from: { x: number; y: number }, to: AnchorId, actor?: ActorId): { x: number; y: number }[] {
  const { x, y } = standPoint(to, actor);
  if (from.x === x && from.y === y) return [];
  return [
    { x: from.x, y: AISLE_Y },
    { x, y: AISLE_Y },
    { x, y },
  ].filter((p, i, arr) => (i === 0 ? p.y !== from.y : p.x !== arr[i - 1].x || p.y !== arr[i - 1].y));
}

/** Largest integer scale that fits the canvas in the viewport, at least 1. */
export function integerScale(viewW: number, viewH: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / CANVAS.width, viewH / CANVAS.height)));
}

const A = strings.actors;

/** `height` is how tall the visible sprite is above the feet, for placing name labels and bubbles. */
export const ACTORS: { id: ActorId; name: string; home: AnchorId; height: number }[] = [
  { id: 'adeng', name: A.adeng, home: 'counter', height: 30 },
  { id: 'xiaoju', name: A.xiaoju, home: 'shelf', height: 30 },
  { id: 'laoshi', name: A.laoshi, home: 'corner', height: 30 },
  { id: 'cat', name: A.cat, home: 'window', height: 12 },
];
