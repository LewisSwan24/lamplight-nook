import { fill, type LOCALES } from '../../shared/i18n';
import { GROWTH, type GrowthId } from '../../shared/growth';
import type { SceneId } from '../../shared/scenes';
import type { ActorId, AnchorId } from '../../shared/types';
import type { Period } from './daytime';
import { pieceData } from './pieces';
import type { Sky } from './weather';

/**
 * Everything fixed in the shop can be clicked (docs/information-structure.md, section 4). Pure: what stands where and
 * what it says. A reaction never costs anything: a line, a light, or someone strolling over. CafeScene shows it.
 */
const FIXED = ['clock', 'window', 'frontdoor', 'table', 'shelf', 'workbench', 'lamp', 'plant', 'plant2', 'cup', 'board', 'sofa'] as const;
export const OBJECT_IDS = FIXED;
export type FixedObject = (typeof FIXED)[number];
export type ObjectId = FixedObject | `grow-${GrowthId}`;

export type ObjectBox = { id: ObjectId; x: number; y: number; w: number; h: number };

/** Which piece of furniture (scripts/art/pieces.py) answers for which object. */
const PIECE_OF: Partial<Record<FixedObject, string>> = {
  table: 'table', shelf: 'shelf', workbench: 'workbench', lamp: 'lamp', plant: 'plant_l', plant2: 'plant_r', sofa: 'sofa',
};
/** On the wall, or small on the counter: the same in both scenes (cup: CafeScene, CUP_POS). */
const WALL: Partial<Record<FixedObject, { x: number; y: number; w: number; h: number }>> = {
  clock: { x: 180, y: 14, w: 16, h: 32 },
  window: { x: 16, y: 12, w: 64, h: 28 },
  frontdoor: { x: 288, y: 16, w: 16, h: 32 },
};
const CUP = { cafe: { x: 258, y: 78, w: 12, h: 14 }, study: { x: 234, y: 76, w: 12, h: 14 } };

export function objectBoxes(scene: SceneId): ObjectBox[] {
  const { pieces, grow } = pieceData(scene);
  const out: ObjectBox[] = [];
  for (const id of FIXED) {
    const name = PIECE_OF[id];
    const piece = name && pieces.find((p) => p.name === name);
    const place = piece ? { x: piece.x, y: piece.y, w: piece.w, h: piece.h } : WALL[id] ?? (id === 'cup' ? CUP[scene] : null);
    if (place) out.push({ id, ...place });
  }
  for (const g of GROWTH) out.push({ id: `grow-${g.id}`, ...(grow as Record<string, { x: number; y: number; w: number; h: number }>)[g.id] });
  return out;
}

export type ObjectContext = {
  running: boolean;
  hour: number;
  minute: number;
  sky: Sky;
  period: Period;
  /** Who is out on an errand. */
  errand: ActorId | null;
  /** What was handed over for this commission. */
  materials: string[];
  laoshiDoing: string;
  /** How many times this has been clicked, so it does not say the same thing every time. */
  turn: number;
};

export type Objects = (typeof LOCALES)['en']['ui']['objects'];
export type Reaction =
  | { say: string; by: ActorId; walk?: AnchorId; wiggle?: boolean }
  | { open: 'progress' }
  | { lamp: true };

const pick = (lines: string[], turn: number) => lines[turn % lines.length];

/** What clicking a thing does. */
export function objectReaction(id: ObjectId, ctx: ObjectContext, O: Objects): Reaction {
  if (id.startsWith('grow-')) {
    const g = GROWTH.find((x) => `grow-${x.id}` === id)!;
    if ('work' in g) return { say: O.grownMade[g.id], by: 'adeng' };
    return { say: fill(O.grownLine, { thing: O.grown[g.id], n: g.at }), by: 'adeng' };
  }
  const { running, turn } = ctx;
  switch (id as FixedObject) {
    case 'clock': {
      if (running) return { open: 'progress' };
      return { say: fill(O.clock, { time: `${ctx.hour}:${String(ctx.minute).padStart(2, '0')}` }), by: 'adeng' };
    }
    case 'window':
      return { say: fill(O.window, { sky: O.skies[ctx.sky], period: O.periods[ctx.period] }), by: 'qingdai' };
    case 'frontdoor':
      if (!running) return { say: O.door[ctx.sky], by: 'xiaoju' };
      return { say: ctx.errand ? fill(O.doorErrand, { name: O.actorNames[ctx.errand as keyof Objects['actorNames']] }) : O.doorNobody, by: 'adeng' };
    case 'table':
      if (!running) return { say: pick(O.table, turn), by: 'adeng' };
      return { say: ctx.materials.length ? fill(O.tableMaterials, { list: ctx.materials.join(O.listJoin) }) : O.tableNothing, by: 'adeng' };
    case 'shelf':
      return running ? { say: pick(O.shelfBusy, turn), by: 'laoshi' } : { say: pick(O.shelf, turn), by: 'laoshi', walk: 'shelf' };
    case 'workbench':
      if (running && ctx.laoshiDoing) return { say: fill(O.workbenchBusy, { doing: ctx.laoshiDoing }), by: 'laoshi' };
      return { say: pick(O.workbench, turn), by: 'laoshi' };
    case 'lamp':
      return { lamp: true };
    case 'plant':
    case 'plant2':
      return { say: pick(O.plant, turn), by: 'qingdai', wiggle: true };
    case 'cup':
      return { say: pick(O.cup, turn), by: 'adeng', wiggle: true };
    case 'board':
      return { say: pick(O.board, turn), by: 'qingdai' };
    case 'sofa':
      return { say: pick(O.sofa, turn), by: 'xiaoju' };
  }
}
