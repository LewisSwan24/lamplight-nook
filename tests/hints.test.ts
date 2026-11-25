import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HINTS_SHOWN, suggestions } from '../app/renderer/ui/hints';
import { HOLIDAYS, SEASONS } from '../app/renderer/game/weather';
import { LOCALES } from '../app/shared/i18n';

// Suggestions on the commission slip that fit the time of year (plan-1.7.md G5).

/** Seeded random, so runs are repeatable. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe('suggestions for the commission slip', () => {
  it('has six for every season and three for every festival, as many in each language', () => {
    for (const L of Object.values(LOCALES)) {
      const tries = L.ui.tries;
      for (const s of SEASONS) expect(tries.seasons[s], s).toHaveLength(6);
      for (const h of HOLIDAYS) expect(tries.holidays[h], h).toHaveLength(3);
      for (const t of [...Object.values(tries.seasons), ...Object.values(tries.holidays)].flat()) {
        expect(t.trim().length, t).toBeGreaterThan(0);
        expect(t.length, t).toBeLessThanOrEqual(40);
      }
    }
  });

  it('gives three from the season on an ordinary day, never the same one twice', () => {
    const winter = LOCALES.en.ui.tries.seasons.winter;
    for (let seed = 1; seed < 30; seed++) {
      const got = suggestions(at(2027, 1, 20), LOCALES.en.ui.tries, seeded(seed));
      expect(got).toHaveLength(HINTS_SHOWN);
      expect(new Set(got).size).toBe(HINTS_SHOWN);
      for (const g of got) expect(winter).toContain(g);
    }
  });

  it("puts the festival's first during a festival, then one for the season", () => {
    // Mid-Autumn 2027 is 15 September (tests/fixtures/hko-calendar.json).
    const tries = LOCALES['zh-CN'].ui.tries;
    const got = suggestions(at(2027, 9, 15), tries, seeded(3));
    expect(tries.holidays.mid_autumn).toContain(got[0]);
    expect(tries.holidays.mid_autumn).toContain(got[1]);
    expect(tries.seasons.autumn).toContain(got[2]);
  });

  it('turns up every suggestion for the season over enough days', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) for (const g of suggestions(at(2027, 4, 10), LOCALES.en.ui.tries, seeded(seed))) seen.add(g);
    expect([...seen].sort()).toEqual([...LOCALES.en.ui.tries.seasons.spring].sort());
  });

  it('only shows on a new commission: the revise slip has none', () => {
    expect(readFileSync('app/renderer/ui/revise.ts', 'utf8')).not.toMatch(/suggestions|tries/);
    expect(readFileSync('app/renderer/ui/panels.ts', 'utf8')).toMatch(/suggestions\(/);
  });
});
