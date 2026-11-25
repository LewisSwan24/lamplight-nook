import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENTER_QUIET_MS, SHOP_TALK_GAP_MS, ShopTalk, fitsMoment, momentFlags, type Moment } from '../app/renderer/stage/shoptalk';
import { type Line, lintLines, parseLines } from '../app/renderer/translator/lines';
import { LOCALES } from '../app/shared/i18n';
import { ROOM_CREW } from '../app/shared/staff';
import { HOLIDAYS } from '../app/renderer/game/weather';

// The keepers of the shops along the street talk while you are in their shop (plan-1.6.md F5): a word as you walk in
// that fits the hour, the weather, the season or the holiday, and now and then something while it is quiet.

/** Seeded random, so runs are repeatable. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const day: Moment = { period: 'day', sky: 'clear', holiday: null, season: 'spring' };
const line = (id: string, when?: string): Line => ({ id, speaker: 'guiyi', bubbles: [id], ...(when ? { when } : {}) });

describe('what fits the moment', () => {
  it('names the holiday, the weather, the hour and the season', () => {
    expect(momentFlags(day)).toEqual(['sky_clear', 'period_day', 'season_spring']);
    expect(momentFlags({ period: 'night', sky: 'snow', holiday: 'christmas', season: 'winter' })).toEqual(['holiday_christmas', 'sky_snow', 'period_night', 'season_winter']);
  });

  it('takes a plain line any time, and a marked one only when its mark holds', () => {
    expect(fitsMoment(line('a'), day)).toBe(true);
    expect(fitsMoment(line('b', 'period_day'), day)).toBe(true);
    expect(fitsMoment(line('c', 'sky_rain'), day)).toBe(false);
    expect(fitsMoment(line('d', 'season_winter'), day)).toBe(false);
  });
});

describe('a word as you walk in', () => {
  const lines = [line('plain'), line('dawn', 'period_dawn'), line('rain', 'sky_rain'), line('xmas', 'holiday_christmas'), line('spring', 'season_spring')];

  it('greets with the holiday first, then the weather', () => {
    const t = new ShopTalk(0, seeded(1));
    expect(t.greet(lines, { ...day, sky: 'rain', holiday: 'christmas' })?.id).toBe('xmas');
    expect(t.greet(lines, { ...day, sky: 'rain' })?.id).toBe('rain');
  });

  it('otherwise picks among the hour, the season and the plain ones, never one that does not fit', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) seen.add(new ShopTalk(0, seeded(seed)).greet(lines, { ...day, period: 'dawn' })!.id);
    expect([...seen].sort()).toEqual(['dawn', 'plain', 'spring']);
  });

  it('says nothing in a shop with no greetings', () => {
    expect(new ShopTalk(0).greet([], day)).toBeNull();
  });
});

describe('something now and then while it is quiet', () => {
  const lines = [line('a'), line('b'), line('c'), line('wet', 'sky_rain'), line('cold', 'season_winter')];
  /** Ask every 5 seconds for `minutes` after walking in, as the app does. */
  const run = (minutes: number, moment: Moment, quiet: (t: number) => boolean = () => true, seed = 1) => {
    const t = new ShopTalk(0, seeded(seed));
    t.enter(0);
    const said: { id: string; at: number }[] = [];
    for (let at = 0; at <= minutes * 60_000; at += 5000) {
      const l = t.next(at, quiet(at), lines, moment);
      if (l) said.push({ id: l.id, at });
    }
    return said;
  };

  it('waits a little after you walk in, then leaves a gap between one and the next', () => {
    const said = run(10, day);
    expect(said[0].at).toBeGreaterThanOrEqual(ENTER_QUIET_MS[0]);
    expect(said[0].at).toBeLessThanOrEqual(ENTER_QUIET_MS[1] + 5000);
    for (let i = 1; i < said.length; i++) expect(said[i].at - said[i - 1].at).toBeGreaterThanOrEqual(SHOP_TALK_GAP_MS[0]);
    expect(said.length).toBeGreaterThanOrEqual(5);
  });

  it('never says a line for other weather or another season, and repeats nothing until all have been said', () => {
    const said = run(10, day).map((s) => s.id);
    expect(said).not.toContain('wet');
    expect(said).not.toContain('cold');
    expect(new Set(said.slice(0, 3)).size).toBe(3);
  });

  it('brings up the weather before the everyday lines', () => {
    expect(run(2, { ...day, sky: 'rain' })[0].id).toBe('wet');
  });

  it('stays quiet while there is work on', () => {
    expect(run(10, day, () => false)).toEqual([]);
    const later = run(10, day, (at) => at >= 300_000);
    expect(later[0].at).toBeGreaterThanOrEqual(300_000);
  });
});

describe('the keepers\' own lines', () => {
  const KEEPER = { bakery: 'guiyi', post: 'axin' } as const;
  const known = new Set(['period_dawn', 'period_day', 'period_dusk', 'period_night', 'sky_clear', 'sky_rain', 'sky_snow', 'sky_petals', 'sky_leaves',
    'season_spring', 'season_summer', 'season_autumn', 'season_winter', ...HOLIDAYS.map((h) => `holiday_${h}`)]);
  for (const [shop, keeper] of Object.entries(KEEPER)) {
    const zh = parseLines(readFileSync(`lines/${shop}.yaml`, 'utf8'));
    const en = parseLines(readFileSync(`lines/en/${shop}.yaml`, 'utf8'));
    it(`lines/${shop}.yaml: greetings and idle words from ${keeper} alone, for every hour, weather and season, in both languages`, () => {
      expect(ROOM_CREW[shop as 'bakery' | 'post']).toEqual([keeper]);
      for (const lib of [zh, en]) {
        expect(lib.shop_in.length).toBeGreaterThanOrEqual(15);
        expect(lib.shop_idle.length).toBeGreaterThanOrEqual(40);
        for (const l of [...lib.shop_in, ...lib.shop_idle]) {
          expect(l.speaker, l.id).toBe(keeper);
          if (l.when) expect(known.has(l.when), `${l.id}: ${l.when}`).toBe(true);
        }
        for (const when of ['period_dawn', 'period_night', 'sky_rain', 'sky_snow', 'season_spring', 'season_summer', 'season_autumn', 'season_winter']) {
          expect(lib.shop_idle.some((l) => l.when === when), `${shop} has nothing idle for ${when}`).toBe(true);
        }
      }
      expect(en.shop_in.map((l) => l.id)).toEqual(zh.shop_in.map((l) => l.id));
      expect(en.shop_idle.map((l) => l.id)).toEqual(zh.shop_idle.map((l) => l.id));
      expect(lintLines(zh, LOCALES['zh-CN'])).toEqual([]);
      expect(lintLines(en, LOCALES.en)).toEqual([]);
    });
  }
});
