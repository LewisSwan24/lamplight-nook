import { bedNews } from './growth';
import { fill, strings } from './i18n';
import { localDay } from './localday';
import { crews } from './crew';
import { apprenticeNews, stageNews } from './staff';
import type { Memory } from './types';

/** Works worth their own line in the shop's days. */
const ROUND_NUMBERS = new Set([10, 25, 50, 100, 200, 300, 500, 1000]);

export type DayEntry = { date: string; text: string };

/** The start of that year's birthday. Born on the 29th of February, it is on the 28th in the years without one. */
function birthdayIn(first: Date, year: number): Date {
  const lastOfMonth = new Date(year, first.getMonth() + 1, 0).getDate();
  return new Date(year, first.getMonth(), Math.min(first.getDate(), lastOfMonth));
}

/**
 * How old the shop turns today, or 0 if today is not its birthday: the day the first work was finished. Not known once
 * the first work is no longer kept (versions before 1.0 kept only the last twenty).
 */
export function birthdayToday(works: { id: string }[], done: number, now = new Date()): number {
  if (!works.length || done !== works.length) return 0;
  const first = new Date(Math.min(...works.map((w) => madeAt(w.id))));
  const years = now.getFullYear() - first.getFullYear();
  return years > 0 && localDay(birthdayIn(first, now.getFullYear())) === localDay(now) ? years : 0;
}

/** Ids are c<time made>: the day and the order a work was first finished, whatever changes came after. */
const madeAt = (id: string) => Number(id.slice(1));
const dayOf = (time: number) => localDay(new Date(time));

/**
 * What has happened to this shop, newest first, read only from what it already remembers: works by name at the first and
 * at round numbers, what it gathered, who came for the first time, the apprentice and how they grew up (plan-1.9.md I2),
 * and how the vegetable beds did.
 */
export function shopTimeline(memory: Memory, now = new Date()): DayEntry[] {
  const shop = memory.shop;
  if (!shop) return [];
  const N = strings.ui.notebook;
  const beds = { bed_sprout: N.bedSprout, bed_ripe: N.bedRipe, bed_full: N.bedFull };
  const works = memory.commissions.filter((c) => c.result === 'done').sort((a, b) => madeAt(a.id) - madeAt(b.id));
  // Versions before 1.0 kept only the last twenty, so the first one here may not be the first ever.
  const before = shop.done - works.length;
  const entries: DayEntry[] = [];
  const grown = { 2: N.apprenticeHandy, 3: N.apprenticeGrown };
  let bean = 0;
  for (const { memo, crew } of crews(works)) {
    if (!crew.includes('xiaodou')) continue;
    const stage = stageNews(bean, ++bean);
    if (stage) entries.push({ date: dayOf(madeAt(memo.id)), text: grown[stage as 2 | 3] });
  }
  works.forEach((w, i) => {
    const n = before + i + 1;
    const date = dayOf(madeAt(w.id));
    if (n === 1) entries.push({ date, text: fill(N.firstWork, { title: w.title }) });
    if (ROUND_NUMBERS.has(n)) entries.push({ date, text: fill(N.nthWork, { n: String(n), title: w.title }) });
    const news = bedNews(n - 1, n);
    if (news) entries.push({ date, text: beds[news] });
    if (apprenticeNews(n - 1, n)) entries.push({ date, text: N.apprentice });
  });
  if (before === 0 && works.length) {
    const first = new Date(madeAt(works[0].id));
    for (let years = 1; birthdayIn(first, first.getFullYear() + years) <= now; years++) {
      entries.push({ date: localDay(birthdayIn(first, first.getFullYear() + years)), text: fill(N.birthday, { n: String(years) }) });
    }
  }
  for (const g of shop.grown) entries.push({ date: g.date, text: fill(N.grewLine, { item: strings.growth[g.id] }) });
  // A neighbour with no date was already coming before the shop kept count: not news.
  for (const m of (shop.met ?? []).filter((x) => x.date)) entries.push({ date: m.date, text: fill(N.metLine, { name: strings.guests[m.id] }) });
  // Oldest first with a stable sort, then turned round. Only the day is known for what grew and who came, so within a day this is not the order it happened in.
  return entries.sort((a, b) => a.date.localeCompare(b.date)).reverse();
}
