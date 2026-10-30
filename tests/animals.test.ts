import { describe, expect, it } from 'vitest';
import {
  BOWL_SPOT, DOG_AREA, DOG_HOME, DOG_ANIMS, HENHOUSE_DOOR, HEN_AREA, HEN_FRAME, HEN_ANIMS, LAWN, animalFrames, dogPlan, henPlan, indoors,
} from '../app/renderer/game/animals';
import { SPOTS } from '../app/renderer/game/garden';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const inside = (p: { x: number; y: number }, a: { x: number; y: number; w: number; h: number }) => p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;

describe('the garden animals', () => {
  it('go in out of the rain and the dark, and stay out otherwise', () => {
    expect(indoors('rain', 'day')).toBe(true);
    expect(indoors('clear', 'night')).toBe(true);
    expect(indoors('snow', 'dusk')).toBe(false);
    expect(dogPlan(Math.random, 'rain', 'day', null)).toMatchObject({ do: 'sleep', to: DOG_HOME });
    expect(henPlan(Math.random, 'clear', 'night', null)).toMatchObject({ do: 'roost', to: HENHOUSE_DOOR });
  });

  it('keep to their own corners on their own', () => {
    const rand = seeded(1);
    for (let i = 0; i < 200; i++) {
      const dog = dogPlan(rand, 'clear', 'day', null);
      const at = (p: { x: number; y: number }) => dog.to.x === p.x && dog.to.y === p.y;
      expect(inside(dog.to, DOG_AREA) || at(DOG_HOME) || at(BOWL_SPOT)).toBe(true);
      expect(inside(henPlan(rand, 'clear', 'day', null).to, HEN_AREA)).toBe(true);
    }
  });

  it('come over to whoever is out in the garden, without leaving the lawn', () => {
    const rand = seeded(2);
    for (const spot of SPOTS) {
      const dog = dogPlan(rand, 'clear', 'day', spot);
      expect(Math.abs(dog.to.x - spot.x)).toBeLessThanOrEqual(20);
      expect(inside(dog.to, LAWN)).toBe(true);
      // Facing whoever it sits with.
      expect(dog.facing).toBe(dog.to.x <= spot.x ? 'right' : 'left');
    }
    const feeder = SPOTS.find((s) => s.id === 'hens')!;
    for (let i = 0; i < 50; i++) {
      const hen = henPlan(rand, 'clear', 'day', feeder);
      expect(hen.do).toBe('peck');
      expect(Math.hypot(hen.to.x - feeder.x, hen.to.y - feeder.y)).toBeLessThan(26);
    }
  });

  it('use the right frames of their sheets', () => {
    expect(animalFrames(DOG_ANIMS.walk, 24, 'left')).toEqual([36, 37, 38, 39, 40, 41]);
    expect(animalFrames(DOG_ANIMS.bark, 24, 'down')).toEqual([81, 82, 83]);
    // The third hen's pecking, facing up: her rows start at 6.
    expect(animalFrames(HEN_ANIMS.peck, HEN_FRAME.perRow, 'up', 6)).toEqual([8 * 24 + 2, 8 * 24 + 3]);
  });
});
