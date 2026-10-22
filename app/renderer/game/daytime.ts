/** Times of day; the shop's light and the view through the windows follow the system clock. */
export type Period = 'dawn' | 'day' | 'dusk' | 'night';

/** Dawn 5-8, day 8-17, dusk 17-19, night 19-5 (local time, whole hours). */
export function periodAt(hour: number): Period {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

export type Look = {
  /** Colour multiplied over the whole room (0xffffff = unchanged). */
  tint: number;
  /** Colour of the sky in the window panes, and how strongly it covers the glass. */
  sky: number;
  skyAlpha: number;
  /** Multiplier for the warm lamp glows: lamps matter more when it is dark outside. */
  lamps: number;
  /** Multiplier for the daylight falling in through the window: none at night. */
  sun: number;
};

/** Palette from art.md 2: dawn leans pale blue, day is the art as drawn, dusk orange-pink, night darker with brighter lamps. */
export const LOOKS: Record<Period, Look> = {
  dawn: { tint: 0xe4eaf4, sky: 0xbfd6ee, skyAlpha: 0.55, lamps: 0.8, sun: 0.7 },
  day: { tint: 0xffffff, sky: 0xffffff, skyAlpha: 0, lamps: 1, sun: 1 },
  dusk: { tint: 0xf6d6c2, sky: 0xf0a27c, skyAlpha: 0.7, lamps: 1.25, sun: 0.9 },
  night: { tint: 0x8086aa, sky: 0x34405e, skyAlpha: 0.92, lamps: 1.7, sun: 0 },
};

/** Milliseconds until the next whole hour, when the period may change. */
export function msToNextHour(now: Date): number {
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}
