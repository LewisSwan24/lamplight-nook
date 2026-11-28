import type { ActorId } from '../../shared/types';
import type { Facing } from './layout';

/** Walking speed in canvas pixels per second: Xiaoju hurries, Laoshi takes his time. */
export const WALK_SPEED: Record<ActorId, number> = { adeng: 38, xiaoju: 50, laoshi: 28, qingdai: 36, xiaodou: 46, aqian: 30, xiaozhe: 34, xiaoding: 48, guiyi: 32, axin: 44, fangjie: 40, jianbo: 26, cat: 34 };

/** How long a character stands still before glancing around: 6 to 14 seconds. */
export function idleDelay(rand: number): number {
  return 6000 + rand * 8000;
}

/** How long the cat keeps napping or wagging before switching: 8 to 20 seconds. */
export function napDelay(rand: number): number {
  return 8000 + rand * 12000;
}

/** Where an idle character glances: mostly to one side of where it faces, sometimes straight down at the room. */
export function glanceFacing(home: Facing, rand: number): Facing {
  const sides: Record<Facing, [Facing, Facing]> = {
    up: ['left', 'right'],
    down: ['left', 'right'],
    left: ['down', 'up'],
    right: ['down', 'up'],
  };
  if (rand < 0.2 && home !== 'down') return 'down';
  return rand < 0.6 ? sides[home][0] : sides[home][1];
}
