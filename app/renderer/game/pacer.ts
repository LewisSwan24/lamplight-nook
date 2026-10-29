/**
 * How many frames a second the shop draws. Pixel-art animations run at 4-12 frames a second, so 30 looks the
 * same as 60 for half the work; with nothing going on for a while it drops to 15 (idle loops still play).
 * When the window is hidden or minimized the browser stops drawing altogether.
 */
export const ACTIVE_FPS = 30;
export const RESTING_FPS = 15;
/** Quiet this long (no commission running, no clicks or keys) before resting. */
export const REST_AFTER_MS = 2 * 60_000;

export function framesPerSecond(state: { busy: boolean; sinceInputMs: number }): number {
  if (state.busy) return ACTIVE_FPS;
  return state.sinceInputMs >= REST_AFTER_MS ? RESTING_FPS : ACTIVE_FPS;
}

/** The part of Phaser's TimeStep the pacer adjusts (its limiter, set up by `fps.limit` in the game config). */
export type Loop = { _limitRate: number; fpsLimit: number };

export function applyFps(loop: Loop, fps: number) {
  loop.fpsLimit = fps;
  loop._limitRate = 1000 / fps;
}
