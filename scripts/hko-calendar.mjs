// Turns the Hong Kong Observatory's Gregorian-Lunar conversion tables into the facts the shop's calendar is checked
// against: Lunar New Year, the Dragon Boat Festival, the Mid-Autumn Festival and the 24 solar terms, 2025 to 2040.
//
//   node scripts/hko-calendar.mjs <folder>      reads T2025e.txt … T2040e.txt from <folder>
//   node scripts/hko-calendar.mjs --fetch <folder>   downloads them there first
//
// Writes tests/fixtures/hko-calendar.json. The tables are at
// https://www.hko.gov.hk/en/gts/time/calendar/text/files/T<year>e.txt, one per year. A month that starts on a day shows
// as "1st Lunar Month" and so on in the lunar column; a leap month repeats the number of the month before it, so the
// first time a number appears is the ordinary month. ICU's Chinese calendar is not used: it puts Lunar New Year a day
// off in 2027 and 2030.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FIRST = 2025;
const LAST = 2040;
const SOURCE = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T{year}e.txt';

const args = process.argv.slice(2);
const fetching = args[0] === '--fetch';
const folder = fetching ? args[1] : args[0];
if (!folder) throw new Error('usage: node scripts/hko-calendar.mjs [--fetch] <folder>');

if (fetching) {
  mkdirSync(folder, { recursive: true });
  for (let year = FIRST; year <= LAST; year++) {
    const res = await fetch(SOURCE.replace('{year}', String(year)));
    if (!res.ok) throw new Error(`${year}: HTTP ${res.status}`);
    writeFileSync(join(folder, `T${year}e.txt`), Buffer.from(await res.arrayBuffer()));
  }
}

/** One row of a table: the Gregorian date as [month index, day], the lunar column and the solar term, if any. */
function rows(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s{2,}(.+?)\s{2,}\S+day\b\s*(.*)$/.exec(line);
    if (!m) continue;
    out.push({ date: [Number(m[2]) - 1, Number(m[3])], lunar: m[4].trim(), term: m[5].trim() });
  }
  return out;
}

/** The day [month index, day] that is `day` of the first lunar month numbered `month` to start in this year. */
function lunarDay(table, month, day) {
  const name = `${['', '1st', '2nd', '3rd'][month] ?? `${month}th`} Lunar Month`;
  const start = table.findIndex((r) => r.lunar === name);
  if (start < 0) throw new Error(`no ${name}`);
  const row = table[start + day - 1];
  if (!row || (day > 1 && Number(row.lunar) !== day)) throw new Error(`${name} has no day ${day}`);
  return row.date;
}

const years = {};
for (let year = FIRST; year <= LAST; year++) {
  const table = rows(readFileSync(join(folder, `T${year}e.txt`), 'latin1'));
  if (table.length < 365) throw new Error(`${year}: only ${table.length} days read`);
  const terms = {};
  for (const r of table) if (r.term) terms[r.term] = r.date;
  if (Object.keys(terms).length !== 24) throw new Error(`${year}: ${Object.keys(terms).length} solar terms`);
  years[year] = {
    newYear: lunarDay(table, 1, 1),
    dragonBoat: lunarDay(table, 5, 5),
    midAutumn: lunarDay(table, 8, 15),
    terms,
  };
}

writeFileSync(
  'tests/fixtures/hko-calendar.json',
  `${JSON.stringify({ source: SOURCE, note: 'Dates are [month index, day], as JavaScript counts months.', years }, null, 1)}\n`,
);
console.log(`hko-calendar: ${FIRST}-${LAST} written`);
