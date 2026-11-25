import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPostcardFile } from '../app/main/postcard';
import { DEFAULT_FURNISHING } from '../app/shared/furnish';
import { POSTCARD_MAX_BYTES, makePostcard, postcardDays, postcardText, readPostcard } from '../app/shared/postcard';
import { leftBehind } from '../app/shared/stories';
import { townCounts } from '../app/shared/towngrow';
import { IPC, type ShopDays } from '../app/shared/types';

// A postcard of the shop (docs/plan-1.5.md E3): what makes the shop look the way it does, and nothing else; read back
// from a stranger's file as data only.

const furnish = { cafe: { wall: 'rose', curtain: 'blue', rug: 'default' }, study: { ...DEFAULT_FURNISHING, rug: 'plum' } } as const;
const days: ShopDays = {
  done: 24,
  grown: [{ id: 'painting', date: '2026-01-02' }, { id: 'plant', date: '2026-01-05' }, { id: 'lights', date: '2026-02-01' }],
  told: ['town-move', 'birthday_1'],
  met: [{ id: 'baker', date: '2026-01-03' }],
  town: {
    shops: { print: { done: 3, grown: [{ id: 'proof', date: '2026-03-01' }] }, workshop: { done: 9, grown: [] } },
    street: [{ id: 'lamps', date: '2026-01-09' }],
    stories: { mechanic: ['2026-03-01', '2026-03-04'], granny: ['2026-04-01'] },
  },
};
const card = () => makePostcard('Lewis', { scene: 'study', furnish }, days);

describe('sending a postcard', () => {
  it('reads back the same as it went out', () => {
    const read = readPostcard(postcardText(card()));
    expect(read).toEqual({ ok: true, card: card() });
  });

  it('carries what the shop looks like: the same town, the same pieces, the same stories told', () => {
    const shown = postcardDays(card());
    expect(shown.grown).toEqual(['painting', 'plant', 'lights']);
    expect(townCounts(shown, 'study')).toEqual(townCounts(days, 'study'));
    expect(leftBehind(shown.town.stories)).toEqual(leftBehind(days.town!.stories));
    expect(card().furnish).toEqual(furnish);
    expect(card().home).toBe('study');
  });

  it('carries no dates, no works and nothing it does not need', () => {
    const text = postcardText(card());
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // The bakery is a shop since plan-1.6.md F1, so its count is on the card; the neighbour Auntie Gui (`baker`) is not.
    expect(text).not.toMatch(/birthday|\bbaker\b|town-move/);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['done', 'furnish', 'grown', 'home', 'name', 'postcard', 'shops', 'stories', 'version']);
  });

  it('keeps the name short', () => {
    expect(makePostcard('x'.repeat(100), { scene: 'cafe', furnish }, days).name).toHaveLength(40);
  });
});

describe("the postcard window's preload", () => {
  const src = readFileSync(join(__dirname, '../app/preload/visit.ts'), 'utf8');

  it('loads nothing but Electron, so the sandbox can run it', () => {
    const imports = [...src.matchAll(/^import (type )?.* from '([^']+)';/gm)].filter((m) => !m[1]).map((m) => m[2]);
    expect(imports).toEqual(['electron']);
  });

  it("answers on the shop's channels", () => {
    expect(src).toContain(`card: '${IPC.visitCard}'`);
    expect(src).toContain(`home: '${IPC.visitHome}'`);
    expect(src).toContain(`locale: '${IPC.locale}'`);
  });
});

describe('opening a postcard', () => {
  const good = () => JSON.parse(postcardText(card()));
  const open = (o: unknown) => readPostcard(JSON.stringify(o));

  it('does not open what is not a postcard', () => {
    expect(readPostcard('not json at all')).toEqual({ ok: false, reason: 'notPostcard' });
    expect(readPostcard('[1,2,3]')).toEqual({ ok: false, reason: 'notPostcard' });
    expect(open({ ...good(), postcard: 'something-else' })).toEqual({ ok: false, reason: 'notPostcard' });
    const { postcard: _, ...unmarked } = good();
    expect(open(unmarked)).toEqual({ ok: false, reason: 'notPostcard' });
  });

  it('opens a postcard sent from 1.5, before the bakery and the post office opened, with nothing done there (plan-1.6.md F1, F2)', () => {
    const { bakery: _, post: _p, ...older } = good().shops;
    const read = open({ ...good(), shops: older });
    expect(read).toEqual({ ok: true, card: { ...card(), shops: { ...card().shops, bakery: 0, post: 0 } } });
    // Only that one shop may be missing, and only as a whole set from before: never some other gap.
    const { print: __, ...gap } = good().shops;
    expect(open({ ...good(), shops: gap }).ok).toBe(false);
  });

  it('does not open names it does not know', () => {
    expect(open({ ...good(), extra: 1 }).ok).toBe(false);
    expect(open({ ...good(), version: 2 }).ok).toBe(false);
    expect(open({ ...good(), home: 'castle' }).ok).toBe(false);
    expect(open({ ...good(), grown: ['painting', 'dragon'] }).ok).toBe(false);
    expect(open({ ...good(), furnish: { ...furnish, cafe: { ...furnish.cafe, wall: 'gold' } } }).ok).toBe(false);
    expect(open({ ...good(), furnish: { ...furnish, attic: DEFAULT_FURNISHING } }).ok).toBe(false);
    expect(open({ ...good(), shops: { ...good().shops, attic: 1 } }).ok).toBe(false);
    expect(open({ ...good(), stories: { ...good().stories, baker: 1 } }).ok).toBe(false);
    expect(open({ ...good(), name: { first: 'Lewis' } }).ok).toBe(false);
    const { grown: _, ...missing } = good();
    expect(open(missing).ok).toBe(false);
  });

  it('does not open numbers out of range', () => {
    for (const done of [-1, 2.5, 1e9, '24', null]) expect(open({ ...good(), done }).ok).toBe(false);
    expect(open({ ...good(), shops: { print: 20, studio: 0, workshop: 9 } }).ok).toBe(false);
    expect(open({ ...good(), stories: { mechanic: 99, granny: 0, student: 0 } }).ok).toBe(false);
    expect(open({ ...good(), grown: ['painting', 'painting'] }).ok).toBe(false);
    expect(open({ ...good(), name: '' }).ok).toBe(false);
    expect(open({ ...good(), name: 'x'.repeat(41) }).ok).toBe(false);
    expect(open({ ...good(), name: 'a\u0000b' }).ok).toBe(false);
    expect(open(good()).ok).toBe(true);
  });

  it('does not read a file too big to be a postcard, nor one that is not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lamplight-postcard-'));
    const big = join(dir, 'big.nook');
    writeFileSync(big, `{"postcard":"lamplight-nook","pad":"${'x'.repeat(POSTCARD_MAX_BYTES)}"}`);
    expect(readPostcardFile(big)).toEqual({ ok: false, reason: 'big' });
    const zip = join(dir, 'other.nook');
    writeFileSync(zip, Buffer.from('504b030414000000', 'hex'));
    expect(readPostcardFile(zip)).toEqual({ ok: false, reason: 'notPostcard' });
    expect(readPostcardFile(join(dir, 'gone.nook'))).toEqual({ ok: false, reason: 'notPostcard' });
    const fine = join(dir, 'fine.nook');
    writeFileSync(fine, postcardText(card()));
    const before = statSync(fine).mtimeMs;
    expect(readPostcardFile(fine)).toEqual({ ok: true, card: card() });
    // Reading writes nothing, there or anywhere beside it.
    expect(statSync(fine).mtimeMs).toBe(before);
    expect(readdirSync(dir).sort()).toEqual(['big.nook', 'fine.nook', 'other.nook']);
  });
});
