import { describe, expect, it } from 'vitest';
import { BEDS, bedFrame, bedNews, bedStages } from '../app/shared/growth';

const ripe = (done: number) => bedStages(done, 'summer').filter((b) => b === 'ripe').length;
const sprouts = (done: number) => bedStages(done, 'summer').filter((b) => b === 'sprout').length;

describe('the vegetable beds behind the shop', () => {
  it('are bare before anything has been made', () => {
    expect(ripe(0)).toBe(0);
    expect(sprouts(0)).toBe(0);
  });

  it('start with one sprout at the first finished work', () => {
    expect(sprouts(1)).toBe(1);
    expect(ripe(1)).toBe(0);
  });

  it('only ever grow', () => {
    for (let done = 1; done < 40; done++) {
      expect(ripe(done)).toBeGreaterThanOrEqual(ripe(done - 1));
      expect(ripe(done) + sprouts(done)).toBeGreaterThanOrEqual(ripe(done - 1) + sprouts(done - 1));
    }
  });

  it('are all ripe in the end, and stay so', () => {
    expect(ripe(30)).toBe(BEDS.length);
    expect(ripe(500)).toBe(BEDS.length);
    expect(sprouts(500)).toBe(0);
  });

  it('keep growing the same way whatever the season until they are all ripe', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (let done = 0; done < 25; done++) expect(bedStages(done, season), `${season} ${done}`).toEqual(bedStages(done, 'summer'));
    }
  });

  it('once full, follow the seasons: young plants in spring, ripe in summer, harvest in autumn, winter greens in winter', () => {
    for (const done of [25, 60, 500]) {
      expect(new Set(bedStages(done, 'spring'))).toEqual(new Set(['young']));
      expect(new Set(bedStages(done, 'summer'))).toEqual(new Set(['ripe']));
      expect(new Set(bedStages(done, 'autumn'))).toEqual(new Set(['harvest']));
      // Since 1.7 (plan-1.7.md G2) six beds grow winter greens and two rest under straw.
      const winter = bedStages(done, 'winter');
      expect(winter.filter((b) => b === 'winter')).toHaveLength(BEDS.length - 2);
      expect(winter.filter((b) => b === 'rest')).toHaveLength(2);
    }
  });

  it('are news only the first time they fill, not when the seasons turn', () => {
    expect(bedNews(24, 25)).toBe('bed_full');
    for (let done = 26; done <= 100; done++) expect(bedNews(done - 1, done)).toBeNull();
  });

  it('sit inside the garden, one for each stage in order', () => {
    expect(bedStages(0, 'summer')).toHaveLength(BEDS.length);
    for (const b of BEDS) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + 16).toBeLessThanOrEqual(320);
      expect(b.y).toBeLessThanOrEqual(180);
    }
  });

  it('are worth a word three times only: first sprout, first ripe, and all ripe', () => {
    const said: string[] = [];
    for (let done = 1; done <= 40; done++) {
      const news = bedNews(done - 1, done);
      if (news) said.push(news);
    }
    expect(said).toEqual(['bed_sprout', 'bed_ripe', 'bed_full']);
  });

  it('say nothing when no new work was finished', () => {
    expect(bedNews(5, 5)).toBeNull();
  });
});

describe('what the beds look like', () => {
  it('has a picture for every stage of every bed, each season its own crop', async () => {
    const { readPng } = await import('./png');
    const sheet = readPng('assets/sprites/garden-crops.png');
    const frames = sheet.width / 16;
    const seen = new Set<number>();
    for (const stage of ['sprout', 'ripe', 'young', 'harvest', 'rest', 'winter'] as const) {
      for (let i = 0; i < BEDS.length; i++) {
        const f = bedFrame(stage, i);
        expect(f, `${stage} ${i}`).toBeLessThan(frames);
        let solid = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (sheet.at(f * 16 + x, y).alpha > 0) solid++;
        expect(solid, `${stage} ${i}`).toBeGreaterThan(4);
        seen.add(f);
      }
    }
    // The ripe summer crops, spring's young plants, autumn's harvest and winter's greens are all different pictures.
    expect(seen.size).toBeGreaterThanOrEqual(8 * 3 + 2 + 6);
  });
});
