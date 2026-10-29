import { describe, expect, it } from 'vitest';
import { ACTIVE_FPS, REST_AFTER_MS, RESTING_FPS, applyFps, framesPerSecond } from '../app/renderer/game/pacer';

describe('frame pacing', () => {
  it('draws at 30 while a commission runs, however long nobody touches anything', () => {
    expect(framesPerSecond({ busy: true, sinceInputMs: 60 * 60_000 })).toBe(ACTIVE_FPS);
  });

  it('rests at 15 once the shop has been quiet for two minutes', () => {
    expect(framesPerSecond({ busy: false, sinceInputMs: REST_AFTER_MS - 1 })).toBe(ACTIVE_FPS);
    expect(framesPerSecond({ busy: false, sinceInputMs: REST_AFTER_MS })).toBe(RESTING_FPS);
  });

  it('moves the frame limiter of a running loop', () => {
    const loop = { fpsLimit: 30, _limitRate: 1000 / 30 };
    applyFps(loop, 15);
    expect(loop).toEqual({ fpsLimit: 15, _limitRate: 1000 / 15 });
  });
});
