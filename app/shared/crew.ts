import { APPRENTICE_AT, AGENT_ACTOR, ALL_STAFF, STAFF } from './staff';
import { shopOf, template } from './templates';
import type { Shop } from './dispatch';
import type { ActorId, AiEvent, CommissionMemo } from './types';

/**
 * Who worked on what (plan-1.9.md I0), counted from the works' own records and never stored, so nothing old needs
 * upgrading. The staff's stories (I1), the friendships at home (I4), the works they remember (I5) and how far Bean has
 * come (I2) all go by these counts.
 *
 * Wick takes every order. At home, Clem, Iris and Flint count on a work when their errand was sent out in any of its
 * rounds, and Bean on every work once he has come. A street shop's work is its keeper's, and the keeper's of the shop
 * that finishes it. Works from before 1.1 have no record of their helpers and are Wick's alone.
 */
export type Staffer = Exclude<ActorId, 'cat'>;

const KEEPER: Record<Exclude<Shop, 'home'>, Staffer> = { print: 'aqian', studio: 'xiaozhe', workshop: 'xiaoding', bakery: 'guiyi', post: 'axin' };
const HELPERS: Exclude<AiEvent['agent'], 'main'>[] = ['researcher', 'designer', 'reviewer', 'unknown'];

/** Every finished work, in order, with who was on it. */
export function crews(memos: CommissionMemo[]): { memo: CommissionMemo; crew: Staffer[] }[] {
  return memos.filter((m) => m.result === 'done').map((memo, i) => {
    const id = memo.form?.demo ? undefined : memo.form?.template;
    const shop = shopOf(id);
    const crew = new Set<Staffer>(['adeng']);
    if (shop !== 'home') {
      crew.add(KEEPER[shop]);
      const then = id && template(id).then;
      if (then) crew.add(KEEPER[then]);
    } else if (memo.rounds) {
      for (const h of HELPERS) if (memo.rounds.some((r) => (r.helpers[h] ?? 0) > 0)) crew.add(AGENT_ACTOR[h] as Staffer);
      if (i >= APPRENTICE_AT) crew.add('xiaodou');
    }
    return { memo, crew: [...crew] };
  });
}

/** How many finished works each member of staff was on. */
export function worksBy(memos: CommissionMemo[]): Record<Staffer, number> {
  const by = Object.fromEntries(ALL_STAFF.map((s) => [s, 0])) as Record<Staffer, number>;
  for (const { crew } of crews(memos)) for (const s of crew) by[s]++;
  return by;
}

/** A pair of the five at home, named the same whichever way round: in the order of the portraits. */
export const pairOf = (a: Staffer, b: Staffer) => [a, b].sort((x, y) => STAFF.indexOf(x) - STAFF.indexOf(y)).join('+');
/** The ten pairs of the five at home. */
export const HOME_PAIRS: string[] = STAFF.flatMap((a, i) => STAFF.slice(i + 1).map((b) => pairOf(a as Staffer, b as Staffer)));

/** How many finished works each pair at home was on together. */
export function worksTogether(memos: CommissionMemo[]): Record<string, number> {
  const together = Object.fromEntries(HOME_PAIRS.map((p) => [p, 0]));
  for (const { crew } of crews(memos)) {
    const home = crew.filter((s) => STAFF.includes(s));
    home.forEach((a, i) => home.slice(i + 1).forEach((b) => together[pairOf(a, b)]++));
  }
  return together;
}
