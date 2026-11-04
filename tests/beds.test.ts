import { describe, expect, it } from 'vitest';
import { BEDS, bedNews, bedStages } from '../app/shared/growth';

const ripe = (done: number) => bedStages(done).filter((b) => b === 'ripe').length;
const sprouts = (done: number) => bedStages(done).filter((b) => b === 'sprout').length;

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

  it('sit inside the garden, one for each stage in order', () => {
    expect(bedStages(0)).toHaveLength(BEDS.length);
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
