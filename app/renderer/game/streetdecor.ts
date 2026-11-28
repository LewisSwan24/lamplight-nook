import data from '../../../assets/sprites/town-decor.json';
import type { RoomId } from '../../shared/scenes';
import { isStreetShop } from '../../shared/towngrow';
import type { Holiday, Season, Sky } from './weather';

/**
 * The street through the year (road-to-1.4.md D6): the season on its trees and roofs, the festival at its doors and in the
 * lot, puddles or snow on the ground. Pure: which pieces are out; TownDecor.ts draws them. Where each piece stands and
 * what it looks like: scripts/art/decor.py (town-decor.png, town-decor.json).
 */

/** A piece cut from town-decor.png. `ground`: lies under the fronts and props; `with`: only once that growth piece is out
 * (a tree in the lot); `lot`: stands where the cart does, which is put away meanwhile. */
export type DecorPart = { id: string; sx: number; sy: number; w: number; h: number; x: number; y: number; ground?: boolean; with?: string; lot?: boolean };
/** The umbrella opened over whoever is out on an errand: `x`, `y` from her feet. */
export type Umbrella = { sx: number; sy: number; w: number; h: number; x: number; y: number };
export const DECOR = data as { parts: DecorPart[]; umbrella: Umbrella };

export type Outside = { season: Season; holiday: Holiday | null; sky: Sky };

/** The season's, the festival's and the weather's pieces are out; a tree's only with its tree. */
export function decorOut(part: DecorPart, outside: Outside, grown: readonly string[]): boolean {
  if (part.with && !grown.includes(part.with)) return false;
  return part.id === outside.season || part.id === outside.holiday || part.id === outside.sky;
}

/** What the town has grown that is put away today: the cart, while a festival stands in its place. */
export function putAway(outside: Outside): string[] {
  return DECOR.parts.some((p) => p.lot && p.id === outside.holiday) ? ['stall'] : [];
}

/** Rain or snow: whoever is out walks under an umbrella. */
export const umbrellaUp = (sky: Sky): boolean => sky === 'rain' || sky === 'snow' || sky === 'storm';

/** The shops along the street, in the order of the rows of shops-decor.png; its columns follow HOLIDAYS. */
export const DECOR_SHOPS = ['print', 'studio', 'workshop', 'bakery', 'post', 'flowershop', 'bookshop'] as const;

/** Where a room's festival decorations are: the cafe and the study their own pictures, a shop along the street its frame. */
export function roomDecor(room: RoomId, holiday: Holiday): { key: string; frame?: string } {
  return (DECOR_SHOPS as readonly string[]).includes(room) ? { key: 'shops-decor', frame: `${room}-${holiday}` } : { key: `decor-${holiday}` };
}
