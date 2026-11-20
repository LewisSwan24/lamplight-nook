import { describe, expect, it } from 'vitest';
import { hitsFeet } from '../app/renderer/game/path';
import { WALK_SPEED } from '../app/renderer/game/life';
import { CAMERA_W, FRONTS, MOVERS, cameraFor, doorOf, entering, frontAt, paradePlan, streetArea, streetWalk, TOWN } from '../app/renderer/game/town';

// The town's street (road-to-1.4.md D1): seven fronts along a pavement wider than the canvas.

describe('the street', () => {
  it('has seven fronts in a row, the cafe first and the post office last, inside the street', () => {
    expect(FRONTS.map((f) => f.id)).toEqual(['cafe', 'study', 'print', 'studio', 'workshop', 'bakery', 'post']);
    for (const [a, b] of FRONTS.slice(1).map((f, i) => [FRONTS[i], f])) expect(b.x).toBeGreaterThan(a.x + a.w);
    expect(FRONTS.at(-1)!.x + FRONTS.at(-1)!.w).toBeLessThanOrEqual(TOWN.width);
  });

  it('stands every door on the pavement, clear of the lamps and benches', () => {
    const area = streetArea();
    for (const f of FRONTS) {
      const d = doorOf(f.id);
      expect(d.x).toBe(f.door);
      expect(d.y).toBeGreaterThanOrEqual(area.top);
      expect(area.obstacles.some((o) => hitsFeet(d, o)), f.id).toBe(false);
    }
  });

  it('walks from every door to every other without going through anything', () => {
    const area = streetArea();
    for (const a of FRONTS) {
      for (const b of FRONTS) {
        if (a === b) continue;
        const walk = streetWalk(doorOf(a.id), doorOf(b.id));
        expect(walk.at(-1), `${a.id} to ${b.id}`).toEqual(doorOf(b.id));
        for (const p of walk) expect(area.obstacles.some((o) => hitsFeet(p, o)), `${a.id} to ${b.id} at ${p.x},${p.y}`).toBe(false);
        for (const p of walk) expect(p.y >= area.top && p.y <= area.bottom, `${a.id} to ${b.id} leaves the pavement`).toBe(true);
      }
    }
  });

  it('knows which front was clicked, and nothing between them', () => {
    const study = FRONTS.find((f) => f.id === 'study')!;
    expect(frontAt(study.x + 4, 100)).toBe('study');
    expect(frontAt(study.x - 4, 100)).toBeNull();
    expect(frontAt(study.x + 4, TOWN.kerb + 20)).toBeNull();
  });

  it('pans to keep a point in the middle, without showing past either end', () => {
    expect(cameraFor(0)).toBe(0);
    expect(cameraFor(TOWN.width)).toBe(TOWN.width - CAMERA_W);
    expect(cameraFor(500)).toBe(500 - CAMERA_W / 2);
  });
});

describe('moving into the town (road-to-1.4.md D7)', () => {
  it('the four who opened the shop carry it in', () => {
    expect(MOVERS).toEqual(['adeng', 'xiaoju', 'laoshi', 'qingdai']);
  });

  for (const at of ['cafe', 'study'] as const) {
    it(`walks each of them in from beyond the right of the view to the ${at} door, one after another, at their own pace`, () => {
      const door = doorOf(at).x;
      const right = cameraFor(door) + CAMERA_W;
      const plan = paradePlan(MOVERS, at);
      expect(plan.map((p) => p.actor)).toEqual(MOVERS);
      for (const p of plan) {
        expect(p.to).toBe(door);
        expect(p.from).toBeGreaterThan(right);
        expect(p.ms).toBeCloseTo(((p.from - p.to) / WALK_SPEED[p.actor]) * 1000, 0);
      }
      for (const [a, b] of plan.slice(1).map((p, i) => [plan[i], p])) expect(b.delay).toBeGreaterThan(a.delay);
      // Short enough to sit through.
      expect(Math.max(...plan.map((p) => p.delay + p.ms))).toBeLessThan(15_000);
    });
  }
});

describe('going in at a front (road-to-1.4.md D2)', () => {
  it('goes back into the room you came out of, busy or not', () => {
    expect(entering('cafe', { here: 'cafe', busy: false })).toBe('back');
    expect(entering('print', { here: 'print', busy: true })).toBe('back');
  });

  it('goes into another room, the home shop included, only while nothing is being worked on', () => {
    expect(entering('studio', { here: 'cafe', busy: false })).toBe('visit');
    expect(entering('cafe', { here: 'studio', busy: false })).toBe('visit');
    expect(entering('study', { here: 'cafe', busy: false })).toBe('visit');
    expect(entering('studio', { here: 'cafe', busy: true })).toBe('busy');
    expect(entering('cafe', { here: 'workshop', busy: true })).toBe('busy');
  });

  it("only has a word for the neighbours' shops", () => {
    expect(entering('bakery', { here: 'cafe', busy: false })).toBe('closed');
    expect(entering('post', { here: 'cafe', busy: true })).toBe('closed');
  });
});
