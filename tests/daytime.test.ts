import { describe, expect, it } from 'vitest';
import { LOOKS, msToNextHour, periodAt } from '../app/renderer/game/daytime';

describe('time of day', () => {
  it('splits the day into four periods by the hour', () => {
    const at = (h: number) => periodAt(h);
    expect([4, 5, 7, 8, 16, 17, 18, 19, 23, 0].map(at)).toEqual(
      ['night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night'],
    );
  });

  it('covers every hour', () => {
    for (let h = 0; h < 24; h++) expect(LOOKS[periodAt(h)]).toBeDefined();
  });

  it('leaves the daytime art as drawn and brightens lamps at night', () => {
    expect(LOOKS.day.tint).toBe(0xffffff);
    expect(LOOKS.day.skyAlpha).toBe(0);
    expect(LOOKS.night.lamps).toBeGreaterThan(LOOKS.day.lamps);
    expect(LOOKS.night.sun).toBe(0);
  });

  it('waits until the next whole hour', () => {
    expect(msToNextHour(new Date(2026, 9, 22, 16, 59, 30))).toBe(30_000);
    expect(msToNextHour(new Date(2026, 9, 22, 23, 0, 0))).toBe(3_600_000);
  });
});
