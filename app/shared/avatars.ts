/**
 * The looks a player can pick for themselves in the shop: numbered 1..AVATAR_COUNT, matching
 * assets/sprites/you-<n>.png and the cells of assets/ui/you.png (scripts/art/characters.py, PLAYERS).
 */
export const AVATAR_COUNT = 8;
export const DEFAULT_AVATAR = 1;

/** A look number from 1 to AVATAR_COUNT, or undefined for anything else. */
export function cleanAvatar(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= AVATAR_COUNT ? v : undefined;
}

export const avatarKey = (n: number) => `you-${n}` as const;
