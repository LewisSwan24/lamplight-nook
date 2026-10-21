import { strings } from '../../shared/i18n';
import type { ActorId, AnchorId } from '../../shared/types';

/** Fixed 320x180 canvas, scaled up by integer factors to fit the window. */
export const CANVAS = { width: 320, height: 180 } as const;

export type Zone = { id: AnchorId; label: string; x: number; y: number; w: number; h: number; color: number };

const Z = strings.zones;

/** The seven zones of the cafe, in canvas pixels. */
export const ZONES: Zone[] = [
  { id: 'window', label: Z.window, x: 8, y: 8, w: 72, h: 36, color: 0x34405e },
  { id: 'board', label: Z.board, x: 8, y: 56, w: 44, h: 40, color: 0x2f3b2f },
  { id: 'shelf', label: Z.shelf, x: 8, y: 116, w: 52, h: 56, color: 0x7a5236 },
  { id: 'table', label: Z.table, x: 116, y: 72, w: 88, h: 36, color: 0xa0704b },
  { id: 'corner', label: Z.corner, x: 116, y: 136, w: 64, h: 36, color: 0x6e747a },
  { id: 'counter', label: Z.counter, x: 244, y: 40, w: 36, h: 72, color: 0xb5653b },
  { id: 'door', label: Z.door, x: 284, y: 136, w: 28, h: 36, color: 0xffd27a },
];

/** Anchors: where characters stand (on the floor in front of each zone). */
export const ANCHORS: Record<AnchorId, { x: number; y: number }> = {
  window: { x: 44, y: 50 },
  board: { x: 64, y: 76 },
  shelf: { x: 70, y: 140 },
  table: { x: 160, y: 116 },
  corner: { x: 148, y: 128 },
  counter: { x: 232, y: 76 },
  door: { x: 278, y: 156 },
};

/** The central aisle. Every move goes via the aisle so characters never walk through furniture. */
export const AISLE_Y = 124;

export function pathBetween(from: { x: number; y: number }, to: AnchorId): { x: number; y: number }[] {
  const target = ANCHORS[to];
  if (from.x === target.x && from.y === target.y) return [];
  return [
    { x: from.x, y: AISLE_Y },
    { x: target.x, y: AISLE_Y },
    target,
  ].filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
}

/** Largest integer scale that fits the canvas in the viewport, at least 1. */
export function integerScale(viewW: number, viewH: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / CANVAS.width, viewH / CANVAS.height)));
}

const A = strings.actors;

export const ACTORS: { id: ActorId; name: string; color: number; home: AnchorId; w: number; h: number }[] = [
  { id: 'adeng', name: A.adeng, color: 0xb5653b, home: 'counter', w: 10, h: 20 },
  { id: 'xiaoju', name: A.xiaoju, color: 0xe98a3a, home: 'shelf', w: 9, h: 18 },
  { id: 'laoshi', name: A.laoshi, color: 0x6e747a, home: 'corner', w: 11, h: 20 },
  { id: 'cat', name: A.cat, color: 0x8a5a3c, home: 'window', w: 8, h: 6 },
];
