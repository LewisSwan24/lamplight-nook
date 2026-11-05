import { describe, expect, it } from 'vitest';
import { PASSER_FEET, WINDOW_PANES, passBy } from '../app/renderer/game/passers';

describe('someone passing the windows on the street', () => {
  it('comes along the wall past every pane and ends at the front door', () => {
    const { from, to } = passBy('in');
    for (const pane of WINDOW_PANES) {
      expect(from).toBeLessThan(pane.x);
      expect(to).toBeGreaterThan(pane.x + pane.w);
    }
    expect(to).toBeGreaterThanOrEqual(288);
  });

  it('leaves the same way it came', () => {
    expect(passBy('out')).toEqual({ from: passBy('in').to, to: passBy('in').from, ms: passBy('in').ms });
  });

  it('is quick enough not to hold up what happens next', () => {
    expect(passBy('in').ms).toBeLessThanOrEqual(4500);
    expect(passBy('in').ms).toBeGreaterThanOrEqual(2500);
  });

  it('shows head and shoulders in the glass, with the feet below the sill', () => {
    const top = Math.min(...WINDOW_PANES.map((p) => p.y));
    const bottom = Math.max(...WINDOW_PANES.map((p) => p.y + p.h));
    expect(PASSER_FEET).toBeGreaterThan(bottom);
    expect(PASSER_FEET - 30).toBeGreaterThanOrEqual(top);
    expect(PASSER_FEET - 30).toBeLessThan(bottom);
  });
});
