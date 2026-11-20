import { describe, expect, it } from 'vitest';
import { ANCHORS, CANVAS, SEATS, ZONES, standPoint } from '../app/renderer/game/layout';
import { INSET, PAVEMENT_Y, STOPS, STREET, STRIP_TOP, VIEW, panFor, routeHome, stopForTool, walkMs } from '../app/renderer/game/street';
import { doorOf, streetArea, TOWN } from '../app/renderer/game/town';

describe('street inset', () => {
  it('fits on the canvas and keeps clear of the counter, the table seats and the corner', () => {
    expect(INSET.x + INSET.w).toBeLessThanOrEqual(CANVAS.width);
    expect(INSET.y + INSET.h).toBeLessThanOrEqual(CANVAS.height);
    const counter = ZONES.find((z) => z.id === 'counter')!;
    expect(counter.y + counter.h).toBeLessThan(INSET.y);
    for (const spot of Object.values(SEATS.table ?? {})) expect(spot!.y < INSET.y || spot!.x + 8 <= INSET.x).toBe(true);
    for (const id of ['adeng', 'xiaoju', 'laoshi'] as const) {
      // A character is 16px wide, centred on its feet.
      expect(standPoint('corner', id, 'cafe').x + 8).toBeLessThanOrEqual(INSET.x);
    }
    expect(ANCHORS.counter.y).toBeLessThan(INSET.y);
  });

  it('shows the strip at full height and every shop door is on the strip', () => {
    expect(VIEW.h).toBe(STREET.height);
    for (const x of Object.values(STOPS)) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(STREET.width);
    }
  });

  it('pans to keep the walker centred, but never past either end of the strip', () => {
    expect(panFor(0)).toBe(0);
    expect(panFor(VIEW.w / 2)).toBe(0);
    expect(panFor(STOPS.library)).toBe(Math.round(STOPS.library - VIEW.w / 2));
    expect(panFor(STREET.width)).toBe(STREET.width - VIEW.w);
  });

  it('sends web lookups to the post office and everything else to the library', () => {
    expect(stopForTool('WebSearch')).toBe('post');
    expect(stopForTool('WebFetch')).toBe('post');
    expect(stopForTool('Read')).toBe('library');
    expect(stopForTool(undefined)).toBe('library');
  });

  it("is the town's own street: the strip is as wide as the town, and each stop is a front's door (road-to-1.4.md D1)", () => {
    expect(STREET.width).toBe(TOWN.width);
    // The page's shop is the cafe in tests; the books are in the other room, the study.
    expect(STOPS.nook).toBe(doorOf('cafe').x);
    expect(STOPS.library).toBe(doorOf('study').x);
    expect(STOPS.bakery).toBe(doorOf('bakery').x);
    expect(STOPS.post).toBe(doorOf('post').x);
  });

  it("shows the pavement through the inset, where the town's walkers go", () => {
    const area = streetArea();
    expect(STRIP_TOP + PAVEMENT_Y).toBeGreaterThanOrEqual(area.top);
    expect(STRIP_TOP + PAVEMENT_Y).toBeLessThanOrEqual(area.bottom);
  });

  it('comes home past the bakery from the far shops, straight home from nearer', () => {
    expect(routeHome(STOPS.post)).toEqual(['bakery', 'nook']);
    expect(routeHome(STOPS.library)).toEqual(['nook']);
    expect(routeHome(STOPS.bakery)).toEqual(['nook']);
    expect(routeHome(STOPS.nook)).toEqual(['nook']);
  });

  it('walks at a steady speed', () => {
    expect(walkMs(0, 72)).toBe(1000);
    expect(walkMs(72, 0)).toBe(1000);
  });
});
