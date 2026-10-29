import { describe, expect, it } from 'vitest';
import { BACK_DOOR, BACK_DOOR_SPOT, GARDEN_DOOR_SPOT, GAP_MS, GardenPlanner, SPOTS, VISIT_MS, pathInGarden, pathToBackDoor } from '../app/renderer/game/garden';
import { ACTORS, ANCHORS, CANVAS, ZONES, standPoint } from '../app/renderer/game/layout';

/** Seeded random, so runs are repeatable. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const along = (from: { x: number; y: number }, path: { x: number; y: number }[]) => {
  const points: { x: number; y: number }[] = [];
  let a = from;
  for (const b of path) {
    for (let t = 0; t <= 1; t += 0.05) points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    a = b;
  }
  return points;
};

describe('the way to the back garden', () => {
  it('has the back door on the wall, clear of the front door and the clock', () => {
    const door = ZONES.find((z) => z.id === 'door')!;
    expect(BACK_DOOR.x + 16).toBeLessThanOrEqual(door.x);
    expect(BACK_DOOR.x).toBeGreaterThanOrEqual(196);
  });

  it('walks from every home to the back door without crossing furniture', () => {
    const furniture = ZONES.filter((z) => ['shelf', 'table', 'corner', 'counter'].includes(z.id));
    const inside = (p: { x: number; y: number }) => furniture.find((z) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h);
    for (const a of ACTORS) {
      for (const anchor of Object.keys(ANCHORS) as (keyof typeof ANCHORS)[]) {
        const from = standPoint(anchor, a.id);
        const path = pathToBackDoor(from);
        expect(path.at(-1)).toEqual(BACK_DOOR_SPOT);
        for (const p of along(from, path)) expect(inside(p)?.id, `${a.id} from ${anchor}`).toBeUndefined();
      }
    }
  });

  it('crosses the lawn to every spot and back to the door, staying in the garden', () => {
    for (const spot of SPOTS) {
      const there = pathInGarden(GARDEN_DOOR_SPOT, spot);
      expect(there.at(-1)).toEqual({ x: spot.x, y: spot.y });
      expect(pathInGarden(spot, GARDEN_DOOR_SPOT).at(-1)).toEqual(GARDEN_DOOR_SPOT);
      for (const p of along(GARDEN_DOOR_SPOT, there)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(CANVAS.width);
        expect(p.y).toBeGreaterThanOrEqual(GARDEN_DOOR_SPOT.y);
        expect(p.y).toBeLessThan(CANVAS.height - 16);
      }
    }
  });

  it('has something to do out there for everyone, the cat included', () => {
    for (const a of ACTORS) expect(SPOTS.some((s) => s.who.includes(a.id)), a.id).toBe(true);
  });
});

describe('garden visits', () => {
  const everyone = ACTORS.map((a) => a.id);

  it('waits a while after opening before anyone wanders out', () => {
    const p = new GardenPlanner(0, seeded(1));
    expect(p.next(GAP_MS[0] - 1, true, everyone).go).toBeUndefined();
    expect(p.next(GAP_MS[1], true, everyone).go).toBeDefined();
  });

  it('sends one at a time to a spot they like, and brings them back after the visit', () => {
    const p = new GardenPlanner(0, seeded(2));
    const { go } = p.next(GAP_MS[1], true, everyone);
    expect(go!.spot.who).toContain(go!.actor);
    expect(p.next(GAP_MS[1] + 1000, true, everyone).go).toBeUndefined();
    const back = p.next(GAP_MS[1] + VISIT_MS[1], true, everyone).back;
    expect(back).toEqual([go!.actor]);
    expect(p.visitors).toEqual([]);
  });

  it('calls everyone in as soon as the shop gets busy, and nobody goes out while it is', () => {
    const p = new GardenPlanner(0, seeded(3));
    const { go } = p.next(GAP_MS[1], true, everyone);
    expect(p.next(GAP_MS[1] + 1000, false, everyone).back).toEqual([go!.actor]);
    expect(p.next(GAP_MS[1] * 3, false, everyone).go).toBeUndefined();
  });

  it('only picks someone who is free', () => {
    const p = new GardenPlanner(0, seeded(4));
    expect(p.next(GAP_MS[1], true, []).go).toBeUndefined();
    expect(p.next(GAP_MS[1] + 5000, true, ['cat']).go?.actor).toBe('cat');
  });
});
