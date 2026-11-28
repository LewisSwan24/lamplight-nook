import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { RIVER } from '../app/renderer/game/town';
import { SFX } from '../app/renderer/audio/mix';
import { TOWER_STAGES, chimeKey, chimeLevel, handAngles, handsMove, strokesAt, towerNews, towerStage } from '../app/shared/tower';

const at = (hour: number, minute = 0) => new Date(2026, 11, 3, hour, minute, 20);

// plan-2.0.md J6: the old clock tower on the river street, mended stage by stage over the year's story (J7).
describe('the clock tower mended', () => {
  it('has six looks, from the stopped old frame to mended and lit', () => {
    expect(TOWER_STAGES).toEqual(['stopped', 'scaffold', 'roof', 'face', 'hands', 'lit']);
  });

  it('changes every two chapters of the year’s story: the scaffolding in April, the first chime in December', () => {
    expect([0, 1, 2, 3].map(towerStage)).toEqual(['stopped', 'stopped', 'stopped', 'stopped']);
    expect([4, 5, 6, 7, 8, 9, 10, 11].map(towerStage)).toEqual(['scaffold', 'scaffold', 'roof', 'roof', 'face', 'face', 'hands', 'hands']);
    expect(towerStage(12)).toBe('lit');
    expect(towerStage(40)).toBe('lit');
  });

  it('has news only when it moves on, not when it stays or is turned back', () => {
    expect(towerNews('stopped', 'scaffold')).toBe('tower_scaffold');
    expect(towerNews('face', 'lit')).toBe('tower_lit');
    expect(towerNews('roof', 'roof')).toBe(null);
    expect(towerNews('lit', 'stopped')).toBe(null);
  });

  it('keeps time once its hands are on', () => {
    expect(TOWER_STAGES.map(handsMove)).toEqual([false, false, false, false, true, true]);
    expect(handAngles(at(3, 0))).toEqual({ hour: 90, minute: 0 });
    expect(handAngles(at(18, 30))).toEqual({ hour: 195, minute: 180 });
    expect(handAngles(at(0, 15))).toEqual({ hour: 7.5, minute: 90 });
  });
});

describe('the hourly chime', () => {
  it('strikes the hour once mended: as many strokes as the hour, on the twelve-hour clock', () => {
    expect(strokesAt(at(15), 'lit')).toBe(3);
    expect(strokesAt(at(12), 'lit')).toBe(12);
    expect(strokesAt(at(9), 'lit')).toBe(9);
    expect(strokesAt(at(7), 'lit')).toBe(7);
    expect(strokesAt(at(21), 'lit')).toBe(9);
  });

  it('only on the hour, only once mended, and never at night (10 pm to 7 am)', () => {
    expect(strokesAt(at(15, 1), 'lit')).toBe(0);
    expect(strokesAt(at(15), 'hands')).toBe(0);
    for (const h of [22, 23, 0, 3, 6]) expect(strokesAt(at(h), 'lit'), `${h}:00`).toBe(0);
  });

  it('strikes each hour once, however often it is asked', () => {
    expect(chimeKey(at(15, 0))).toBe(chimeKey(new Date(2026, 11, 3, 15, 0, 50)));
    expect(chimeKey(at(15))).not.toBe(chimeKey(at(16)));
    expect(chimeKey(at(15))).not.toBe(chimeKey(new Date(2026, 11, 4, 15, 0, 0)));
  });

  it('is loudest on the river street, quieter on the first street, and faint indoors', () => {
    const river = chimeLevel({ street: 'river' });
    const main = chimeLevel({ street: 'main' });
    const riverRoom = chimeLevel({ room: 'bookshop' });
    const home = chimeLevel({ room: 'cafe' });
    expect(river).toBe(1);
    expect(main).toBeLessThan(river);
    expect(riverRoom).toBeLessThan(river);
    expect(home).toBeGreaterThan(0);
    expect(home).toBeLessThan(main);
    expect(home).toBeLessThan(riverRoom);
  });

  it('has its bell among the sounds, built and in the repository', () => {
    expect(SFX).toContain('bell');
    expect(existsSync(join(__dirname, '../assets/audio/bell.ogg'))).toBe(true);
  });
});

describe('the tower’s pictures and words', () => {
  const ROOT = join(__dirname, '..');

  it('has a picture for each look, the size of the tower’s plot, and where the clock face is', () => {
    const json = JSON.parse(readFileSync(join(ROOT, 'assets/sprites/tower.json'), 'utf8')) as { w: number; h: number; stages: string[]; face: { x: number; y: number; r: number } };
    expect(json.stages).toEqual([...TOWER_STAGES, 'lights']);
    expect([json.w, json.h]).toEqual([RIVER.tower.w, RIVER.tower.h]);
    expect(json.face.x).toBeGreaterThan(json.face.r);
    expect(json.face.x + json.face.r).toBeLessThan(json.w);
    expect(existsSync(join(ROOT, 'assets/sprites/tower.png'))).toBe(true);
  });

  it('has a word at home for each step of the mending and for the chime, in both languages', () => {
    const grow = (lang: string) => (parse(readFileSync(join(ROOT, 'lines', ...(lang === 'en' ? ['en'] : []), 'cafe.yaml'), 'utf8')).grow as { id: string; when?: string }[])
      .filter((l) => l.when?.startsWith('tower_'));
    const zh = grow('zh');
    for (const stage of TOWER_STAGES.slice(1)) expect(zh.some((l) => l.when === `tower_${stage}`), stage).toBe(true);
    expect(zh.filter((l) => l.when === 'tower_chime').length).toBeGreaterThanOrEqual(4);
    expect(grow('en').map((l) => [l.id, l.when])).toEqual(zh.map((l) => [l.id, l.when]));
  });
});
