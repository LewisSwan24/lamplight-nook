import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FALLING, LOOKS_GREY, SEASONS, flashesFor, fogFor, seasonOf, weatherOn, withWeather } from '../app/renderer/game/weather';
import { LOOKS } from '../app/renderer/game/daytime';
import { gardenOpen, outdoorsFor } from '../app/renderer/game/garden';
import { indoors } from '../app/renderer/game/animals';
import { crowdSize, passerSpeed } from '../app/renderer/game/crowd';
import { umbrellaUp } from '../app/renderer/game/streetdecor';
import { lintChats, lintLines, parseChats, parseLines } from '../app/renderer/translator/lines';
import { LOCALES } from '../app/shared/i18n';

// More weather (plan-1.7.md G4): fog in spring and autumn, wind in autumn and winter, thunderstorms only in summer.

const NEW = ['fog', 'wind', 'storm'] as const;
const years = [2026, 2027, 2028, 2029, 2030].flatMap((y) => Array.from({ length: 365 }, (_, i) => new Date(y, 0, 1 + i, 12)));

describe('fog, wind and storms', () => {
  it('come only in their own seasons', () => {
    const where: Record<(typeof NEW)[number], string[]> = { fog: ['spring', 'autumn'], wind: ['autumn', 'winter'], storm: ['summer'] };
    for (const d of years) {
      const sky = weatherOn(d);
      if ((NEW as readonly string[]).includes(sky)) expect(where[sky as (typeof NEW)[number]], `${sky} ${d.toDateString()}`).toContain(seasonOf(d));
    }
  });

  it('each come no more than one day in ten in a season, and every one of them comes', () => {
    for (const season of SEASONS) {
      const days = years.filter((d) => seasonOf(d) === season);
      for (const sky of NEW) {
        const n = days.filter((d) => weatherOn(d) === sky).length;
        expect(n / days.length, `${sky} in ${season}`).toBeLessThanOrEqual(0.12);
      }
    }
    for (const sky of NEW) expect(years.some((d) => weatherOn(d) === sky), sky).toBe(true);
  });

  it('leave the old weather where it was: they only take clear days', () => {
    // The new kinds come after the old ones in the dice, so a rainy, snowy, petal or leaf day stays one.
    const old = new Set(['rain', 'snow', 'petals', 'leaves']);
    const kinds = new Set(years.map((d) => weatherOn(d)));
    for (const k of old) expect(kinds.has(k as never)).toBe(true);
  });

  it('close the garden and keep the animals in for wind and storms, but not for fog', () => {
    for (const sky of ['wind', 'storm'] as const) {
      expect(gardenOpen(sky, 'day'), sky).toBe(false);
      expect(outdoorsFor(['xiaoju'], sky, 'day'), sky).toEqual([]);
      expect(indoors(sky, 'day'), sky).toBe(true);
    }
    expect(gardenOpen('fog', 'day')).toBe(true);
    expect(indoors('fog', 'day')).toBe(false);
  });

  it('halve the street in wind and storms; people walk slower into the wind and hurry in a storm, under umbrellas', () => {
    for (const sky of ['wind', 'storm'] as const) {
      expect(crowdSize(12, sky), sky).toBe(Math.max(1, Math.floor(crowdSize(12, 'clear') / 2)));
    }
    expect(crowdSize(12, 'fog')).toBe(crowdSize(12, 'clear'));
    expect(passerSpeed('wind')).toBeLessThan(passerSpeed('clear'));
    expect(passerSpeed('storm')).toBe(passerSpeed('rain'));
    expect(umbrellaUp('storm')).toBe(true);
    expect(umbrellaUp('wind')).toBe(false);
  });
});

describe('how they look', () => {
  it('rains harder in a storm, blows things sideways in the wind, and drops nothing in fog', () => {
    expect(FALLING.storm!.perSecond).toBeGreaterThan(FALLING.rain!.perSecond);
    expect(Math.abs(FALLING.wind!.drift)).toBeGreaterThan(FALLING.wind!.speed);
    expect(FALLING.fog).toBeUndefined();
  });

  it('greys a storm more than rain, and pales the glass in fog', () => {
    const rain = withWeather(LOOKS.day, 'rain');
    const storm = withWeather(LOOKS.day, 'storm');
    expect(storm.sun).toBeLessThan(rain.sun);
    expect(withWeather(LOOKS.day, 'fog').sky).toBe(LOOKS_GREY.fog);
    expect(withWeather(LOOKS.day, 'wind')).toEqual(LOOKS.day);
  });

  it('is thickest at dawn and thins out through the day', () => {
    expect(fogFor('fog', 'dawn')).toBeGreaterThan(fogFor('fog', 'day'));
    expect(fogFor('fog', 'day')).toBeGreaterThan(0);
    expect(fogFor('clear', 'dawn')).toBe(0);
  });

  it('flashes only in a storm, and never with less motion asked for', () => {
    expect(flashesFor('storm', false)).toBe(true);
    expect(flashesFor('storm', true)).toBe(false);
    expect(flashesFor('rain', false)).toBe(false);
  });
});

describe('what is said about them', () => {
  const zh = parseLines(readFileSync('lines/cafe.yaml', 'utf8'));
  const en = parseLines(readFileSync('lines/en/cafe.yaml', 'utf8'));
  it('Wick greets each, the staff chat about each, and Auntie Olive and Pip have a word at the door and two while it is quiet', () => {
    for (const lib of [zh, en]) for (const sky of NEW) expect(lib.app_open.some((l) => l.when === `sky_${sky}`), sky).toBe(true);
    for (const file of ['lines/chats.yaml', 'lines/en/chats.yaml']) {
      const chats = parseChats(readFileSync(file, 'utf8'));
      for (const sky of NEW) expect(chats.filter((c) => c.sky === sky).length, `${file} ${sky}`).toBeGreaterThanOrEqual(2);
      expect(lintChats(chats, LOCALES[file.includes('/en/') ? 'en' : 'zh-CN'])).toEqual([]);
    }
    for (const shop of ['bakery', 'post']) {
      for (const [dir, lang] of [['lines/', 'zh-CN'], ['lines/en/', 'en']] as const) {
        const lib = parseLines(readFileSync(`${dir}${shop}.yaml`, 'utf8'));
        for (const sky of NEW) {
          expect(lib.shop_in.filter((l) => l.when === `sky_${sky}`).length, `${shop} in ${sky}`).toBe(1);
          expect(lib.shop_idle.filter((l) => l.when === `sky_${sky}`).length, `${shop} idle ${sky}`).toBe(2);
        }
        expect(lintLines(lib, LOCALES[lang])).toEqual([]);
      }
    }
  });

  it('names them in the window and at the door, in both languages', () => {
    for (const L of Object.values(LOCALES)) {
      const ui = (L as { ui: { panels?: unknown } }).ui as Record<string, unknown>;
      const text = JSON.stringify(ui);
      for (const sky of NEW) expect(text.includes(`"${sky}":`), sky).toBe(true);
    }
  });
});
