import { TEMPLATES, type BroughtId, type TemplateId } from './templates';

/**
 * What the shop gathers as commissions get done together (plan.md R2.2). Each piece appears once the shop
 * has finished that many commissions with the user, and stays: nothing goes away for not opening the app.
 * A piece with `work` counts only that kind of work instead (the templates say which), so the shop comes to look
 * like what was made in it. Another round of changes on the same work counts for neither: it is still one piece of work.
 * The pictures are overlays made by scripts/art/growth.py (assets/sprites/grow-<id>.png).
 */
const COUNTED = [
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
] as const;
type Growth = (typeof COUNTED)[number] | { id: BroughtId; at: number; work: TemplateId };
export const GROWTH: Growth[] = [
  ...COUNTED,
  ...TEMPLATES.flatMap((t) => ('growth' in t ? [{ id: t.growth.id, at: t.growth.at, work: t.id }] : [])),
];
export type GrowthId = Growth['id'];
/** How many finished works of each kind. */
export type Made = Partial<Record<WorkIcon, number>>;

/** The pieces the shop has with this many commissions done, and this many of each kind. */
export function grownBy(done: number, made: Made = {}): GrowthId[] {
  return GROWTH.filter((g) => ('work' in g ? (made[g.work] ?? 0) : done) >= g.at).map((g) => g.id);
}

export type WorkIcon = TemplateId | 'demo';
/** The demo's icon on the works shelf; each template names its own. */
const DEMO_ICON = 4;
/** Icons on the works shelf, in the order of assets/sprites/works.png (8x8 each). */
export const WORK_ICONS: readonly WorkIcon[] = Array.from({ length: TEMPLATES.length + 1 },
  (_, i) => (i === DEMO_ICON ? 'demo' : TEMPLATES.find((t) => t.icon === i)!.id));
export const workIcon = (form?: { demo?: boolean; template?: TemplateId }): WorkIcon =>
  form?.demo ? 'demo' : form?.template ?? 'page';

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

/**
 * The vegetable beds behind the shop grow with the works finished: a sprout every three, ripe three works later. Where
 * each stands in the garden (feet of the plant; scripts/art/garden.py, PLANTERS).
 */
export const BEDS = [
  { x: 22, y: 84 }, { x: 36, y: 84 }, { x: 56, y: 84 }, { x: 70, y: 84 },
  { x: 22, y: 112 }, { x: 36, y: 112 }, { x: 56, y: 112 }, { x: 70, y: 112 },
] as const;
export type BedStage = 'empty' | 'sprout' | 'ripe';
const BED_EVERY = 3;

export function bedStages(done: number): BedStage[] {
  return BEDS.map((_, i) => {
    const planted = i * BED_EVERY + 1;
    return done >= planted + BED_EVERY ? 'ripe' : done >= planted ? 'sprout' : 'empty';
  });
}

/** What is worth a word after finishing a work: the first sprout, the first ripe plant, all of them ripe. */
export function bedNews(before: number, after: number): 'bed_sprout' | 'bed_ripe' | 'bed_full' | null {
  const ripe = (done: number) => bedStages(done).filter((b) => b === 'ripe').length;
  if (ripe(after) === BEDS.length && ripe(before) < BEDS.length) return 'bed_full';
  if (ripe(after) > 0 && ripe(before) === 0) return 'bed_ripe';
  if (after > 0 && before === 0) return 'bed_sprout';
  return null;
}
