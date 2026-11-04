import { bedNews, shortWork } from './growth';
import { fill, strings } from './i18n';
import type { Memory } from './types';

/** Works worth their own line in the shop's days. */
const ROUND_NUMBERS = new Set([10, 25, 50, 100, 200, 300, 500, 1000]);

export type DayEntry = { date: string; text: string };

/** Ids are c<time made>: the day and the order a work was first finished, whatever changes came after. */
const madeAt = (id: string) => Number(id.slice(1));
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * What has happened to this shop, newest first, read only from what it already remembers: works by name at the first and
 * at round numbers, what it gathered, who came for the first time, and how the vegetable beds did.
 */
export function shopTimeline(memory: Memory): DayEntry[] {
  const shop = memory.shop;
  if (!shop) return [];
  const N = strings.ui.notebook;
  const beds = { bed_sprout: N.bedSprout, bed_ripe: N.bedRipe, bed_full: N.bedFull };
  const works = memory.commissions.filter((c) => c.result === 'done').sort((a, b) => madeAt(a.id) - madeAt(b.id));
  // Versions before 1.0 kept only the last twenty, so the first one here may not be the first ever.
  const before = shop.done - works.length;
  const entries: DayEntry[] = [];
  works.forEach((w, i) => {
    const n = before + i + 1;
    const date = dayOf(madeAt(w.id));
    if (n === 1) entries.push({ date, text: fill(N.firstWork, { title: shortWork(w.title) }) });
    if (ROUND_NUMBERS.has(n)) entries.push({ date, text: fill(N.nthWork, { n: String(n), title: shortWork(w.title) }) });
    const news = bedNews(n - 1, n);
    if (news) entries.push({ date, text: beds[news] });
  });
  for (const g of shop.grown) entries.push({ date: g.date, text: fill(N.grewLine, { item: strings.growth[g.id] }) });
  for (const m of shop.met ?? []) entries.push({ date: m.date, text: fill(N.metLine, { name: strings.guests[m.id] }) });
  // Oldest first with a stable sort, then turned round, so that within a day the later thing comes first too.
  return entries.sort((a, b) => a.date.localeCompare(b.date)).reverse();
}
