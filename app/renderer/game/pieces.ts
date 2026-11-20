import data from '../../../assets/sprites/pieces.json';
import { currentScene, type RoomId } from '../../shared/scenes';
import type { Area, Box } from './path';

/**
 * The furniture standing in the room (scripts/art/pieces.py): each piece is drawn at the depth of its foot, so anyone
 * whose feet are higher up the screen walks behind it.
 */
export const pieceData = (scene: RoomId) => data[scene];
const here = data[currentScene()];
export const PIECES = here.pieces;
type Piece = (typeof PIECES)[number];

/** Above the counter's piece: what stands on the counter (the cup, the slip, the bell). */
export const COUNTER_TOP = PIECES.find((p) => p.name === 'counter')!.base + 0.1;

/** An overlay image lying on a piece of furniture goes just above it; the others stay at the depth they ask for. */
export const overlayDepth = (key: string, otherwise: number): number => (here.on as Record<string, number>)[key] ?? otherwise;

/** What walkers go round in a scene: the floor under all its furniture, and whatever a holiday stands on the floor, in or out of season, so a walk stays the same all year. */
export function shopArea(scene: RoomId = currentScene()): Area {
  const box = (p: Piece): Box => ({ left: p.x - 1, right: p.x + p.w + 1, top: p.y + p.h - p.foot - 1, bottom: p.y + p.h + 1 });
  const pieces = data[scene].pieces;
  const obstacles = pieces.map(box);
  // Nobody squeezes between the table and its bench.
  const bench = pieces.find((p) => p.name === 'bench');
  const table = pieces.find((p) => p.name === 'table')!;
  if (bench) obstacles.push({ left: table.x - 1, right: table.x + table.w + 1, top: table.y + table.h - 1, bottom: bench.y + 1 });
  return { left: 6, right: 314, top: 50, bottom: 176, obstacles: [...obstacles, ...data[scene].decor] };
}
