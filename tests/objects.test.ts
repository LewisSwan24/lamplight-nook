import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { GROWTH } from '../app/shared/growth';
import { CANVAS } from '../app/renderer/game/layout';
import { OBJECT_IDS, type ObjectContext, objectBoxes, objectReaction } from '../app/renderer/game/objects';

const SCENES = ['cafe', 'study'] as const;
const quiet: ObjectContext = { running: false, hour: 9, minute: 5, sky: 'clear', period: 'day', errand: null, materials: [], laoshiDoing: '', turn: 0 };
const busy: ObjectContext = { ...quiet, running: true };

describe.each(SCENES)('what can be clicked in the %s', (scene) => {
  const boxes = objectBoxes(scene);

  it('has a place for every fixed thing, on the canvas', () => {
    for (const box of boxes) {
      expect(box.w, box.id).toBeGreaterThan(0);
      expect(box.h, box.id).toBeGreaterThan(0);
      expect(box.x + box.w, box.id).toBeLessThanOrEqual(CANVAS.width);
      expect(box.y + box.h, box.id).toBeLessThanOrEqual(CANVAS.height);
    }
    for (const id of ['clock', 'window', 'frontdoor', 'table', 'shelf', 'workbench', 'lamp', 'plant', 'plant2', 'cup']) {
      expect(boxes.map((b) => b.id)).toContain(id);
    }
  });

  it('has the growth pieces too', () => {
    for (const g of GROWTH) expect(boxes.map((b) => b.id)).toContain(`grow-${g.id}`);
  });
});

describe.each(['zh-CN', 'en'] as const)('what things say in %s', (lang) => {
  const O = LOCALES[lang].ui.objects;

  it('names every object', () => {
    for (const id of OBJECT_IDS) expect(O.names[id], id).toBeTruthy();
    for (const g of GROWTH) expect(O.grown[g.id], g.id).toBeTruthy();
  });

  it('answers every object, idle and at work, with every word filled in', () => {
    for (const id of OBJECT_IDS) {
      for (const ctx of [quiet, busy, { ...busy, errand: 'xiaoju' as const, materials: ['a.pdf'], laoshiDoing: 'x' }]) {
        for (let turn = 0; turn < 4; turn++) {
          const r = objectReaction(id, { ...ctx, turn }, O);
          if ('say' in r) expect(r.say, id).not.toMatch(/[{}]/);
          if ('say' in r) expect(r.say.length, id).toBeGreaterThan(0);
        }
      }
    }
  });

  it('knows every kind of weather and time of day through the window', () => {
    const seen = new Set<string>();
    for (const sky of ['clear', 'rain', 'snow', 'petals', 'leaves'] as const) {
      for (const period of ['dawn', 'day', 'dusk', 'night'] as const) {
        const r = objectReaction('window', { ...quiet, sky, period }, O);
        if ('say' in r) seen.add(r.say);
      }
    }
    expect(seen.size).toBe(20);
  });

  it('gives the time from the clock while nothing is on', () => {
    const r = objectReaction('clock', quiet, O);
    expect('say' in r && r.say).toContain('9:05');
  });

  it('says what each growth piece came with', () => {
    const r = objectReaction('grow-fruit', quiet, O);
    expect('say' in r && r.say).toContain('5');
  });
});

describe('while work is under way', () => {
  const O = LOCALES['zh-CN'].ui.objects;

  it('opens the progress card from the clock', () => {
    expect(objectReaction('clock', busy, O)).toEqual({ open: 'progress' });
  });

  it('lists what was handed over, on the table', () => {
    const r = objectReaction('table', { ...busy, materials: ['报价单.pdf', '照片.png'] }, O);
    expect('say' in r && r.say).toContain('报价单.pdf');
    expect('say' in r && r.say).toContain('照片.png');
  });

  it('says who is out, at the front door', () => {
    const r = objectReaction('frontdoor', { ...busy, errand: 'xiaoju' }, O);
    expect('say' in r && r.say).toContain(LOCALES['zh-CN'].actors.xiaoju);
  });

  it('tells what Laoshi is doing, at the workbench', () => {
    const r = objectReaction('workbench', { ...busy, laoshiDoing: '检查页面' }, O);
    expect('say' in r && r.say).toContain('检查页面');
  });
});

describe('decoration', () => {
  it('switches the lamp without a word', () => {
    expect(objectReaction('lamp', quiet, LOCALES.en.ui.objects)).toEqual({ lamp: true });
  });

  it('sends someone to the shelf only when nothing is on', () => {
    const O = LOCALES.en.ui.objects;
    expect(objectReaction('shelf', quiet, O)).toMatchObject({ walk: 'shelf' });
    expect(objectReaction('shelf', busy, O)).not.toHaveProperty('walk');
  });
});
