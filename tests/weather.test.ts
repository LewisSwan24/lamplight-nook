import { describe, expect, it } from 'vitest';
import { LOOKS } from '../app/renderer/game/daytime';
import { dayRoll, holidayOn, multiply, outsideFlags, seasonOf, skyOn, weatherOn, withWeather } from '../app/renderer/game/weather';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

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
    expect(holidayOn(day(2040, 2, 12))).toBeNull();
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

  it('knows the lunar festivals for every year from 2025 to 2035', () => {
    // From the Hong Kong Observatory's calendar; the Lantern Festival is fourteen days after New Year's day.
    const dragon = ['2025-05-31', '2026-06-19', '2027-06-09', '2028-05-28', '2029-06-16', '2030-06-05', '2031-06-24', '2032-06-12', '2033-06-01', '2034-06-20', '2035-06-10'];
    const moon = ['2025-10-06', '2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12', '2031-10-01', '2032-09-19', '2033-09-08', '2034-09-27', '2035-09-16'];
    const at = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return day(y, m, d);
    };
    for (const iso of dragon) expect(holidayOn(at(iso)), iso).toBe('dragon_boat');
    for (const iso of moon) expect(holidayOn(at(iso)), iso).toBe('mid_autumn');
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

describe('lines that fit the day', () => {
  it('names the weather and the holiday as line conditions', () => {
    expect(outsideFlags({ sky: 'clear', holiday: null })).toEqual([]);
    expect(outsideFlags({ sky: 'rain', holiday: null })).toEqual(['sky_rain']);
    expect(outsideFlags({ sky: 'snow', holiday: 'christmas' })).toEqual(['sky_snow', 'holiday_christmas']);
  });
});
