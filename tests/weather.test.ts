import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOOKS } from '../app/renderer/game/daytime';
import { dayRoll, HOLIDAYS, holidayOn, multiply, outsideFlags, SEASONS, seasonOf, skyOn, weatherOn, withWeather } from '../app/renderer/game/weather';
import { readPng } from './png';
import { DECOR_SHOPS } from '../app/renderer/game/streetdecor';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const HKO = JSON.parse(readFileSync('tests/fixtures/hko-calendar.json', 'utf8')) as {
  years: Record<string, { newYear: number[]; dragonBoat: number[]; midAutumn: number[]; terms: Record<string, number[]> }>;
};

describe('seasons and weather', () => {
  it('follows the months of the northern hemisphere', () => {
    expect(seasonOf(day(2026, 3, 1))).toBe('spring');
    expect(seasonOf(day(2026, 7, 15))).toBe('summer');
    expect(seasonOf(day(2026, 10, 29))).toBe('autumn');
    expect(seasonOf(day(2026, 12, 31))).toBe('winter');
    expect(seasonOf(day(2027, 2, 28))).toBe('winter');
  });

  it('keeps the same weather all day long, and changes from day to day', () => {
    expect(weatherOn(day(2026, 10, 29, 6))).toBe(weatherOn(day(2026, 10, 29, 23)));
    expect(dayRoll(day(2026, 10, 29, 1))).toBe(dayRoll(day(2026, 10, 29, 22)));
    const rolls = new Set(Array.from({ length: 30 }, (_, i) => dayRoll(day(2026, 6, i + 1))));
    expect(rolls.size).toBeGreaterThan(25);
  });

  it('only snows in winter, petals only in spring, leaves only in autumn', () => {
    const year = Array.from({ length: 365 }, (_, i) => new Date(2026, 0, 1 + i, 12));
    for (const d of year) {
      const sky = weatherOn(d);
      if (sky === 'snow') expect(seasonOf(d)).toBe('winter');
      if (sky === 'petals') expect(seasonOf(d)).toBe('spring');
      if (sky === 'leaves') expect(seasonOf(d)).toBe('autumn');
    }
    // Over a year every kind of day turns up, and most days are clear.
    const counts = year.reduce<Record<string, number>>((c, d) => ({ ...c, [weatherOn(d)]: (c[weatherOn(d)] ?? 0) + 1 }), {});
    for (const sky of ['clear', 'rain', 'snow', 'petals', 'leaves']) expect(counts[sky]).toBeGreaterThan(5);
    expect(counts.clear).toBeGreaterThan(150);
  });
});

describe('holidays', () => {
  it('puts up Halloween decorations in the last week of October', () => {
    expect(holidayOn(day(2026, 10, 23))).toBeNull();
    expect(holidayOn(day(2026, 10, 24))).toBe('halloween');
    expect(holidayOn(day(2026, 10, 31))).toBe('halloween');
    expect(holidayOn(day(2026, 11, 1))).toBeNull();
  });

  it('keeps Christmas up from 18 December to New Year\'s Day', () => {
    expect(holidayOn(day(2026, 12, 17))).toBeNull();
    expect(holidayOn(day(2026, 12, 18))).toBe('christmas');
    expect(holidayOn(day(2027, 1, 1))).toBe('christmas');
    expect(holidayOn(day(2027, 1, 2))).toBeNull();
  });

  it('keeps Lunar New Year up from a week before, then lanterns for the Lantern Festival', () => {
    // 2027: New Year's day is 6 February, the Lantern Festival 20 February.
    expect(holidayOn(day(2027, 1, 30))).toBe('new_year');
    expect(holidayOn(day(2027, 1, 29))).toBeNull();
    expect(holidayOn(day(2027, 2, 6))).toBe('new_year');
    expect(holidayOn(day(2027, 2, 17))).toBe('new_year');
    expect(holidayOn(day(2027, 2, 18))).toBe('lantern');
    expect(holidayOn(day(2027, 2, 20))).toBe('lantern');
    expect(holidayOn(day(2027, 2, 21))).toBeNull();
    // 2026: New Year 17 February, the Lantern Festival 3 March.
    expect(holidayOn(day(2026, 3, 3))).toBe('lantern');
    expect(holidayOn(day(2026, 2, 28))).toBe('new_year');
    // Years outside the table get no Lunar New Year rather than a wrong one.
    expect(holidayOn(day(2041, 2, 1))).toBeNull();
  });

  it('hangs mugwort for the Dragon Boat Festival, the 5th of the 5th month', () => {
    // 2026: 19 June; 2028: 28 May.
    expect(holidayOn(day(2026, 6, 14))).toBeNull();
    expect(holidayOn(day(2026, 6, 15))).toBe('dragon_boat');
    expect(holidayOn(day(2026, 6, 19))).toBe('dragon_boat');
    expect(holidayOn(day(2026, 6, 20))).toBeNull();
    expect(holidayOn(day(2028, 5, 28))).toBe('dragon_boat');
    expect(holidayOn(day(2028, 5, 29))).toBeNull();
  });

  it('puts mooncakes out for the Mid-Autumn Festival, the 15th of the 8th month', () => {
    // 2026: 25 September; 2028: 3 October.
    expect(holidayOn(day(2026, 9, 18))).toBeNull();
    expect(holidayOn(day(2026, 9, 19))).toBe('mid_autumn');
    expect(holidayOn(day(2026, 9, 25))).toBe('mid_autumn');
    expect(holidayOn(day(2026, 9, 26))).toBeNull();
    expect(holidayOn(day(2028, 10, 3))).toBe('mid_autumn');
  });

  it('knows the lunar festivals for every year from 2025 to 2040, as the Hong Kong Observatory has them', () => {
    // tests/fixtures/hko-calendar.json comes from the Observatory's tables (scripts/hko-calendar.mjs).
    const years = Object.entries(HKO.years);
    expect(years.map(([y]) => Number(y))).toEqual(Array.from({ length: 16 }, (_, i) => 2025 + i));
    for (const [y, { newYear, dragonBoat, midAutumn }] of years) {
      const at = ([m, d]: number[], plus = 0) => new Date(Number(y), m, d + plus, 12);
      expect(holidayOn(at(newYear)), `${y} new year`).toBe('new_year');
      expect(holidayOn(at(newYear, -7)), `${y} a week before`).toBe('new_year');
      expect(holidayOn(at(newYear, -8)), `${y} eight days before`).toBeNull();
      expect(holidayOn(at(newYear, 14)), `${y} lantern`).toBe('lantern');
      expect(holidayOn(at(newYear, 15)), `${y} after the lanterns`).toBeNull();
      expect(holidayOn(at(dragonBoat)), `${y} dragon boat`).toBe('dragon_boat');
      expect(holidayOn(at(dragonBoat, 1)), `${y} after the dragon boats`).toBeNull();
      expect(holidayOn(at(midAutumn)), `${y} mid-autumn`).toBe('mid_autumn');
      expect(holidayOn(at(midAutumn, 1)), `${y} after mid-autumn`).toBeNull();
    }
  });

  it('brings round every festival over the years', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 365 * 11; i++) {
      const h = holidayOn(new Date(2025, 0, 1 + i, 12));
      if (h) seen.add(h);
    }
    expect([...seen].sort()).toEqual(['christmas', 'dragon_boat', 'halloween', 'lantern', 'mid_autumn', 'new_year']);
  });

  it('snows more often at Christmas', () => {
    const days = (m: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => day(2026, m, from + i));
    const xmas = [...days(12, 18, 31)].map(skyOn).filter((s) => s === 'snow').length;
    const plain = [...days(12, 18, 31)].map(weatherOn).filter((s) => s === 'snow').length;
    expect(xmas).toBeGreaterThanOrEqual(plain);
  });
});

describe('the look of a grey day', () => {
  it('leaves a clear day as drawn', () => {
    expect(withWeather(LOOKS.day, 'clear')).toEqual(LOOKS.day);
    expect(withWeather(LOOKS.day, 'petals')).toEqual(LOOKS.day);
  });

  it('greys the glass and dims the sun on a rainy day, but keeps the night sky dark', () => {
    const rain = withWeather(LOOKS.day, 'rain');
    expect(rain.skyAlpha).toBeGreaterThan(0.5);
    expect(rain.sun).toBeLessThan(LOOKS.day.sun);
    expect(rain.tint).not.toBe(LOOKS.day.tint);
    expect(withWeather(LOOKS.night, 'rain').sky).toBe(LOOKS.night.sky);
  });

  it('multiplies colours channel by channel', () => {
    expect(multiply(0xffffff, 0x123456)).toBe(0x123456);
    expect(multiply(0x808080, 0xff0000)).toBe(0x800000);
  });
});

describe('the street\'s decorations (road-to-1.4.md D6)', () => {
  it('has the pictures for the street and for every shop along it', () => {
    for (const name of ['town-decor.png', 'town-decor.json', 'shops-decor.png']) expect(existsSync(`assets/sprites/${name}`), name).toBe(true);
    // A row for each shop along the street (print, studio, workshop, and since 1.6 the bakery and the post office) of
    // six festivals, each a whole room.
    const shops = readPng('assets/sprites/shops-decor.png');
    expect([shops.width, shops.height]).toEqual([320 * HOLIDAYS.length, 180 * DECOR_SHOPS.length]);
  });

  it('has pieces on the street for every season and festival, and for rain and snow', () => {
    const ids = new Set((JSON.parse(readFileSync('assets/sprites/town-decor.json', 'utf8')).parts as { id: string }[]).map((p) => p.id));
    for (const id of [...SEASONS, ...HOLIDAYS, 'rain', 'snow']) expect(ids.has(id), id).toBe(true);
  });
});

describe('lines that fit the day', () => {
  it('names the weather and the holiday as line conditions', () => {
    expect(outsideFlags({ sky: 'clear', holiday: null })).toEqual([]);
    expect(outsideFlags({ sky: 'rain', holiday: null })).toEqual(['sky_rain']);
    expect(outsideFlags({ sky: 'snow', holiday: 'christmas' })).toEqual(['sky_snow', 'holiday_christmas']);
  });
});
