import { GUEST_DOOR, GUEST_SPOT } from './guests';
import type { Facing } from './layout';

/**
 * The player in the shop. While their commission is made they come in at the front door, hand the
 * slip over at the end of the counter (where neighbours stand to talk), wait in the chair by the
 * lamp, come back to the counter for the result and go home. The look is theirs to pick
 * (shared/avatars.ts); the moves are played by CafeScene.
 */
type Point = { x: number; y: number };

/** The customer's chair by the lamp (drawn into cafe.png, scripts/art/scene.py CHAIRS). */
export const YOU_SEAT: Point & { facing: Facing } = { x: 262, y: 166, facing: 'left' };
/** Where the slip is handed over and the result picked up. */
export const YOU_COUNTER = GUEST_SPOT;
export const YOU_DOOR = GUEST_DOOR;

export const YOU_SPEED = 34;
/** How long the slip takes to hand over, and the result to take, at the counter. */
export const HAND_OVER_MS = 1000;
export const PICK_UP_MS = 1400;
