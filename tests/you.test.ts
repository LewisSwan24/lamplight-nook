import { walkBetween } from '../app/renderer/game/layout';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_COUNT, avatarKey, cleanAvatar } from '../app/shared/avatars';
import { ZONES } from '../app/renderer/game/layout';
import { STAFF_ANIMS, STAFF_FRAME } from '../app/renderer/game/sprites';
import { YOU_COUNTER, YOU_DOOR, YOU_SEAT } from '../app/renderer/game/you';

/** Width and height of a PNG, from its header. */
const pngSize = (path: string) => {
  const b = readFileSync(new URL(`../${path}`, import.meta.url));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe('the player\'s looks', () => {
  it('takes only a look the shop has', () => {
    expect(cleanAvatar(1)).toBe(1);
    expect(cleanAvatar(AVATAR_COUNT)).toBe(AVATAR_COUNT);
    for (const bad of [0, AVATAR_COUNT + 1, 1.5, '2', null, undefined]) expect(cleanAvatar(bad)).toBeUndefined();
  });

  it('has a sheet for every look, deep enough for every move the player makes', () => {
    const rows = Math.max(STAFF_ANIMS.idle.row, STAFF_ANIMS.walk.row, STAFF_ANIMS.sit.row, STAFF_ANIMS.gift.row) + 1;
    for (let n = 1; n <= AVATAR_COUNT; n++) {
      expect(pngSize(`assets/sprites/${avatarKey(n)}.png`)).toEqual({ w: STAFF_FRAME.perRow * STAFF_FRAME.width, h: rows * STAFF_FRAME.height });
    }
    expect(pngSize('assets/ui/you.png')).toEqual({ w: 16 * AVATAR_COUNT, h: 32 });
  });
});

describe('the player\'s visit', () => {
  // The floor furniture, plus the lamp beside the customer's chair (scripts/art/scene.py).
  const furniture = [...ZONES.filter((z) => ['corner'].includes(z.id)), { id: 'lamp', x: 272, y: 169, w: 13, h: 6 }];
  const inside = (p: { x: number; y: number }) => furniture.find((z) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h);
  const walk = (from: { x: number; y: number }, path: { x: number; y: number }[]) => {
    let a = from;
    for (const b of path) {
      for (let t = 0; t <= 1; t += 0.05) expect(inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })?.id).toBeUndefined();
      a = b;
    }
    return a;
  };

  it('comes in, hands over the slip, sits by the lamp, picks up the result and goes, never through furniture', () => {
    expect(walk(YOU_DOOR, walkBetween(YOU_DOOR, YOU_COUNTER))).toEqual(YOU_COUNTER);
    const seat = walk(YOU_COUNTER, walkBetween(YOU_COUNTER, YOU_SEAT));
    expect(seat).toEqual({ x: YOU_SEAT.x, y: YOU_SEAT.y });
    expect(walk(seat, walkBetween(seat, YOU_COUNTER))).toEqual(YOU_COUNTER);
    expect(walk(YOU_COUNTER, walkBetween(YOU_COUNTER, YOU_DOOR))).toEqual(YOU_DOOR);
  });

  it('sits the way the chair faces, which sitting can do', () => {
    expect(STAFF_ANIMS.sit.dirs).toContain(YOU_SEAT.facing);
  });
});
