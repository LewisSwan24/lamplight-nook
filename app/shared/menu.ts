import type { Season } from './growth';

/**
 * The bakery's chalked menu changes with the season (plan-1.7.md G2): qingtuan in spring, mung bean cakes in summer,
 * chestnut cake and pumpkin bread in autumn, hot toast in winter, as Auntie Olive says in her lines. Each is a frame of
 * assets/sprites/bakery-board.png (scripts/art/bakery.py), drawn over the bare blackboard in the room at x, y.
 */
export const MENU_BOARD = { room: 'bakery', x: 96, y: 19, w: 24, h: 16 } as const;

const ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** Which frame of the sheet is the season's menu. */
export const menuFrame = (season: Season): number => ORDER.indexOf(season);
