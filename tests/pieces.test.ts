import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANCHORS, SEATS, standPoint } from '../app/renderer/game/layout';
import { readPng } from './png';

const STAFF = ['adeng', 'xiaoju', 'laoshi', 'qingdai'] as const;
const SCENES = ['cafe', 'study'] as const;
type Piece = { name: string; x: number; y: number; w: number; h: number; sy: number; base: number };
const pieces = JSON.parse(readFileSync('assets/sprites/pieces.json', 'utf8')) as Record<(typeof SCENES)[number], { pieces: Piece[]; on: Record<string, number> }>;
type Png = ReturnType<typeof readPng>;

const pixel = (img: Png, x: number, y: number) => img.at(x, y);
const inPiece = (p: Piece, sheet: Png, x: number, y: number) =>
  x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h && pixel(sheet, x - p.x, p.sy + y - p.y).alpha > 0;

describe.each(SCENES)('the %s split into a room and its furniture', (scene) => {
  const list = pieces[scene].pieces;
  const picture = readPng(`assets/sprites/${scene}.png`);
  const room = readPng(`assets/sprites/${scene}-room.png`);
  const sheet = readPng(`assets/sprites/${scene}-pieces.png`);

  it('gives the picture back, pixel for pixel', () => {
    const wrong: string[] = [];
    for (let y = 0; y < picture.height; y++) {
      for (let x = 0; x < picture.width; x++) {
        const top = list.filter((p) => inPiece(p, sheet, x, y)).sort((a, b) => b.base - a.base)[0];
        const got = top ? pixel(sheet, x - top.x, top.sy + y - top.y) : pixel(room, x, y);
        if (JSON.stringify(got) !== JSON.stringify(pixel(picture, x, y))) wrong.push(`${x},${y}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('leaves the floor empty where the furniture stands', () => {
    const table = list.find((p) => p.name === 'table')!;
    let changed = 0;
    for (let y = table.y; y < table.y + table.h; y++) {
      for (let x = table.x; x < table.x + table.w; x++) {
        if (JSON.stringify(pixel(room, x, y)) !== JSON.stringify(pixel(picture, x, y))) changed++;
      }
    }
    expect(changed).toBeGreaterThan((table.w * table.h) / 2);
  });

  it('keeps every overlay above the furniture it lies on', () => {
    const under: string[] = [];
    const names = readdirSync('assets/sprites').filter((f) => /^(grow|decor|weather)-.*\.png$/.test(f));
    for (const file of names) {
      const overlay = readPng(`assets/sprites/${file}`);
      const depth = pieces[scene].on[file.replace('.png', '')] ?? 1.5;
      for (const p of list) {
        for (let y = p.y; y < p.y + p.h; y++) {
          for (let x = p.x; x < p.x + p.w; x++) {
            if (overlay.at(x, y).alpha > 0 && inPiece(p, sheet, x, y) && depth <= p.base) under.push(`${file} under ${p.name}`);
          }
        }
      }
    }
    expect([...new Set(under)]).toEqual([]);
  });

  it('has the pieces the rest of the game leans on', () => {
    for (const name of ['counter', 'table', 'shelf', 'workbench']) expect(list.map((p) => p.name)).toContain(name);
  });

  it('puts a sitter in front of the chair', () => {
    const chairs = list.filter((p) => p.name.startsWith('chair'));
    for (const seats of Object.values(SEATS)) {
      for (const seat of Object.values(seats ?? {})) {
        if (!seat.chair) continue;
        const chair = chairs.find((c) => seat.x >= c.x - 2 && seat.x < c.x + c.w + 2)!;
        expect(chair.base).toBeLessThan(seat.y);
      }
    }
  });

  it('never hides most of someone standing at their place', () => {
    const hidden: string[] = [];
    for (const place of Object.keys(ANCHORS) as (keyof typeof ANCHORS)[]) {
      for (const actor of STAFF) {
        const spot = standPoint(place, actor);
        let covered = 0;
        for (let y = spot.y - 24; y < spot.y; y++) {
          for (let x = spot.x - 6; x < spot.x + 6; x++) {
            if (list.some((p) => p.base > spot.y && inPiece(p, sheet, x, y))) covered++;
          }
        }
        if (covered > (12 * 24) / 2) hidden.push(`${actor} at ${place}: ${covered}`);
      }
    }
    expect(hidden).toEqual([]);
  });
});
