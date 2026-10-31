import { GUEST_DOOR, GUEST_PATH, GUEST_SPOT } from './guests';
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

/** From the door to the counter: the neighbours' way in. */
export const PATH_IN: Point[] = GUEST_PATH;
/** From the counter round the lamp to the chair, coming at it from the left so the last step is a sit-down. */
export const PATH_TO_SEAT: Point[] = [{ x: 284, y: 118 }, { x: 248, y: 118 }, { x: 248, y: YOU_SEAT.y }, { x: YOU_SEAT.x, y: YOU_SEAT.y }];
/** Back from the chair to the counter. */
export const PATH_TO_COUNTER: Point[] = [{ x: 248, y: YOU_SEAT.y }, { x: 248, y: 118 }, { x: 284, y: 118 }, { ...YOU_COUNTER }];
/** From the counter out of the front door. */
export const PATH_OUT: Point[] = [GUEST_PATH[0], { ...GUEST_DOOR }];

export const YOU_SPEED = 34;
/** How long the slip takes to hand over, and the result to take, at the counter. */
export const HAND_OVER_MS = 1000;
export const PICK_UP_MS = 1400;
