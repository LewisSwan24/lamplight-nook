import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANCHORS, MAILSLOT, OUTBOX, seatsIn, standPoint } from '../app/renderer/game/layout';
import { STAFF } from '../app/shared/staff';
import { readPng } from './png';

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
    const names = readdirSync('assets/sprites').filter((f) => /^(grow|decor|weather|season)-.*\.png$/.test(f));
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

  it('has the filing cabinet beside the bookcase, the letter slot by the door and the outbox on the counter (C8)', () => {
    const shelf = list.find((p) => p.name === 'shelf')!;
    const cabinet = list.find((p) => p.name === 'cabinet');
    expect(cabinet).toBeDefined();
    expect(cabinet!.x).toBeGreaterThanOrEqual(shelf.x + shelf.w);
    expect(cabinet!.y + cabinet!.h).toBeLessThan(shelf.y + shelf.h);
    // Drawn with the dark outline every piece of the shop has: the slot on the wall, the basket on the counter.
    const outline = (img: Png, x0: number, y0: number, w: number, h: number) => {
      let n = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.at(x, y).rgb === 0x2a2233 && img.at(x, y).alpha === 255) n++;
      return n;
    };
    expect(outline(room, MAILSLOT.x, MAILSLOT.y, MAILSLOT.w, MAILSLOT.h)).toBeGreaterThan(MAILSLOT.w);
    const box = OUTBOX[scene];
    const counter = list.filter((p) => p.name === 'counter' && box.x >= p.x && box.x + box.w <= p.x + p.w && box.y >= p.y && box.y + box.h <= p.y + p.h);
    expect(counter).toHaveLength(1);
    expect(outline(picture, box.x, box.y, box.w, box.h)).toBeGreaterThan(box.w);
  });

  it('puts a sitter in front of the chair', () => {
    const seats = list.filter((p) => /^(chair|bench|sofa)/.test(p.name));
    for (const places of Object.values(seatsIn(scene))) {
      for (const seat of Object.values(places ?? {})) {
        if (!seat.chair) continue;
        const chair = seats.find((c) => seat.x >= c.x - 2 && seat.x < c.x + c.w + 2 && seat.y >= c.y && seat.y <= c.y + c.h + 3)!;
        expect(chair.base).toBeLessThan(seat.y);
      }
    }
  });

  it('never hides most of someone standing at their place', () => {
    const hidden: string[] = [];
    for (const place of Object.keys(ANCHORS) as (keyof typeof ANCHORS)[]) {
      for (const actor of STAFF) {
        const spot = standPoint(place, actor, scene);
        let covered = 0;
        for (let y = spot.y - 24; y < spot.y; y++) {
          for (let x = spot.x - 6; x < spot.x + 6; x++) {
            if (list.some((p) => p.base > spot.y && inPiece(p, sheet, x, y))) covered++;
          }
        }
        // Behind the counter is the one place someone is meant to be half hidden.
        if (covered > (12 * 24) * 0.6) hidden.push(`${actor} at ${place}: ${covered}`);
      }
    }
    expect(hidden).toEqual([]);
  });
});
