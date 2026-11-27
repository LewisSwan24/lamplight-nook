import type { RoomId } from '../../shared/scenes';
import type { Period } from './daytime';
import type { Sky } from './weather';

/**
 * The street shops' animals (plan-1.9.md I3): Bun, the bakery's dog; Stamp, the post office's pigeon; Cinnabar, the
 * studio's goldfish. Like the cat they never speak: a click gets a little something back, and the keeper brings them
 * up now and then (lines `shop_idle`). Where each is and what it does goes by the hour and the weather. Pure: the
 * scene (game/ShopPet.ts) asks and acts it out. Sprites from scripts/art/animals.py; places match the rooms drawn by
 * scripts/art/bakery.py, post.py and studio.py.
 */
export type PetId = 'bun' | 'stamp' | 'cinnabar';
export const SHOP_PET: Partial<Record<RoomId, PetId>> = { bakery: 'bun', post: 'stamp', studio: 'cinnabar' };

/** Each sheet and its frame size. */
export const PET_SHEETS: Record<PetId, { key: string; w: number; h: number }> = {
  bun: { key: 'shop-dog', w: 32, h: 32 },
  stamp: { key: 'pigeon', w: 32, h: 32 },
  cinnabar: { key: 'fishbowl', w: 16, h: 16 },
};

const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
/**
 * Frames of each animation. shop-dog.png: 24 to a row; rows idle, bark (3 each way), looking up (6, facing down) and
 * asleep (8). pigeon.png: 6 to a row; rows sitting left, sitting right, flying left, flying right. fishbowl.png: one swim.
 */
export const PET_FRAMES = {
  bun: { lie: run(72, 8), look: run(48, 6), bark: run(24 + 9, 3), stand: run(18, 6) },
  stamp: { sitLeft: run(0, 6), sitRight: run(6, 6), flyLeft: run(12, 6), flyRight: run(18, 6) },
  cinnabar: { swim: run(0, 12) },
} as const;
export const PET_FPS = { lie: 3, look: 6, bark: 8, stand: 6, sitLeft: 5, sitRight: 5, flyLeft: 12, flyRight: 12, swim: 6 } as const;

/** Where each one's feet (or the bowl's bottom) are, in the room's pixels. */
export const PET_SPOTS = {
  // Right of the bread case, out of the way; the mat is left of the front door, under the window there.
  bun: { counter: { x: 288, y: 106 }, mat: { x: 274, y: 64 } },
  // The right-hand window's sill, and the top of the pigeonholes on the back wall.
  stamp: { sill: { x: 216, y: 38 }, rack: { x: 148, y: 37 } },
  // Umber's windowsill, the right-hand window.
  cinnabar: { bowl: { x: 213, y: 38 } },
} as const;
/** Bun's mat, drawn under the dog: left, top, width, height. */
export const BUN_MAT = { x: 264, y: 59, w: 20, h: 7 } as const;

export type PetPose = 'lie' | 'sleep' | 'sit' | 'swim';

/** Where a pet is and how, at this hour and in this weather. */
export function petAt(pet: PetId, period: Period, _sky: Sky): { spot: string; pose: PetPose } {
  if (pet === 'bun') return period === 'night' ? { spot: 'mat', pose: 'sleep' } : { spot: 'counter', pose: 'lie' };
  if (pet === 'stamp') return { spot: 'sill', pose: period === 'night' ? 'sleep' : 'sit' };
  return { spot: 'bowl', pose: 'swim' };
}

/** Stamp keeps in on wet days and at night. */
const indoors = (period: Period, sky: Sky) => period === 'night' || sky === 'rain' || sky === 'storm' || sky === 'snow';

/** Where Stamp goes next: the other perch on a dry day; back to the sill (and staying there) when it is wet or dark. */
export function stampNext(at: 'sill' | 'rack', period: Period, sky: Sky): 'sill' | 'rack' {
  if (indoors(period, sky)) return 'sill';
  return at === 'sill' ? 'rack' : 'sill';
}

/** How long Stamp sits before flying again, in milliseconds. */
export const STAMP_SIT_MS = [14_000, 30_000] as const;
export const STAMP_FLY_MS = 1400;
