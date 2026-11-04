import type { CommissionTemplate } from './types';

/**
 * What the shop gathers as commissions get done together (plan.md R2.2). Each piece appears once the shop
 * has finished that many commissions with the user, and stays: nothing goes away for not opening the app.
 * A piece with `work` counts only that kind of work instead, so the shop comes to look like what was made in it.
 * Another round of changes on the same work counts for neither: it is still one piece of work.
 * The pictures are overlays made by scripts/art/growth.py (assets/sprites/grow-<id>.png).
 */
export const GROWTH = [
  { id: 'painting', at: 1 },
  { id: 'plant', at: 2 },
  { id: 'lights', at: 3 },
  { id: 'fruit', at: 5 },
  { id: 'guitar', at: 8 },
  { id: 'bonsai', at: 12 },
  { id: 'easel', at: 16 },
  { id: 'trophy', at: 20 },
  { id: 'portrait', at: 25 },
  { id: 'sunset', at: 35 },
  { id: 'star', at: 50 },
  { id: 'album', at: 1, work: 'album' },
  { id: 'calendar', at: 1, work: 'plan' },
  { id: 'globe', at: 2, work: 'research' },
  { id: 'letters', at: 2, work: 'letter' },
  { id: 'ledger', at: 2, work: 'sheet' },
  { id: 'monitor', at: 3, work: 'page' },
] as const;
export type GrowthId = (typeof GROWTH)[number]['id'];
/** How many finished works of each kind. */
export type Made = Partial<Record<WorkIcon, number>>;

/** The pieces the shop has with this many commissions done, and this many of each kind. */
export function grownBy(done: number, made: Made = {}): GrowthId[] {
  return GROWTH.filter((g) => ('work' in g ? (made[g.work] ?? 0) : done) >= g.at).map((g) => g.id);
}

/** Icons on the works shelf, in the order of assets/sprites/works.png (8x8 each). */
export const WORK_ICONS = ['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album'] as const;
export type WorkIcon = (typeof WORK_ICONS)[number];
export const workIcon = (form?: { demo?: boolean; template?: CommissionTemplate }): WorkIcon =>
  form?.demo ? 'demo' : form?.template && form.template !== 'page' ? form.template : 'page';

export function madeOf(works: { icon: WorkIcon }[]): Made {
  const made: Made = {};
  for (const { icon } of works) made[icon] = (made[icon] ?? 0) + 1;
  return made;
}

/** A work's title as a neighbour would say it in a bubble. */
export function shortWork(title: string): string {
  const chars = [...title];
  return chars.length > 10 ? `${chars.slice(0, 10).join('')}…` : title;
}

/** How many works fit on the shelf on the wall; the shelf card lists all of them. */
export const SHELF_SLOTS = 5;
