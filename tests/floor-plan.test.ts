import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUEST_SPOT } from '../app/renderer/game/guests';
import { ANCHORS, ZONES, seatsIn, standPoint } from '../app/renderer/game/layout';
import { placeBubbles } from '../app/renderer/ui/bubble-layout';

const SCENES = ['cafe', 'study'] as const;
type Piece = { name: string; x: number; y: number; w: number; h: number; base: number };
const pieces = JSON.parse(readFileSync('assets/sprites/pieces.json', 'utf8')) as Record<(typeof SCENES)[number], { pieces: Piece[] }>;
const piece = (scene: (typeof SCENES)[number], name: string) => pieces[scene].pieces.find((p) => p.name === name)!;

describe.each(SCENES)('who stands where in the %s', (scene) => {
  it('has Adeng behind the counter, hidden from the waist down, facing the room', () => {
    const counter = piece(scene, 'counter');
    const adeng = standPoint('counter', 'adeng', scene);
    expect(adeng.facing).toBe('down');
    expect(adeng.y).toBeLessThan(counter.base);
    expect(adeng.x).toBeGreaterThan(counter.x);
    expect(adeng.x).toBeLessThan(counter.x + counter.w);
    expect(adeng.y).toBeGreaterThan(counter.y + counter.h - 18);
  });

  it('leaves room behind the counter to walk', () => {
    expect(piece(scene, 'counter').y + piece(scene, 'counter').h).toBeGreaterThan(90);
  });

  it('has the guest at the end of the counter, not in front of Adeng', () => {
    const counter = piece(scene, 'counter');
    expect(GUEST_SPOT.x).toBeGreaterThan(counter.x + counter.w);
    expect(GUEST_SPOT.y).toBeLessThan(counter.base + 6);
  });

  it('seats all four staff at the table, in front of what they sit on', () => {
    const seats = seatsIn(scene).table!;
    for (const actor of ['adeng', 'xiaoju', 'laoshi', 'qingdai'] as const) {
      const seat = seats[actor]!;
      expect(seat.chair, actor).toBe(true);
      const under = pieces[scene].pieces.find((p) => seat.x >= p.x && seat.x < p.x + p.w && seat.y >= p.y && seat.y <= p.y + p.h + 3);
      expect(under?.name, actor).toBeDefined();
      expect(under!.base, actor).toBeLessThan(seat.y);
    }
  });
});

describe('the study has its own floor plan', () => {
  it('moves the sofa to the reading table', () => {
    const [sofa, table] = [piece('study', 'sofa'), piece('study', 'table')];
    expect(sofa.y).toBeGreaterThanOrEqual(table.y + table.h);
    expect(sofa.y - (table.y + table.h)).toBeLessThan(12);
  });

  it('keeps Adeng off the gap in the desk', () => {
    expect(standPoint('counter', 'adeng', 'study').x).not.toBe(standPoint('counter', 'adeng', 'cafe').x);
  });
});

describe('the counter zone follows the counter', () => {
  it.each(SCENES)('in the %s', (scene) => {
    const zone = ZONES.find((z) => z.id === 'counter')!;
    expect(zone.y + zone.h).toBeGreaterThanOrEqual(piece(scene, 'counter').y + piece(scene, 'counter').h - 16);
    expect(ANCHORS.counter.y).toBeLessThan(zone.y + zone.h);
  });
});

describe('words in front of the blackboard', () => {
  const board = { left: 100, top: 10, right: 200, bottom: 60 };

  it('move aside so the chalk stays readable', () => {
    const place = placeBubbles([{ key: 'a', x: 150, y: 50, w: 60, h: 20, iconOnly: false }], [], [board]).get('a')!;
    expect(place.visible).toBe(true);
    expect(place.x - 30).toBeGreaterThanOrEqual(board.right);
  });

  it('stay put when they miss it', () => {
    const place = placeBubbles([{ key: 'a', x: 300, y: 50, w: 60, h: 20, iconOnly: false }], [], [board]).get('a')!;
    expect(place.x).toBe(300);
  });
});
