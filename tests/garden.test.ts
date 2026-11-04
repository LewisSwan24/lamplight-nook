import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BACK_DOOR, BACK_DOOR_SPOT, GARDEN_DOOR_SPOT, GARDEN_TALK_MS, GAP_MS, GardenPlanner, GardenTalk, SPOTS, VISIT_MS,
  gardenOpen, outdoorsFor, pathInGarden, pathToBackDoor,
} from '../app/renderer/game/garden';
import { parseLines } from '../app/renderer/translator/lines';
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
    for (const a of ACTORS) {
      for (const anchor of Object.keys(ANCHORS) as (keyof typeof ANCHORS)[]) {
        const from = standPoint(anchor, a.id);
        const path = pathToBackDoor(from);
        expect(path.at(-1)).toEqual(BACK_DOOR_SPOT);
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

describe('the garden in different weather', () => {
  const everyone = ['adeng', 'xiaoju', 'laoshi', 'cat'] as const;

  it('stays empty in the rain and after dark', () => {
    expect(outdoorsFor([...everyone], 'rain', 'day')).toEqual([]);
    expect(outdoorsFor([...everyone], 'clear', 'night')).toEqual([]);
    expect(gardenOpen('rain', 'dusk')).toBe(false);
    expect(gardenOpen('clear', 'night')).toBe(false);
  });

  it('lets the staff out in the snow but keeps the cat in', () => {
    expect(outdoorsFor([...everyone], 'snow', 'day')).toEqual(['adeng', 'xiaoju', 'laoshi']);
    expect(gardenOpen('snow', 'day')).toBe(true);
  });

  it('is open to everyone on a dry day', () => {
    for (const sky of ['clear', 'leaves', 'petals'] as const) {
      expect(outdoorsFor([...everyone], sky, 'dawn')).toEqual([...everyone]);
      expect(gardenOpen(sky, 'dusk')).toBe(true);
    }
  });

  it('calls everyone back in when it gets dark', () => {
    const planner = new GardenPlanner(0, seeded(5));
    let out: string | undefined;
    for (let t = 0; t < 10 * 60_000 && !out; t += 5000) out = planner.next(t, gardenOpen('clear', 'day'), ['adeng']).go?.actor;
    expect(out).toBe('adeng');
    expect(planner.next(11 * 60_000, gardenOpen('clear', 'night'), []).back).toEqual(['adeng']);
  });
});

describe('what people say out in the garden', () => {
  const lines = parseLines(readFileSync('lines/cafe.yaml', 'utf8')).garden;

  it('has something to say for everyone at every spot they go to', () => {
    for (const spot of SPOTS) {
      for (const who of spot.who.filter((a) => a !== 'cat')) {
        expect(lines.filter((l) => l.speaker === who && l.when === `spot_${spot.id}`).length, `${who} at ${spot.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('waits a while between lines, and says nothing with nobody out there', () => {
    const talk = new GardenTalk(0, seeded(2));
    expect(talk.next(GARDEN_TALK_MS[1], lines, [], 'clear')).toBeNull();
    const out = [{ id: 'xiaoju' as const, spot: 'veg' as const }];
    expect(talk.next(GARDEN_TALK_MS[1] + 1000, lines, out, 'clear')).toBeNull();
    const at = 3 * GARDEN_TALK_MS[1];
    expect(talk.next(at, lines, out, 'clear')?.line?.when).toBe('spot_veg');
    expect(talk.next(at + 1000, lines, out, 'clear')).toBeNull();
  });

  it('talks soon after someone looks out', () => {
    const talk = new GardenTalk(0, seeded(2));
    talk.soon(1000);
    expect(talk.next(4000, lines, [{ id: 'adeng', spot: 'bench' }], 'clear')?.line?.speaker).toBe('adeng');
  });

  it('brings up the weather first, then the spot, without repeating until all are said', () => {
    const talk = new GardenTalk(0, seeded(3));
    const out = [{ id: 'laoshi' as const, spot: 'veg' as const }];
    const said = [1, 2, 3, 4].map((i) => talk.next(i * GARDEN_TALK_MS[1], lines, out, 'snow')!.line!);
    expect(said[0].id).toBe('garden_snow_laoshi');
    expect(new Set(said.map((l) => l.id)).size).toBe(4);
    expect(said.slice(1).every((l) => l.when === 'spot_veg')).toBe(true);
  });

  it('lets the cat doze instead of talking', () => {
    const talk = new GardenTalk(0, seeded(4));
    expect(talk.next(GARDEN_TALK_MS[1], lines, [{ id: 'cat', spot: 'sun' }], 'clear')).toEqual({ actor: 'cat' });
  });
});
