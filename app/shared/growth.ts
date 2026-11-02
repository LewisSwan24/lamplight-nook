import type { CommissionTemplate } from './types';

/**
 * What the shop gathers as commissions get done together (plan.md R2.2). Each piece appears once the shop
 * has finished that many commissions with the user, and stays: nothing goes away for not opening the app.
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
] as const;
export type GrowthId = (typeof GROWTH)[number]['id'];

/** The pieces the shop has with this many commissions done. */
export function grownBy(done: number): GrowthId[] {
  return GROWTH.filter((g) => done >= g.at).map((g) => g.id);
}

/** Icons on the works shelf, in the order of assets/sprites/works.png (8x8 each). */
export const WORK_ICONS = ['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album'] as const;
export type WorkIcon = (typeof WORK_ICONS)[number];
export const workIcon = (form?: { demo?: boolean; template?: CommissionTemplate }): WorkIcon =>
  form?.demo ? 'demo' : form?.template && form.template !== 'page' ? form.template : 'page';

/** How many works fit on the shelf on the wall; the shelf card lists all of them. */
export const SHELF_SLOTS = 5;
