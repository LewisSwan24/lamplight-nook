import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Every walk of every actor in every scene: seconds of work, longer on a busy machine.
vi.setConfig({ testTimeout: 60_000 });
import { GARDEN_AREA, GARDEN_DOOR_SPOT, SPOTS, pathInGarden, pathToBackDoor } from '../app/renderer/game/garden';
import { ANCHORS, CANVAS, pathBetween, seatsIn, standPoint, walkBetween } from '../app/renderer/game/layout';
import { GUEST_DOOR, GUEST_SPOT } from '../app/renderer/game/guests';
import { YOU_SEAT } from '../app/renderer/game/you';
import { HOLIDAYS, SEASONS } from '../app/renderer/game/weather';
import { STAFF } from '../app/shared/staff';
import type { ActorId, AnchorId } from '../app/shared/types';
import { readPng } from './png';

type Point = { x: number; y: number };
type Box = { name: string; left: number; right: number; top: number; bottom: number };
const box = (name: string, left: number, right: number, top: number, bottom: number): Box => ({ name, left, right, top, bottom });

/** The floor under what stands in the room, measured from cafe.png and study.png; what rises above it can hide a walker. */
const SHARED = [box('left chair', 98, 111, 86, 98), box('right chair', 189, 202, 86, 98), box('workbench', 128, 144, 144, 158)];
const FURNITURE: Record<string, Box[]> = {
  cafe: [
    ...SHARED,
    box('plant', 4, 20, 63, 71),
    box('shelf', 8, 56, 136, 152),
    box('table and bench', 124, 181, 80, 127),
    box('counter', 216, 270, 86, 94),
    box('lamp', 272, 285, 169, 175),
    box('plant by the door', 300, 318, 135, 143),
  ],
  study: [
    ...SHARED,
    box('plant', 2, 20, 63, 71),
    box('bookcase', 8, 55, 141, 157),
    box('sofa', 129, 177, 115, 135),
    box('reading table', 122, 184, 90, 103),
    box('desk', 218, 243, 89, 97),
    box('tall desk', 246, 278, 89, 97),
    box('lamp', 274, 289, 155, 163),
    box('plant by the door', 300, 316, 131, 139),
  ],
};

/** The room a walker's feet and shadow take up. */
const FEET = { x: 5, up: 2, down: 1 };
const hits = (p: Point, b: Box) => p.x + FEET.x > b.left && p.x - FEET.x < b.right && p.y + FEET.down > b.top && p.y - FEET.up < b.bottom;

/** Every point along a walk, a pixel or so apart. */
function along(points: Point[]): Point[] {
  const out: Point[] = [];
  // The last step onto a bench or sofa is the sitting down, so it lands in the furniture on purpose.
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s <= steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return out.filter((p) => !SITTING.some((s) => Math.abs(p.x - s.x) <= 2 && p.y >= s.y - 3 && p.y <= s.y + 16));
}

const SITTING = (['cafe', 'study'] as const).flatMap((s) => Object.values(seatsIn(s).table ?? {}).filter((p) => p.chair));

const ANCHOR_IDS = Object.keys(ANCHORS) as AnchorId[];

/** Each walk a character can take in the shop. */
function walks(scene: 'cafe' | 'study'): { name: string; points: Point[] }[] {
  const out: { name: string; points: Point[] }[] = [];
  for (const actor of STAFF) {
    for (const from of ANCHOR_IDS) {
      for (const to of ANCHOR_IDS) {
        if (from === to) continue;
        const start = standPoint(from, actor, scene);
        out.push({ name: `${actor}: ${from} to ${to}`, points: [start, ...pathBetween(start, to, actor, scene)] });
      }
    }
  }
  const catHome = standPoint('window', 'cat', scene);
  const catCounter = standPoint('counter', 'cat', scene);
  out.push({ name: 'cat: window to counter', points: [catHome, ...pathBetween(catHome, 'counter', 'cat', scene)] });
  out.push({ name: 'cat: counter to window', points: [catCounter, ...pathBetween(catCounter, 'window', 'cat', scene)] });
  const trips: [string, Point, Point][] = [
    ['door to counter', GUEST_DOOR, GUEST_SPOT], ['counter to the door', GUEST_SPOT, GUEST_DOOR],
    ['counter to the seat', GUEST_SPOT, YOU_SEAT], ['seat to the counter', YOU_SEAT, GUEST_SPOT],
  ];
  for (const [name, from, to] of trips) out.push({ name, points: [from, ...walkBetween(from, to, scene)] });
  for (const actor of STAFF) {
    for (const from of ANCHOR_IDS) {
      const start = standPoint(from, actor, scene);
      out.push({ name: `${actor}: ${from} to the back door`, points: [start, ...pathToBackDoor(start, scene)] });
    }
  }
  return out;
}

const sprite = (name: string) => readPng(resolve(__dirname, '..', 'assets', 'sprites', name));

describe('walking through the shop', () => {
  for (const [scene, furniture] of Object.entries(FURNITURE)) {
    it(`no walk crosses the furniture in the ${scene}`, () => {
      const crossed = new Set<string>();
      for (const walk of walks(scene as 'cafe' | 'study')) {
        for (const p of along(walk.points)) {
          for (const b of furniture) if (hits(p, b)) crossed.add(`${walk.name} crosses the ${b.name}`);
        }
      }
      expect([...crossed]).toEqual([]);
    });
  }

  // What stands on the floor: every holiday's decorations, the season's, and the pieces the shop gathers past fifty.
  const onFloor = [...HOLIDAYS.map((h) => `decor-${h}`), ...SEASONS.map((s) => `season-${s}`), 'grow-aquarium', 'grow-gramophone'];
  for (const name of onFloor) {
    it(`no walk crosses ${name} on the floor`, () => {
      const decor = sprite(`${name}.png`);
      const crossed = new Set<string>();
      for (const walk of [...walks('cafe'), ...walks('study')]) {
        for (const p of along(walk.points)) {
          for (let y = Math.round(p.y - FEET.up); y <= p.y + FEET.down; y++) {
            for (let x = Math.round(p.x - FEET.x); x <= p.x + FEET.x; x++) {
              if (x >= 0 && x < decor.width && y >= 0 && y < decor.height && decor.at(x, y).alpha > 0) crossed.add(walk.name);
            }
          }
        }
      }
      expect([...crossed]).toEqual([]);
    });
  }

  it('keeps everyone on the canvas', () => {
    const off = [...walks('cafe'), ...walks('study')].filter((w) => along(w.points).some((p) => p.x < 0 || p.x > CANVAS.width || p.y < 0 || p.y > CANVAS.height));
    expect(off.map((w) => w.name)).toEqual([]);
  });

  it('no walk crosses anything in the garden', () => {
    const places: Point[] = [GARDEN_DOOR_SPOT, ...SPOTS];
    const crossed: string[] = [];
    for (const a of places) {
      for (const b of places) {
        for (const p of along([a, ...pathInGarden(a, b)])) {
          for (const o of GARDEN_AREA.obstacles) {
            if (hits(p, { name: '', ...o })) crossed.push(`${a.x},${a.y} to ${b.x},${b.y}`);
          }
        }
      }
    }
    expect([...new Set(crossed)]).toEqual([]);
  });

  it('takes the same way every time', () => {
    const from = standPoint('shelf', 'adeng');
    expect(pathBetween(from, 'door', 'adeng', 'cafe')).toEqual(pathBetween(from, 'door', 'adeng', 'cafe'));
  });

  it('never stands two characters on one spot', () => {
    const crowded: string[] = [];
    for (const anchor of ANCHOR_IDS) {
      const actors: ActorId[] = anchor === 'window' || anchor === 'counter' ? [...STAFF, 'cat'] : STAFF;
      for (const a of actors) {
        for (const b of actors) {
          if (a >= b) continue;
          const [p, q] = [standPoint(anchor, a), standPoint(anchor, b)];
          if (Math.hypot(p.x - q.x, p.y - q.y) < 8) crowded.push(`${a} and ${b} at the ${anchor}`);
        }
      }
    }
    expect(crowded).toEqual([]);
  });
});
