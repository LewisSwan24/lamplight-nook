import { describe, expect, it } from 'vitest';
import { STAFF_ANIMS, animKey, facingTowards, resolveFacing, staffFrames } from '../app/renderer/game/sprites';

describe('staff sprite sheet layout', () => {
  it('walking down uses the last six frames of the walk row', () => {
    expect(staffFrames('walk', 'down')).toEqual([130, 131, 132, 133, 134, 135]);
  });

  it('sitting only faces left or right', () => {
    expect(resolveFacing(['right', 'left'], 'down')).toBe('right');
    expect(staffFrames('sit', 'left')[0]).toBe(4 * 56 + 6);
    expect(animKey('adeng', 'sit', 'up')).toBe('adeng-sit-right');
  });

  it('front-only animations have one key whatever the facing', () => {
    expect(animKey('xiaoju', 'read', 'left')).toBe('xiaoju-read');
    expect(staffFrames('read', 'up')).toHaveLength(12);
  });

  it('every animation stays inside its row', () => {
    for (const [name, def] of Object.entries(STAFF_ANIMS)) {
      const frames = staffFrames(name, 'down');
      expect(Math.floor(frames.at(-1)! / 56), name).toBe(def.row);
    }
  });

  it('faces the way it walks', () => {
    expect(facingTowards({ x: 0, y: 0 }, { x: 10, y: 2 })).toBe('right');
    expect(facingTowards({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe('up');
  });
});
