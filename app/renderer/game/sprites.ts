import type { ActorId, GuestId } from '../../shared/types';
import type { Facing } from './layout';

/**
 * Frame layout of the LimeZu character generator sheets (assets/sprites/<staff>.png):
 * 56 frames of 16x32 per row; directional animations hold right, up, left, down in that order.
 */
export const STAFF_FRAME = { width: 16, height: 32, perRow: 56 } as const;
export const CAT_FRAME = { width: 48, height: 16 } as const;

export const DIRECTIONS: Facing[] = ['right', 'up', 'left', 'down'];

type StaffAnim = {
  row: number;
  /** Frames per direction. */
  frames: number;
  fps: number;
  repeat: number;
  /** Directions the sheet has; front-only animations ignore facing. */
  dirs: Facing[] | 'front';
};

/** Staff animations by name; names match `available` in rules/anim-fallback.yaml. */
export const STAFF_ANIMS: Record<string, StaffAnim> = {
  idle: { row: 1, frames: 6, fps: 6, repeat: -1, dirs: DIRECTIONS },
  walk: { row: 2, frames: 6, fps: 10, repeat: -1, dirs: DIRECTIONS },
  sleep: { row: 3, frames: 6, fps: 4, repeat: -1, dirs: 'front' },
  sit: { row: 4, frames: 6, fps: 6, repeat: -1, dirs: ['right', 'left'] },
  phone: { row: 6, frames: 12, fps: 8, repeat: -1, dirs: 'front' },
  read: { row: 7, frames: 12, fps: 8, repeat: -1, dirs: 'front' },
  push: { row: 8, frames: 6, fps: 8, repeat: -1, dirs: DIRECTIONS },
  pick_up: { row: 9, frames: 12, fps: 12, repeat: 0, dirs: DIRECTIONS },
  gift: { row: 10, frames: 10, fps: 10, repeat: 0, dirs: DIRECTIONS },
  lift: { row: 11, frames: 14, fps: 12, repeat: 0, dirs: DIRECTIONS },
  throw: { row: 12, frames: 14, fps: 12, repeat: 0, dirs: DIRECTIONS },
};

export const STAFF_IDS: ActorId[] = ['adeng', 'xiaoju', 'laoshi'];

/** Animation key for an actor, animation and facing. */
export function animKey(actor: ActorId | GuestId, anim: string, facing: Facing): string {
  const def = STAFF_ANIMS[anim];
  if (!def || def.dirs === 'front') return `${actor}-${anim}`;
  return `${actor}-${anim}-${resolveFacing(def.dirs, facing)}`;
}

/** The closest direction the animation has: sitting only faces left or right, so up/down pick right. */
export function resolveFacing(dirs: Facing[], facing: Facing): Facing {
  return dirs.includes(facing) ? facing : dirs[0];
}

/** Frame indexes on the sheet for one animation and direction. */
export function staffFrames(anim: string, facing: Facing): number[] {
  const def = STAFF_ANIMS[anim];
  const slot = def.dirs === 'front' ? 0 : def.dirs.indexOf(resolveFacing(def.dirs, facing));
  const first = def.row * STAFF_FRAME.perRow + slot * def.frames;
  return Array.from({ length: def.frames }, (_, i) => first + i);
}

/** Direction of travel from one point to another, for the walk animation. */
export function facingTowards(from: { x: number; y: number }, to: { x: number; y: number }): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}
