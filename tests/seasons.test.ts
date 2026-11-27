import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FURNISH_CHOICES, FURNISH_PARTS, SEASON_COLOURS, SWATCHES, cleanFurnishing, inSeason, newlyInSeason } from '../app/shared/furnish';
import { LOCALES } from '../app/shared/i18n';
import { parseLines } from '../app/renderer/translator/lines';
import { MENU_BOARD, menuFrame } from '../app/shared/menu';
import { SEASONS } from '../app/renderer/game/weather';
import { readPng } from './png';

// The shop through the seasons (plan-1.7.md G2).
describe("the bakery's blackboard", () => {
  const sheet = readPng('assets/sprites/bakery-board.png');
  const frame = (i: number) => {
    const px: number[] = [];
    for (let y = 0; y < MENU_BOARD.h; y++) for (let x = 0; x < MENU_BOARD.w; x++) {
      const p = sheet.at(i * MENU_BOARD.w + x, y);
      px.push(p.alpha ? p.rgb : -1);
    }
    return px;
  };

  it('has a menu for each season, side by side, each its own', () => {
    expect([sheet.width, sheet.height]).toEqual([MENU_BOARD.w * SEASONS.length, MENU_BOARD.h]);
    const frames = SEASONS.map((_, i) => frame(i));
    for (const [i, f] of frames.entries()) expect(f.filter((p) => p >= 0).length, SEASONS[i]).toBeGreaterThan(40);
    expect(new Set(frames.map((f) => f.join())).size).toBe(SEASONS.length);
    expect(SEASONS.map(menuFrame)).toEqual([0, 1, 2, 3]);
  });

  it('leaves the board in the room bare, so the season’s menu is the only one on it', () => {
    const room = readPng('assets/sprites/bakery.png');
    const chalk = new Set([0xfaf6ec, 0xf0d678]);
    let n = 0;
    for (let y = MENU_BOARD.y; y < MENU_BOARD.y + MENU_BOARD.h; y++) for (let x = MENU_BOARD.x; x < MENU_BOARD.x + MENU_BOARD.w; x++) {
      if (chalk.has(room.at(x, y).rgb)) n++;
    }
    expect(n).toBe(0);
  });
});

describe('colours of the season', () => {
  it('adds two colours to the walls, the curtains and the rugs, each belonging to a season, chosen all year round', () => {
    expect(FURNISH_CHOICES.wall).toEqual(expect.arrayContaining(['peach', 'snow']));
    expect(FURNISH_CHOICES.curtain).toEqual(expect.arrayContaining(['bamboo', 'orange']));
    expect(FURNISH_CHOICES.rug).toEqual(expect.arrayContaining(['wheat', 'crimson']));
    expect(SEASON_COLOURS).toEqual({
      'wall-peach': 'spring', 'curtain-bamboo': 'summer', 'curtain-orange': 'autumn', 'rug-wheat': 'autumn', 'wall-snow': 'winter', 'rug-crimson': 'winter',
    });
    // Kept when stored, like every other choice.
    expect(cleanFurnishing({ wall: 'peach', curtain: 'orange', rug: 'crimson' })).toEqual({ wall: 'peach', curtain: 'orange', rug: 'crimson' });
  });

  it('has a swatch and a name for every choice, in both rooms and both languages', () => {
    for (const scene of ['cafe', 'study'] as const) {
      for (const part of FURNISH_PARTS) for (const choice of FURNISH_CHOICES[part]) {
        expect(SWATCHES[scene][part][choice], `${scene} ${part} ${choice}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    for (const lang of ['zh-CN', 'en'] as const) {
      const names = LOCALES[lang].ui.furnish.choices as Record<string, Record<string, string>>;
      for (const part of FURNISH_PARTS) for (const choice of FURNISH_CHOICES[part]) expect(names[part][choice], `${lang} ${part} ${choice}`).toBeTruthy();
    }
  });

  it('knows when a room is dressed for the season', () => {
    const plain = { wall: 'default', curtain: 'default', rug: 'default' } as const;
    expect(inSeason(plain, 'spring')).toBe(false);
    expect(inSeason({ ...plain, wall: 'peach' }, 'spring')).toBe(true);
    expect(inSeason({ ...plain, wall: 'peach' }, 'summer')).toBe(false);
    expect(inSeason({ ...plain, rug: 'crimson' }, 'winter')).toBe(true);
    expect(newlyInSeason(plain, { ...plain, curtain: 'bamboo' }, 'summer')).toBe(true);
    expect(newlyInSeason({ ...plain, curtain: 'bamboo' }, { ...plain, curtain: 'bamboo', rug: 'blue' }, 'summer')).toBe(false);
  });

  it('has the shop say so, once for each season, in both languages', () => {
    for (const file of ['lines/cafe.yaml', 'lines/en/cafe.yaml']) {
      const lines = parseLines(readFileSync(file, 'utf8')).furnish_in_season;
      for (const season of SEASONS) expect(lines.some((l) => l.when === `season_${season}`), `${file} ${season}`).toBe(true);
    }
  });
});
