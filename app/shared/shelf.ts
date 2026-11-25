import { SHOPS, type Shop } from './dispatch';
import { WORK_ICONS, type WorkIcon } from './growth';
import { locale } from './i18n';
import { monthWords } from './localday';

type Shelved = { title: string; date: string; icon: WorkIcon; want?: string; shop: Shop };
/** Words, a kind and a shop (plan-1.8 H7), all at once; null is any. */
export type ShelfFilter = { query: string; kind: WorkIcon | null; shop?: Shop | null };

const plain = (text: string) => text.normalize('NFKC').toLowerCase();

/** One month at a time would be slow to ask for on every key pressed. */
const monthsSaid = new Map<string, string[]>();
function saidMonth(month: string): string[] {
  const key = `${locale()} ${month}`;
  if (!monthsSaid.has(key)) monthsSaid.set(key, monthWords(month, locale()).map(plain));
  return monthsSaid.get(key) as string[];
}

/** What someone remembers about a work: words from its name or from what they asked for, the month, or the kind of thing it was. */
export function filterWorks<T extends Shelved>(works: T[], { query, kind, shop }: ShelfFilter): T[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  return works.filter((w) => {
    if (kind && w.icon !== kind) return false;
    if (shop && w.shop !== shop) return false;
    const text = plain(`${w.title} ${w.want ?? ''} ${w.date}`);
    // From the start of the word only: 2月 is not 12月.
    const month = saidMonth(w.date.slice(0, 7));
    return words.every((word) => text.includes(word) || month.some((m) => m.startsWith(word)));
  });
}

export function kindsOf(works: Shelved[]): { kind: WorkIcon; n: number }[] {
  return WORK_ICONS.map((kind) => ({ kind, n: works.filter((w) => w.icon === kind).length })).filter((k) => k.n > 0);
}

/** The shops that made something on the shelf, in the street's order, home first. */
export function shopsOf(works: Shelved[]): { shop: Shop; n: number }[] {
  return SHOPS.map((shop) => ({ shop, n: works.filter((w) => w.shop === shop).length })).filter((s) => s.n > 0);
}

/** Works under their months, in the order given. */
export function byMonth<T extends Shelved>(works: T[]): { month: string; works: T[] }[] {
  const groups: { month: string; works: T[] }[] = [];
  for (const w of works) {
    const month = w.date.slice(0, 7);
    if (groups.at(-1)?.month === month) groups.at(-1)?.works.push(w);
    else groups.push({ month, works: [w] });
  }
  return groups;
}
