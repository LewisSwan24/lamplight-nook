import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANCHORS, CANVAS, pathBetween, standPoint } from '../app/renderer/game/layout';
import { GUEST_DOOR, GUEST_PATH, GUEST_SPOT } from '../app/renderer/game/guests';
import { PATH_OUT, PATH_TO_COUNTER, PATH_TO_SEAT, YOU_SEAT } from '../app/renderer/game/you';
import type { ActorId, AnchorId } from '../app/shared/types';
import { readPng } from './png';

type Point = { x: number; y: number };
type Box = { name: string; left: number; right: number; top: number; bottom: number };
const box = (name: string, left: number, right: number, top: number, bottom: number): Box => ({ name, left, right, top, bottom });

/** What stands on the floor, measured from cafe.png and study.png (shadows may be included). */
const SHARED = [box('left chair', 98, 111, 77, 98), box('right chair', 189, 202, 77, 98), box('workbench', 128, 144, 144, 158)];
const FURNITURE: Record<string, Box[]> = {
  cafe: [
    ...SHARED,
    box('plant', 4, 20, 40, 71),
    box('shelf', 8, 56, 112, 152),
    box('table and bench', 124, 181, 72, 127),
    box('counter', 216, 270, 46, 78),
    box('lamp', 272, 285, 140, 175),
    box('plant by the door', 300, 318, 112, 143),
  ],
  study: [
    ...SHARED,
    box('plant', 2, 20, 40, 71),
    box('bookcase', 8, 55, 108, 157),
    box('sofa', 62, 110, 146, 175),
    box('reading table', 122, 184, 84, 103),
    box('desk', 218, 243, 60, 81),
    box('tall desk', 246, 278, 40, 81),
    box('lamp', 274, 289, 138, 163),
    box('plant by the door', 300, 316, 108, 139),
  ],
};

/** The room a walker's feet and shadow take up. */
const FEET = { x: 5, up: 2, down: 1 };
const hits = (p: Point, b: Box) => p.x + FEET.x > b.left && p.x - FEET.x < b.right && p.y + FEET.down > b.top && p.y - FEET.up < b.bottom;

/** Every point along a walk, a pixel or so apart. */
function along(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s <= steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return out;
}

const STAFF: ActorId[] = ['adeng', 'xiaoju', 'laoshi', 'qingdai'];
const ANCHOR_IDS = Object.keys(ANCHORS) as AnchorId[];

/** Each walk a character can take in the shop. */
function walks(): { name: string; points: Point[] }[] {
  const out: { name: string; points: Point[] }[] = [];
  for (const actor of STAFF) {
    for (const from of ANCHOR_IDS) {
      for (const to of ANCHOR_IDS) {
        if (from === to) continue;
        const start = standPoint(from, actor);
        out.push({ name: `${actor}: ${from} to ${to}`, points: [start, ...pathBetween(start, to, actor)] });
      }
    }
  }
  const catHome = standPoint('window', 'cat');
  out.push({ name: 'cat: window to counter', points: [catHome, ...pathBetween(catHome, 'counter', 'cat')] });
  out.push({ name: 'guest: door to counter', points: [GUEST_DOOR, ...GUEST_PATH] });
  out.push({ name: 'you: counter to the door', points: [GUEST_SPOT, ...PATH_OUT] });
  out.push({ name: 'you: counter to the seat', points: [GUEST_SPOT, ...PATH_TO_SEAT] });
  out.push({ name: 'you: seat to the counter', points: [YOU_SEAT, ...PATH_TO_COUNTER] });
  return out;
}

const sprite = (name: string) => readPng(resolve(__dirname, '..', 'assets', 'sprites', name));

describe('walking through the shop', () => {
  for (const [scene, furniture] of Object.entries(FURNITURE)) {
    it(`no walk crosses the furniture in the ${scene}`, () => {
      const crossed = new Set<string>();
      for (const walk of walks()) {
        for (const p of along(walk.points)) {
          for (const b of furniture) if (hits(p, b)) crossed.add(`${walk.name} crosses the ${b.name}`);
        }
      }
      expect([...crossed]).toEqual([]);
    });
  }

  for (const holiday of ['halloween', 'christmas', 'new_year']) {
    it(`no walk crosses the ${holiday} decorations on the floor`, () => {
      const decor = sprite(`decor-${holiday}.png`);
      const crossed = new Set<string>();
      for (const walk of walks()) {
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
    const off = walks().filter((w) => along(w.points).some((p) => p.x < 0 || p.x > CANVAS.width || p.y < 0 || p.y > CANVAS.height));
    expect(off.map((w) => w.name)).toEqual([]);
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
