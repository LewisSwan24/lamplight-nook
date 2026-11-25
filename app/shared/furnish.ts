import type { Season } from './growth';
import type { SceneId } from './scenes';

/**
 * Furnishing each scene (plan.md S4): the wall colour, the curtains and the rug. `default` is the scene as
 * drawn; every other choice is an overlay made by scripts/art/furnish.py (assets/sprites/furnish-<scene>-<part>-<choice>.png).
 */
export const FURNISH_PARTS = ['wall', 'curtain', 'rug'] as const;
export type FurnishPart = (typeof FURNISH_PARTS)[number];

export const FURNISH_CHOICES = {
  wall: ['default', 'sage', 'rose', 'sky', 'peach', 'snow'],
  curtain: ['default', 'blue', 'rose', 'green', 'bamboo', 'orange'],
  rug: ['default', 'blue', 'green', 'plum', 'wheat', 'crimson'],
} as const satisfies Record<FurnishPart, readonly string[]>;

/**
 * The colours of a season (plan-1.7.md G2): chosen all year round (Q-G4), and when one is in use in its season, someone
 * in the shop says so, as it is picked or as the season turns.
 */
export const SEASON_COLOURS: Record<string, Season> = {
  'wall-peach': 'spring', 'curtain-bamboo': 'summer', 'curtain-orange': 'autumn', 'rug-wheat': 'autumn', 'wall-snow': 'winter', 'rug-crimson': 'winter',
};

/** Whether anything in the room is a colour of this season. */
export const inSeason = (f: Furnishing, season: Season): boolean => FURNISH_PARTS.some((p) => SEASON_COLOURS[`${p}-${f[p]}`] === season);

/** Whether a change has just put up a colour of this season, one that was not there before. */
export const newlyInSeason = (before: Furnishing, after: Furnishing, season: Season): boolean =>
  FURNISH_PARTS.some((p) => after[p] !== before[p] && SEASON_COLOURS[`${p}-${after[p]}`] === season);

export type Furnishing = { [P in FurnishPart]: (typeof FURNISH_CHOICES)[P][number] };
export type Furnishings = Record<SceneId, Furnishing>;

export const DEFAULT_FURNISHING: Furnishing = { wall: 'default', curtain: 'default', rug: 'default' };

/** Swatch colours for the settings card: the main colour of each choice in each scene. */
export const SWATCHES: Record<SceneId, { [P in FurnishPart]: Record<string, string> }> = {
  cafe: {
    wall: { default: '#d0be9c', sage: '#b8d0ac', rose: '#d4a4ac', sky: '#a7c1d4', peach: '#dcafa8', snow: '#f2f5fa' },
    curtain: { default: '#d0be9c', blue: '#6789b0', rose: '#b9727e', green: '#76b076', bamboo: '#6da691', orange: '#c87239' },
    rug: { default: '#a74e47', blue: '#5175a7', green: '#5fa783', plum: '#a76da2', wheat: '#d1b377', crimson: '#862939' },
  },
  study: {
    wall: { default: '#689183', sage: '#7b916c', rose: '#98767e', sky: '#6c7f91', peach: '#987674', snow: '#acb0b5' },
    curtain: { default: '#d0be9c', blue: '#6789b0', rose: '#b9727e', green: '#76b076', bamboo: '#6da691', orange: '#c87239' },
    rug: { default: '#a74e47', blue: '#5175a7', green: '#5fa783', plum: '#a76da2', wheat: '#d1b377', crimson: '#862939' },
  },
};

/** One scene's furnishing from anything stored: unknown parts or choices fall back to the default. */
export function cleanFurnishing(v: unknown): Furnishing {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FURNISHING } as Record<FurnishPart, string>;
  for (const part of FURNISH_PARTS) {
    if ((FURNISH_CHOICES[part] as readonly unknown[]).includes(o[part])) out[part] = o[part] as string;
  }
  return out as Furnishing;
}

/** Every scene's furnishing from anything stored. */
export function cleanFurnishings(v: unknown): Furnishings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { cafe: cleanFurnishing(o.cafe), study: cleanFurnishing(o.study) };
}
