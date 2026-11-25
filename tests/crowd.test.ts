import { describe, expect, it } from 'vitest';
import { Crowd, GLANCE_MS, LANES, PASSER_LOOKS, crowdSize, hourOf, passerSpeed } from '../app/renderer/game/crowd';
import { FRONTS } from '../app/renderer/game/town';

// People on the street (plan-1.6.md F3): two to five passing at any hour of the day, more in the morning and evening,
// nobody deep in the night; fewer and quicker in the rain. They do not go in and say nothing; a click makes one look
// round. While the street is not on screen nobody moves.

/** A fixed sequence, so a walk is the same every run. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const VIEW = { left: 320, right: 640 };
const day = { hour: 12, sky: 'clear' as const, view: VIEW, onScreen: true };

describe('how many are out', () => {
  it('has two to five out through the day, most at the morning and evening rush', () => {
    for (let h = 6; h < 23; h++) {
      expect(crowdSize(h, 'clear'), `${h}:00`).toBeGreaterThanOrEqual(2);
      expect(crowdSize(h, 'clear'), `${h}:00`).toBeLessThanOrEqual(5);
    }
    expect(crowdSize(8, 'clear')).toBe(5);
    expect(crowdSize(18, 'clear')).toBe(5);
    expect(crowdSize(12, 'clear')).toBeLessThan(5);
    expect(crowdSize(21, 'clear')).toBeLessThan(crowdSize(12, 'clear'));
  });

  it('has nobody out deep in the night', () => {
    for (const h of [23, 0, 2, 4, 5]) expect(crowdSize(h, 'clear'), `${h}:00`).toBe(0);
  });

  it('has fewer out in the rain or the snow, but someone all the same, and they walk faster in the rain', () => {
    for (const sky of ['rain', 'snow'] as const) {
      for (const h of [8, 12, 21]) {
        expect(crowdSize(h, sky), `${sky} ${h}:00`).toBeLessThan(crowdSize(h, 'clear'));
        expect(crowdSize(h, sky), `${sky} ${h}:00`).toBeGreaterThanOrEqual(1);
      }
    }
    expect(crowdSize(2, 'rain')).toBe(0);
    expect(passerSpeed('rain')).toBeGreaterThan(passerSpeed('clear'));
    expect(passerSpeed('petals')).toBe(passerSpeed('clear'));
  });

  it('takes the hour the shop shows: the clock\'s when it agrees, else one in the middle of that part of the day', () => {
    expect(hourOf('day', 12)).toBe(12);
    expect(hourOf('dusk', 18)).toBe(18);
    expect(hourOf('night', 14)).toBe(2);
    expect(hourOf('day', 2)).toBe(12);
    expect(crowdSize(hourOf('night', 14), 'clear')).toBe(0);
  });
});

describe('the crowd', () => {
  it('fills the view at once the first time it is seen, each on a lane of the pavement, each with a look of their own', () => {
    const crowd = new Crowd(seq(0.1, 0.5, 0.9, 0.3, 0.7));
    crowd.tick(16, day);
    expect(crowd.passers).toHaveLength(crowdSize(12, 'clear'));
    for (const p of crowd.passers) {
      expect(p.x).toBeGreaterThanOrEqual(VIEW.left);
      expect(p.x).toBeLessThanOrEqual(VIEW.right);
      expect(LANES).toContain(p.y);
      expect(p.look).toBeGreaterThanOrEqual(1);
      expect(p.look).toBeLessThanOrEqual(PASSER_LOOKS);
    }
  });

  it('puts nobody out at night', () => {
    const crowd = new Crowd(seq(0.4));
    crowd.tick(16, { ...day, hour: 2 });
    for (let i = 0; i < 50; i++) crowd.tick(500, { ...day, hour: 2 });
    expect(crowd.passers).toEqual([]);
  });

  it('does nothing at all while the street is not on screen', () => {
    const crowd = new Crowd(seq(0.2, 0.6, 0.8));
    crowd.tick(16, day);
    const before = structuredClone(crowd.passers);
    for (let i = 0; i < 20; i++) crowd.tick(1000, { ...day, onScreen: false });
    expect(crowd.passers).toEqual(before);
    const fresh = new Crowd(seq(0.2));
    fresh.tick(5000, { ...day, onScreen: false });
    expect(fresh.passers).toEqual([]);
  });

  it('walks each along their lane at the speed of the weather', () => {
    const crowd = new Crowd(seq(0.9));
    crowd.tick(16, day);
    const walking = crowd.passers.filter((p) => p.pose === 'walk');
    const at = walking.map((p) => p.x);
    crowd.tick(500, day);
    walking.forEach((p, i) => expect(Math.abs(p.x - at[i])).toBeCloseTo(passerSpeed('clear') / 2, 5));
  });

  it('lets go of whoever has walked out of the view and sends someone else along after a while', () => {
    const crowd = new Crowd(seq(0.9));
    crowd.tick(16, day);
    const first = crowd.passers.map((p) => p.id);
    for (let i = 0; i < 60; i++) crowd.tick(500, day);
    const now = crowd.passers.map((p) => p.id);
    expect(now.some((id) => !first.includes(id))).toBe(true);
    expect(crowd.passers.length).toBeLessThanOrEqual(crowdSize(12, 'clear'));
    for (const p of crowd.passers) expect(p.x).toBeGreaterThanOrEqual(VIEW.left - 40);
  });

  it('has some stop at a door for a moment, facing the shop, then walk on', () => {
    // 0.05: everyone stops at the first door ahead of them.
    const crowd = new Crowd(seq(0.05));
    crowd.tick(16, day);
    const p = crowd.passers.find((q) => q.stopAt !== null)!;
    expect(FRONTS.map((f) => f.door)).toContain(p.stopAt);
    for (let i = 0; i < 400 && p.pose !== 'look'; i++) crowd.tick(50, day);
    expect(p.pose).toBe('look');
    expect(p.x).toBe(p.stopAt);
    crowd.tick(500, day);
    expect(p.x).toBe(p.stopAt);
    for (let i = 0; i < 20 && p.pose === 'look'; i++) crowd.tick(500, day);
    expect(p.pose).toBe('walk');
    crowd.tick(500, day);
    expect(p.x).not.toBe(p.stopAt);
  });

  it('has the one clicked look round for a moment, then walk on', () => {
    const crowd = new Crowd(seq(0.9));
    crowd.tick(16, day);
    const p = crowd.passers[0];
    expect(crowd.idAt(p.x, p.y - 10)).toBe(p.id);
    expect(crowd.idAt(p.x, p.y + 30)).toBeNull();
    crowd.glance(p.id);
    expect(p.pose).toBe('glance');
    const x = p.x;
    crowd.tick(GLANCE_MS - 100, day);
    expect(p.x).toBe(x);
    crowd.tick(200, day);
    expect(p.pose).not.toBe('glance');
  });

  it('thins out when it starts raining: nobody new comes along until there are few enough', () => {
    const crowd = new Crowd(seq(0.9));
    crowd.tick(16, { ...day, hour: 8 });
    expect(crowd.passers).toHaveLength(5);
    const rain = { ...day, hour: 8, sky: 'rain' as const };
    for (let i = 0; i < 120; i++) crowd.tick(500, rain);
    expect(crowd.passers.length).toBeLessThanOrEqual(crowdSize(8, 'rain'));
    for (const p of crowd.passers.filter((q) => q.pose === 'walk')) expect(p.speed).toBe(passerSpeed('rain'));
  });
});
