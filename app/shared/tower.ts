import type { RoomId } from './scenes';
import { SHOP_STREET, type StreetId } from './town';

/**
 * The old clock tower on the river street (plan-2.0.md J6), mended over the year's story (J7): six looks, from the
 * stopped old frame to mended, lit and striking the hour. Pure: which look, when it strikes and how loud, where its
 * hands point. The pictures are scripts/art/tower.py's; the street draws them (StreetScene), the shop rings the bell.
 */
export const TOWER_STAGES = ['stopped', 'scaffold', 'roof', 'face', 'hands', 'lit'] as const;
export type TowerStage = (typeof TOWER_STAGES)[number];

const step = (s: TowerStage) => TOWER_STAGES.indexOf(s);

/**
 * The look after so many chapters of the year's story: a new one every two chapters from the fourth, so the
 * scaffolding goes up in April and the bell first strikes in December (J7's twelfth).
 */
export const towerStage = (chapters: number): TowerStage =>
  TOWER_STAGES[Math.max(0, Math.min(TOWER_STAGES.length - 1, Math.floor(chapters / 2) - 1))];

/** Someone at home says so when the tower moves on a step (lines group `grow`, `when: tower_<look>`). */
export const towerNews = (before: TowerStage, after: TowerStage): string | null => (step(after) > step(before) ? `tower_${after}` : null);

/** Its hands are on and keep the time from the fifth look. */
export const handsMove = (s: TowerStage): boolean => step(s) >= step('hands');

/** Where the hands point, in degrees clockwise from twelve. */
export function handAngles(date: Date): { hour: number; minute: number } {
  const minutes = date.getMinutes();
  return { hour: ((date.getHours() % 12) * 60 + minutes) / 2, minute: minutes * 6 };
}

/** No chime from ten at night to seven in the morning (plan-2.0.md Q-J6). */
export const QUIET_HOURS = { from: 22, to: 7 } as const;

/** How many strokes the bell strikes at `date`: the hour on the twelve-hour clock, on the hour, once mended, by day. */
export function strokesAt(date: Date, stage: TowerStage): number {
  if (stage !== 'lit' || date.getMinutes() !== 0) return 0;
  const hour = date.getHours();
  if (hour >= QUIET_HOURS.from || hour < QUIET_HOURS.to) return 0;
  return hour % 12 || 12;
}

/** Which hour a chime belongs to, so each is struck once however often the clock is looked at. */
export const chimeKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}`;

/**
 * How loud the bell is where you are: full out on the river street, softer on the first street, softer still in the
 * river street's shops, and faint at home and in the first street's shops, across the bridge.
 */
export function chimeLevel(where: { street: StreetId } | { room: RoomId }): number {
  if ('street' in where) return where.street === 'river' ? 1 : 0.5;
  return SHOP_STREET[where.room] === 'river' ? 0.6 : 0.3;
}
