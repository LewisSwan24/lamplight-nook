/**
 * How many frames a second the shop draws. Pixel-art animations run at 4-12 frames a second, so 30 looks the
 * same as 60 for half the work; with nothing going on for a while it drops to 15 (idle loops still play).
 * When the window is hidden or minimized the browser stops drawing altogether.
 */
export const ACTIVE_FPS = 30;
export const RESTING_FPS = 15;
/**
 * Saving power, from settings (road-to-1.4.md D8): fewer frames, never fewer than the walks have (10 a second), so every
 * animation still shows each of its frames.
 */
export const SAVING_FPS = 20;
export const SAVING_RESTING_FPS = 10;
/** Quiet this long (no commission running, no clicks or keys) before resting. */
export const REST_AFTER_MS = 2 * 60_000;

export function framesPerSecond(state: { busy: boolean; sinceInputMs: number; saving?: boolean }): number {
  const [active, resting] = state.saving ? [SAVING_FPS, SAVING_RESTING_FPS] : [ACTIVE_FPS, RESTING_FPS];
  if (state.busy) return active;
  return state.sinceInputMs >= REST_AFTER_MS ? resting : active;
}

/** The part of Phaser's TimeStep the pacer adjusts (its limiter, set up by `fps.limit` in the game config). */
export type Loop = { _limitRate: number; fpsLimit: number };

export function applyFps(loop: Loop, fps: number) {
  loop.fpsLimit = fps;
  loop._limitRate = 1000 / fps;
}
