import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BIRTHDAYS, TERMS, birthdayOn, termOn } from '../app/shared/calendar';
import { parseLines } from '../app/renderer/translator/lines';
import { ROOM_CREW, STAFF } from '../app/shared/staff';

// The days of the year (plan-1.7.md G3): the 24 solar terms, and everyone's birthday.
const HKO = JSON.parse(readFileSync('tests/fixtures/hko-calendar.json', 'utf8')) as { years: Record<string, { terms: Record<string, number[]> }> };
// The Observatory's English names, in the order the year brings them.
const HKO_NAMES = ['Moderate Cold', 'Severe Cold', 'Spring Commences', 'Spring Showers', 'Insects Waken', 'Vernal Equinox', 'Bright & Clear',
  'Corn Rain', 'Summer Commences', 'Corn Forms', 'Corn on Ear', 'Summer Solstice', 'Moderate Heat', 'Great Heat', 'Autumn Commences',
  'End of Heat', 'White Dew', 'Autumnal Equinox', 'Cold Dew', 'Frost', 'Winter Commences', 'Light Snow', 'Heavy Snow', 'Winter Solstice'];

describe('the solar terms', () => {
  it('knows all 24 for every year from 2025 to 2040, on the days the Hong Kong Observatory has them', () => {
    expect(TERMS).toHaveLength(24);
    for (const [year, { terms }] of Object.entries(HKO.years)) {
      for (const [i, name] of HKO_NAMES.entries()) {
        const [m, d] = terms[name];
        expect(termOn(new Date(Number(year), m, d, 9)), `${year} ${name}`).toBe(TERMS[i]);
        expect(termOn(new Date(Number(year), m, d + 1, 9)), `${year} the day after ${name}`).toBeNull();
      }
    }
    expect(termOn(new Date(2041, 0, 5, 9))).toBeNull();
  });

  it('has a word from Wick for each, in both languages', () => {
    for (const file of ['lines/cafe.yaml', 'lines/en/cafe.yaml']) {
      const lines = parseLines(readFileSync(file, 'utf8')).solar_term;
      for (const t of TERMS) {
        const mine = lines.filter((l) => l.when === `term_${t}`);
        expect(mine.length, `${file} ${t}`).toBe(1);
        expect(mine[0].speaker).toBe('adeng');
      }
    }
  });
});

describe('birthdays', () => {
  const keepers = [...new Set(Object.entries(ROOM_CREW).filter(([room]) => room !== 'cafe' && room !== 'study').flatMap(([, crew]) => crew))];

  it('gives the five at home and the five keepers along the street a birthday each, never two in a month', () => {
    expect(Object.keys(BIRTHDAYS).sort()).toEqual([...STAFF, ...keepers].sort());
    const months = Object.values(BIRTHDAYS).map(([m]) => m);
    expect(new Set(months).size).toBe(months.length);
    expect(birthdayOn(new Date(2027, 2, 12, 9))).toEqual(['adeng']);
    expect(birthdayOn(new Date(2027, 2, 13, 9))).toEqual([]);
  });

  it('has the shop wish each one well, and each answer, in both languages', () => {
    for (const dir of ['lines/', 'lines/en/']) {
      const home = parseLines(readFileSync(`${dir}cafe.yaml`, 'utf8')).birthday;
      for (const who of Object.keys(BIRTHDAYS)) {
        const line = home.find((l) => l.when === `birthday_${who}`);
        expect(line, `${dir} ${who}`).toBeTruthy();
        // At home the one whose day it is answers; a keeper is spoken of, and says something in their own shop.
        if ((STAFF as readonly string[]).includes(who)) expect(line!.reply?.speaker ?? line!.speaker, `${dir} ${who}`).toBe(who);
      }
      for (const [room, crew] of Object.entries(ROOM_CREW)) {
        if (room === 'cafe' || room === 'study') continue;
        const shop = parseLines(readFileSync(`${dir}${room}.yaml`, 'utf8')).shop_in;
        expect(shop.some((l) => l.when === `birthday_${crew[0]}` && l.speaker === crew[0]), `${dir}${room}`).toBe(true);
      }
    }
  });
});
