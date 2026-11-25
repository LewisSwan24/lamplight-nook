import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Every walk of every actor in every scene: seconds of work, longer on a busy machine.
vi.setConfig({ testTimeout: 60_000 });
import { GARDEN_AREA, GARDEN_DOOR_SPOT, SPOTS, pathInGarden, pathToBackDoor } from '../app/renderer/game/garden';
import { ANCHORS, CANVAS, SECOND_CREW, SECOND_SEATS, pathBetween, seatsIn, standPoint, walkBetween } from '../app/renderer/game/layout';
import { GUEST_DOOR, GUEST_SPOT, POST_SPOT } from '../app/renderer/game/guests';
import { YOU_SEAT } from '../app/renderer/game/you';
import { HOLIDAYS, SEASONS } from '../app/renderer/game/weather';
import { pieceData } from '../app/renderer/game/pieces';
import { isScene, type RoomId } from '../app/shared/scenes';
import { ROOM_CREW, STAFF } from '../app/shared/staff';
import type { ActorId, AnchorId } from '../app/shared/types';
import { readPng } from './png';

type Point = { x: number; y: number };
type Box = { name: string; left: number; right: number; top: number; bottom: number };
const box = (name: string, left: number, right: number, top: number, bottom: number): Box => ({ name, left, right, top, bottom });

/** The floor under what stands in the room, measured from cafe.png and study.png; what rises above it can hide a walker. */
const SHARED = [box('left chair', 98, 111, 86, 98), box('right chair', 189, 202, 86, 98), box('workbench', 128, 144, 144, 158), box('filing cabinet', 65, 79, 112, 120)];
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

// The shops along the street (D2): the floor under each piece, as pieces.json measures it.
for (const room of ['print', 'studio', 'workshop', 'bakery', 'post'] as const) {
  FURNITURE[room] = pieceData(room).pieces.map((p) => box(p.name, p.x, p.x + p.w, p.y + p.h - p.foot, p.y + p.h));
}

const SITTING = (['cafe', 'study'] as const).flatMap((s) => Object.values(seatsIn(s).table ?? {}).filter((p) => p.chair));

const ANCHOR_IDS = Object.keys(ANCHORS) as AnchorId[];

/** Each walk a character can take in the shop. */
function walks(scene: RoomId): { name: string; points: Point[] }[] {
  const out: { name: string; points: Point[] }[] = [];
  // A shop along the street has its own people (D2); the second crew and the cat are the home shop's.
  const crew = isScene(scene) ? STAFF : ROOM_CREW[scene];
  for (const actor of crew) {
    for (const from of ANCHOR_IDS) {
      for (const to of ANCHOR_IDS) {
        if (from === to) continue;
        const start = standPoint(from, actor, scene);
        out.push({ name: `${actor}: ${from} to ${to}`, points: [start, ...pathBetween(start, to, actor, scene)] });
      }
    }
  }
  // The second crew's own places (road-to-1.2.md B9), to and from every zone.
  for (const actor of isScene(scene) ? SECOND_CREW : []) {
    for (const from of ANCHOR_IDS) {
      for (const to of ANCHOR_IDS) {
        if (from === to) continue;
        const start = standPoint(from, actor, scene, true);
        out.push({ name: `${actor} (second crew): ${from} to ${to}`, points: [start, ...pathBetween(start, to, actor, scene, true)] });
      }
      const first = standPoint(from, actor, scene);
      out.push({ name: `${actor}: ${from} to the second crew's ${from}`, points: [first, ...pathBetween(first, from, actor, scene, true)] });
    }
  }
  if (isScene(scene)) {
    const catHome = standPoint('window', 'cat', scene);
    const catCounter = standPoint('counter', 'cat', scene);
    out.push({ name: 'cat: window to counter', points: [catHome, ...pathBetween(catHome, 'counter', 'cat', scene)] });
    out.push({ name: 'cat: counter to window', points: [catCounter, ...pathBetween(catCounter, 'window', 'cat', scene)] });
  }
  const trips: [string, Point, Point][] = [
    ['door to counter', GUEST_DOOR, GUEST_SPOT], ['counter to the door', GUEST_SPOT, GUEST_DOOR],
    ['counter to the seat', GUEST_SPOT, YOU_SEAT], ['seat to the counter', YOU_SEAT, GUEST_SPOT],
    ['door to the letter holder', GUEST_DOOR, POST_SPOT], ['letter holder to the door', POST_SPOT, GUEST_DOOR],
  ];
  for (const [name, from, to] of trips) out.push({ name, points: [from, ...walkBetween(from, to, scene)] });
  for (const actor of crew) {
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
      for (const walk of walks(scene as RoomId)) {
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

  // The new shops' own festival decorations (D6): a frame each in shops-decor.png, row by shop, column by festival.
  const shopsDecor = sprite('shops-decor.png');
  (['print', 'studio', 'workshop', 'bakery', 'post'] as const).forEach((room, row) => {
    it(`no walk crosses the festival decorations on the floor of the ${room}`, () => {
      // Which festivals paint each pixel of the floor, so the walks are gone through once.
      const painted = new Map<number, string[]>();
      HOLIDAYS.forEach((holiday, col) => {
        for (let y = 0; y < 180; y++) {
          for (let x = 0; x < 320; x++) if (shopsDecor.at(col * 320 + x, row * 180 + y).alpha > 0) painted.set(y * 320 + x, [...(painted.get(y * 320 + x) ?? []), holiday]);
        }
      });
      const crossed = new Set<string>();
      for (const walk of walks(room)) {
        for (const p of along(walk.points)) {
          for (let y = Math.round(p.y - FEET.up); y <= p.y + FEET.down; y++) {
            for (let x = Math.round(p.x - FEET.x); x <= p.x + FEET.x; x++) {
              for (const holiday of painted.get(y * 320 + x) ?? []) crossed.add(`${holiday}: ${walk.name}`);
            }
          }
        }
      }
      expect([...crossed]).toEqual([]);
    });
  });

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
    const from = standPoint('shelf', 'adeng', 'cafe');
    expect(pathBetween(from, 'door', 'adeng', 'cafe')).toEqual(pathBetween(from, 'door', 'adeng', 'cafe'));
  });

  it('never stands two characters on one spot', () => {
    const crowded: string[] = [];
    for (const anchor of ANCHOR_IDS) {
      const actors: ActorId[] = anchor === 'window' || anchor === 'counter' ? [...STAFF, 'cat'] : STAFF;
      for (const a of actors) {
        for (const b of actors) {
          if (a >= b) continue;
          const [p, q] = [standPoint(anchor, a, 'cafe'), standPoint(anchor, b, 'cafe')];
          if (Math.hypot(p.x - q.x, p.y - q.y) < 8) crowded.push(`${a} and ${b} at the ${anchor}`);
        }
      }
    }
    expect(crowded).toEqual([]);
  });

  it('gives the second crew a place of its own in every zone, clear of the first (B9)', () => {
    // Where the second crew gathers by Qingdai to hand over work and to meet: on her side of the blackboard.
    expect(Object.keys(SECOND_SEATS.board ?? {}).sort()).toEqual(['laoshi', 'xiaodou', 'xiaoju']);
    const crowded: string[] = [];
    for (const scene of ['cafe', 'study'] as const) {
      for (const anchor of ANCHOR_IDS) {
        for (const a of SECOND_CREW) {
          const p = standPoint(anchor, a, scene, true);
          for (const b of [...STAFF, 'cat' as const]) {
            if (a === b) continue;
            const others = [standPoint(anchor, b, scene), ...(SECOND_CREW.includes(b) ? [standPoint(anchor, b, scene, true)] : [])];
            if (others.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 8)) crowded.push(`${a} (second crew) and ${b} at the ${anchor} in the ${scene}`);
          }
        }
      }
    }
    expect(crowded).toEqual([]);
  });
});
