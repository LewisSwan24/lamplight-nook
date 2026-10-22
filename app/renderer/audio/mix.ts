import type { Period } from '../game/daytime';

/** Sound effects, as built by scripts/audio/sfx.py into assets/audio/<name>.ogg. */
export const SFX = ['click', 'open', 'close', 'ask', 'success', 'fail', 'serious', 'door', 'mallet', 'pencil'] as const;
export type Sfx = (typeof SFX)[number];

/** Sounds of the shop itself (not the UI): softer, and never stacked on top of each other. */
const AMBIENT: Partial<Record<Sfx, { level: number; gapMs: number }>> = {
  door: { level: 0.7, gapMs: 1500 },
  mallet: { level: 0.6, gapMs: 6000 },
  pencil: { level: 0.5, gapMs: 8000 },
};
/** Music sits well under the effects, and quieter as the evening goes on (design 8). */
const MUSIC_LEVEL = 0.35;
const MUSIC_BY_PERIOD: Record<Period, number> = { dawn: 0.8, day: 1, dusk: 0.85, night: 0.6 };

export type MixState = { volume: number; muted: boolean; serious: boolean; period: Period };

/** Music volume, 0-1. Serious mode stops the music. */
export function musicVolume(s: MixState): number {
  if (s.muted || s.serious) return 0;
  return (s.volume / 100) * MUSIC_LEVEL * MUSIC_BY_PERIOD[s.period];
}

/**
 * Volume for one effect, 0-1, or 0 to skip it. During serious mode the only sound is the one alert;
 * shop sounds are skipped if the same one played too recently (lastAt: when it last played).
 */
export function sfxVolume(name: Sfx, s: MixState, now: number, lastAt?: number): number {
  if (s.muted || (s.serious && name !== 'serious')) return 0;
  const ambient = AMBIENT[name];
  if (ambient && lastAt !== undefined && now - lastAt < ambient.gapMs) return 0;
  return (s.volume / 100) * (ambient?.level ?? 1);
}
