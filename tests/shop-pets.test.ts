import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PET_FRAMES, PET_SHEETS, SHOP_PET, petAt, stampNext } from '../app/renderer/game/shoppets';
import { lintLines, parseLines } from '../app/renderer/translator/lines';
import { LOCALES, strings } from '../app/shared/i18n';
import { readPng } from './png';

// Three new animals (plan-1.9.md I3): Bun the bakery's dog, Stamp the post office's pigeon, Cinnabar the studio's
// goldfish. Each keeps to its places by the hour and the weather, answers a click without a word, and its keeper
// brings it up now and then.

describe('who lives where', () => {
  it('a dog in the bakery, a pigeon at the post office, a goldfish in the studio, and nobody new elsewhere', () => {
    expect(SHOP_PET).toEqual({ bakery: 'bun', post: 'stamp', studio: 'cinnabar' });
    expect(strings.animals.bun).toBe('馒头');
    expect(LOCALES.en.animals).toMatchObject({ bun: 'Bun', stamp: 'Stamp', cinnabar: 'Cinnabar' });
  });

  it('Bun lies by the counter in the day and sleeps on the mat by the door at night', () => {
    for (const period of ['dawn', 'day', 'dusk'] as const) expect(petAt('bun', period, 'clear')).toMatchObject({ spot: 'counter', pose: 'lie' });
    expect(petAt('bun', 'night', 'clear')).toMatchObject({ spot: 'mat', pose: 'sleep' });
    expect(petAt('bun', 'day', 'rain')).toMatchObject({ spot: 'counter' });
  });

  it('Stamp flies between the windowsill and the letter rack, and keeps to the sill in the rain and at night', () => {
    expect(stampNext('sill', 'day', 'clear')).toBe('rack');
    expect(stampNext('rack', 'day', 'clear')).toBe('sill');
    for (const sky of ['rain', 'storm', 'snow'] as const) expect(stampNext('rack', 'day', sky)).toBe('sill');
    expect(stampNext('rack', 'night', 'clear')).toBe('sill');
    expect(petAt('stamp', 'day', 'rain')).toMatchObject({ spot: 'sill' });
    expect(petAt('stamp', 'night', 'clear')).toMatchObject({ spot: 'sill', pose: 'sleep' });
  });

  it('Cinnabar swims in the bowl on the windowsill, day and night', () => {
    expect(petAt('cinnabar', 'day', 'clear')).toMatchObject({ spot: 'bowl', pose: 'swim' });
    expect(petAt('cinnabar', 'night', 'storm')).toMatchObject({ spot: 'bowl', pose: 'swim' });
  });
});

describe('the pictures', () => {
  it('each sheet has someone in every frame an animation uses', () => {
    for (const [pet, sheet] of Object.entries(PET_SHEETS)) {
      const png = readPng(`assets/sprites/${sheet.key}.png`);
      const perRow = png.width / sheet.w;
      for (const [anim, frames] of Object.entries(PET_FRAMES[pet as keyof typeof PET_FRAMES])) {
        for (const f of frames as number[]) {
          const [fx, fy] = [(f % perRow) * sheet.w, Math.floor(f / perRow) * sheet.h];
          let drawn = 0;
          for (let y = fy; y < fy + sheet.h; y++) for (let x = fx; x < fx + sheet.w; x++) if (png.at(x, y).alpha) drawn++;
          expect(drawn, `${pet} ${anim} ${f}`).toBeGreaterThan(20);
        }
      }
    }
  });
});

describe('the keepers bring them up', () => {
  // By id: the shops already had stamps, cinnabar the pigment and buns of their own.
  const shops = [['bakery', 'guiyi', '馒头', 'Bun', 'bk_bun_'], ['post', 'axin', '邮票', 'Stamp', 'po_stamp_'], ['studio', 'xiaozhe', '朱砂', 'Cinnabar', 'st_cin_']] as const;
  for (const [shop, keeper, zh, en, id] of shops) {
    it(`${shop}: about ten lines on ${en}, the same in both languages, all the keeper's`, () => {
      const [zhLines, enLines] = [`lines/${shop}.yaml`, `lines/en/${shop}.yaml`].map((f) => parseLines(readFileSync(f, 'utf8')));
      const zhPet = zhLines.shop_idle.filter((l) => l.id.startsWith(id));
      const enPet = enLines.shop_idle.filter((l) => l.id.startsWith(id));
      expect(zhPet.length).toBeGreaterThanOrEqual(10);
      expect(enPet.map((l) => l.id)).toEqual(zhPet.map((l) => l.id));
      for (const l of zhPet) expect(l.speaker === keeper && l.bubbles.join('').includes(zh), l.id).toBe(true);
      for (const l of enPet) expect(l.bubbles.join('').includes(en), l.id).toBe(true);
      expect(lintLines({ shop_idle: zhLines.shop_idle }, LOCALES['zh-CN'])).toEqual([]);
      expect(lintLines({ shop_idle: enLines.shop_idle }, LOCALES.en)).toEqual([]);
    });
  }
});
