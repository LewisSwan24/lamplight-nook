import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import {
  BUYERS, FLOWERS, FLOWER_IDS, SALES_A_DAY, SALES_KEPT_DAYS, SLOTS, flowerOf, inSeason, nextBuyer, shelfOn, soldOn, stageOf,
  type FlowerSale,
} from '../app/shared/flowers';
import { LOCALES } from '../app/shared/i18n';
import { emptyTown, TOWN_MOVE } from '../app/shared/town';
import { lintChats, parseChats } from '../app/renderer/translator/lines';

// plan-2.0.md J12: the flower shop's stand of six vases. What is in each comes from the day alone: a delivery every
// morning into each vase whose flowers are over, chosen from what is in season and not already on the stand. Flowers
// come in as buds, open, and wilt on their last day. Neighbours come in and buy one; that vase stands empty until its
// next delivery.

const day = (d: string) => d;

describe('the flowers', () => {
  it('has flowers for every season, a few the whole year round, each lasting some days in the vase', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(FLOWERS.filter((f) => inSeason(f, season)).length, season).toBeGreaterThanOrEqual(SLOTS + 1);
    }
    expect(FLOWERS.filter((f) => f.seasons.length === 4).length).toBeGreaterThanOrEqual(2);
    for (const f of FLOWERS) expect(f.days, f.id).toBeGreaterThanOrEqual(3);
    expect(new Set(FLOWER_IDS).size).toBe(FLOWERS.length);
  });

  it('has a name for every flower and every stage, in both languages', () => {
    for (const lang of ['zh-CN', 'en'] as const) {
      const F = LOCALES[lang].ui.flowers;
      for (const id of FLOWER_IDS) expect(F.names[id], `${lang} ${id}`).toBeTruthy();
      for (const s of ['bud', 'open', 'wilting'] as const) expect(F.stages[s], `${lang} ${s}`).toBeTruthy();
      expect(F.title && F.empty && F.sold && F.came).toBeTruthy();
    }
  });
});

describe('the stand, day by day', () => {
  it('has six vases, all filled with something in season and none the same', () => {
    for (const d of ['2027-01-10', '2027-04-10', '2027-07-10', '2027-10-10']) {
      const shelf = shelfOn(d, []);
      expect(shelf).toHaveLength(SLOTS);
      const ids = shelf.map((s) => s.bunch!.flower);
      expect(new Set(ids).size, d).toBe(SLOTS);
      const season = (['winter', 'spring', 'summer', 'autumn'] as const)[Math.floor(((Number(d.slice(5, 7)) % 12)) / 3)];
      for (const id of ids) expect(inSeason(flowerOf(id), season), `${d} ${id}`).toBe(true);
    }
  });

  it('is the same stand however often it is asked for, and from one day to the next only the vases whose flowers were over change', () => {
    const a = shelfOn('2027-05-03', []);
    expect(shelfOn('2027-05-03', [])).toEqual(a);
    const b = shelfOn('2027-05-04', []);
    for (const [i, s] of b.entries()) {
      if (s.bunch!.came === '2027-05-04') expect(stageOf(a[i].bunch!, '2027-05-03', flowerOf(a[i].bunch!.flower)), `vase ${i}`).toBe('wilting');
      else expect(s.bunch).toEqual(a[i].bunch);
    }
  });

  it('brings flowers in as buds, opens them, and they wilt on their last day', () => {
    const rose = flowerOf('rose');
    const came = '2027-03-01';
    expect(stageOf({ flower: 'rose', came }, came, rose)).toBe('bud');
    expect(stageOf({ flower: 'rose', came }, '2027-03-02', rose)).toBe('open');
    expect(stageOf({ flower: 'rose', came }, `2027-03-${String(rose.days).padStart(2, '0')}`, rose)).toBe('wilting');
  });

  it('does not deliver all six on the same morning', () => {
    const shelf = shelfOn('2027-06-15', []);
    expect(new Set(shelf.map((s) => s.bunch!.came)).size).toBeGreaterThan(1);
  });

  it('keeps a vase empty from the day its flowers are sold until the next delivery into it', () => {
    const before = shelfOn('2027-05-03', []);
    const sale: FlowerSale = { day: '2027-05-03', slot: 2, who: 'granny' };
    const after = shelfOn('2027-05-03', [sale]);
    expect(after[2]).toMatchObject({ bunch: before[2].bunch, soldTo: 'granny' });
    expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
    // Until the vase is filled again, it stays sold.
    const next = shelfOn('2027-05-04', [sale])[2];
    if (next.bunch!.came === before[2].bunch!.came) expect(next.soldTo).toBe('granny');
    else expect(next.soldTo).toBeUndefined();
  });

  it('says who bought what today', () => {
    const shelf = shelfOn('2027-05-03', []);
    const sales: FlowerSale[] = [{ day: '2027-05-03', slot: 0, who: 'granny' }, { day: '2027-05-02', slot: 1, who: 'student' }];
    expect(soldOn('2027-05-03', sales)).toEqual([{ who: 'granny', flower: shelf[0].bunch!.flower }]);
  });
});

describe('neighbours buying', () => {
  const at = (hour: number) => ({ day: day('2027-05-03'), hour });

  it('come in only while the shop is open, and no more than a few a day', () => {
    expect(nextBuyer(at(6), [])).toBe(null);
    expect(nextBuyer(at(21), [])).toBe(null);
    const one = nextBuyer(at(10), [])!;
    expect(BUYERS).toContain(one.who);
    const full: FlowerSale[] = Array.from({ length: SALES_A_DAY }, (_, i) => ({ day: '2027-05-03', slot: i, who: 'granny' }));
    expect(nextBuyer(at(10), full)).toBe(null);
  });

  it('take something that is not sold and not wilting, if there is any', () => {
    const shelf = shelfOn('2027-05-03', []);
    const b = nextBuyer(at(11), [])!;
    expect(stageOf(shelf[b.slot].bunch!, '2027-05-03', flowerOf(shelf[b.slot].bunch!.flower))).not.toBe('wilting');
    const sold: FlowerSale[] = [{ day: '2027-05-03', slot: b.slot, who: b.who }];
    const c = nextBuyer(at(11), sold)!;
    expect(c.slot).not.toBe(b.slot);
    expect(c.who).not.toBe(b.who);
  });
});

describe('what they say (lines/flower-buyers.yaml)', () => {
  for (const [lang, file] of [['zh-CN', 'lines/flower-buyers.yaml'], ['en', 'lines/en/flower-buyers.yaml']] as const) {
    const chats = parseChats(readFileSync(file, 'utf8'));
    it(`has every buyer asking and Fern naming the flowers, by the writing rules, in ${lang}`, () => {
      expect(lintChats(chats, LOCALES[lang])).toEqual([]);
      for (const who of BUYERS) expect(chats.filter((c) => c.guest === who).length, who).toBeGreaterThanOrEqual(2);
      for (const c of chats) {
        expect(BUYERS, c.id).toContain(c.guest);
        expect(c.turns.at(-1)!.speaker, c.id).toBe('fangjie');
        expect(c.turns.at(-1)!.text, c.id).toContain('{flower}');
      }
    });
  }
  it('has the same exchanges in both languages', () => {
    const ids = (file: string) => parseChats(readFileSync(file, 'utf8')).map((c) => c.id);
    expect(ids('lines/en/flower-buyers.yaml')).toEqual(ids('lines/flower-buyers.yaml'));
  });
});

describe('the shop keeps its sales', () => {
  it('writes each sale down, and lets go of those too old to matter', () => {
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-flowers-')), 'memory.json'));
    (store as unknown as { data: { shop: unknown } }).data.shop = { done: 1, grown: [], told: [TOWN_MOVE], town: emptyTown() };
    store.sellFlower(1, 'granny', new Date('2027-05-01T10:00:00'));
    store.sellFlower(3, 'student', new Date(`2027-05-${String(1 + SALES_KEPT_DAYS + 1).padStart(2, '0')}T10:00:00`));
    expect(store.shopState(new Date('2027-05-20T10:00:00')).town?.flowers).toEqual([{ day: `2027-05-${String(1 + SALES_KEPT_DAYS + 1).padStart(2, '0')}`, slot: 3, who: 'student' }]);
  });
});
