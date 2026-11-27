import { describe, expect, it } from 'vitest';
import { HOME_PAIRS, crews, pairOf, worksBy, worksTogether } from '../app/shared/crew';
import type { CommissionMemo, CommissionTemplate, RoundStat } from '../app/shared/types';

// Who worked on what (plan-1.9.md I0): counted from the works' own records, never stored.

let n = 0;
type Helper = 'researcher' | 'designer' | 'reviewer' | 'unknown';
function memo(o: { template?: CommissionTemplate; helpers?: Helper[]; result?: 'done' | 'failed'; old?: boolean; demo?: boolean } = {}): CommissionMemo {
  n++;
  const round: RoundStat = { date: '2026-11-27', seconds: 60, helpers: Object.fromEntries((o.helpers ?? []).map((h) => [h, 1])), waits: 0, waitedSeconds: 0 };
  return {
    id: `c${n}`, title: `Work ${n}`, date: '2026-11-27', result: o.result ?? 'done', choices: {}, folder: `/works/${n}`,
    form: { want: 'something', ...(o.template ? { template: o.template } : {}), ...(o.demo ? { demo: true } : {}) },
    ...(o.old ? {} : { rounds: [round] }),
  };
}

describe('who worked on each work', () => {
  it('Wick takes every order; the helpers who were sent out count at home', () => {
    const [w] = crews([memo({ template: 'letter', helpers: ['researcher', 'reviewer'] })]);
    expect(w.crew.sort()).toEqual(['adeng', 'laoshi', 'xiaoju']);
  });

  it('an errand of no known helper is Clem’s, as on the stage', () => {
    expect(crews([memo({ helpers: ['unknown', 'designer'] })])[0].crew.sort()).toEqual(['adeng', 'qingdai', 'xiaoju']);
  });

  it('a helper sent out in any round counts once', () => {
    const m = memo({ helpers: ['reviewer'] });
    m.rounds!.push({ ...m.rounds![0], helpers: { reviewer: 2, designer: 1 } });
    expect(crews([m])[0].crew.sort()).toEqual(['adeng', 'laoshi', 'qingdai']);
  });

  it('a street shop’s work is its keeper’s, and the shop that finishes it too', () => {
    expect(crews([memo({ template: 'poster', helpers: ['reviewer'] })])[0].crew.sort()).toEqual(['adeng', 'xiaozhe']);
    expect(crews([memo({ template: 'picturebook', helpers: ['designer'] })])[0].crew.sort()).toEqual(['adeng', 'aqian', 'xiaozhe']);
  });

  it('a work from before 1.1, with no record of its helpers, is Wick’s alone', () => {
    expect(crews([memo({ old: true })])[0].crew).toEqual(['adeng']);
  });

  it('the demo is home’s, whatever its kind', () => {
    expect(crews([memo({ template: 'poster', demo: true })])[0].crew).toEqual(['adeng']);
  });

  it('only finished works count', () => {
    const list = crews([memo({ result: 'failed' }), memo()]);
    expect(list.map((w) => w.memo.id)).toEqual([`c${n}`]);
  });

  it('Bean works at home from the eleventh finished work, when he has come', () => {
    const works = [memo({ result: 'failed' }), ...Array.from({ length: 12 }, () => memo()), memo({ template: 'poster' })];
    const list = crews(works);
    expect(list.slice(0, 10).every((w) => !w.crew.includes('xiaodou'))).toBe(true);
    expect(list.slice(10, 12).every((w) => w.crew.includes('xiaodou'))).toBe(true);
    expect(list[12].crew).not.toContain('xiaodou');
  });
});

describe('how many works each did', () => {
  it('counts every member of staff, nought for those who did none', () => {
    const by = worksBy([memo({ helpers: ['researcher'] }), memo({ helpers: ['researcher', 'reviewer'] }), memo({ template: 'ledgerbook' }), memo({ result: 'failed', helpers: ['designer'] })]);
    expect(by).toMatchObject({ adeng: 3, xiaoju: 2, laoshi: 1, qingdai: 0, xiaodou: 0, aqian: 1, xiaozhe: 0, xiaoding: 0, guiyi: 0, axin: 0 });
  });
});

describe('how many works each two did together', () => {
  it('names a pair the same whichever way round', () => {
    expect(pairOf('laoshi', 'adeng')).toBe(pairOf('adeng', 'laoshi'));
  });

  it('has the ten pairs of the five at home', () => {
    expect(HOME_PAIRS).toHaveLength(10);
    expect(new Set(HOME_PAIRS).size).toBe(10);
  });

  it('counts a work once for every two who were both on it', () => {
    const together = worksTogether([memo({ helpers: ['researcher', 'reviewer'] }), memo({ helpers: ['reviewer'] }), memo({ template: 'poster', helpers: ['reviewer'] })]);
    expect(together[pairOf('adeng', 'laoshi')]).toBe(2);
    expect(together[pairOf('adeng', 'xiaoju')]).toBe(1);
    expect(together[pairOf('xiaoju', 'laoshi')]).toBe(1);
    expect(together[pairOf('qingdai', 'laoshi')]).toBe(0);
    expect(Object.keys(together).sort()).toEqual([...HOME_PAIRS].sort());
  });
});
