import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { SettingsStore } from '../app/main/settings';
import { SpendLedger } from '../app/main/spend';

const home = () => mkdtempSync(join(tmpdir(), 'lamplight-broken-'));
const form = { want: 'x' };
const notebook = (titles: string[]) => JSON.stringify({
  commissions: titles.map((title, i) => ({ id: `c${i + 1}`, title, date: '2026-10-01', result: 'done', choices: {}, form })),
  stuckNotes: [],
});
const aside = (dir: string, name: string) => readdirSync(dir).filter((f) => f.startsWith(`${name}.broken-`));

describe('a notebook that cannot be read', () => {
  it('is never written over: it is put aside, and a new one started', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, '{"commissions":[{"titl');
    const store = new MemoryStore(file);
    expect(store.get().commissions).toEqual([]);
    expect(store.damage).toBe('lost');
    expect(aside(dir, 'memory')).toHaveLength(1);
    store.markMet('baker');
    expect(readFileSync(join(dir, aside(dir, 'memory')[0]), 'utf8')).toBe('{"commissions":[{"titl');
  });

  it('counts a file of the wrong shape as unreadable too', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, '{"commissions":"oops"}');
    expect(new MemoryStore(file).damage).toBe('lost');
    expect(aside(dir, 'memory')).toHaveLength(1);
  });

  it('comes back from the copy made when the shop last opened, and stays back', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, notebook(['one', 'two']));
    new MemoryStore(file);
    writeFileSync(file, 'garbage');
    const store = new MemoryStore(file);
    expect(store.damage).toBe('restored');
    expect(store.get().commissions.map((c) => c.title)).toEqual(['one', 'two']);
    const again = new MemoryStore(file);
    expect(again.damage).toBeNull();
    expect(again.get().commissions).toHaveLength(2);
  });

  it('does not take a bad copy for a good one', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, 'garbage');
    writeFileSync(join(dir, 'memory.last-good.json'), 'more garbage');
    const store = new MemoryStore(file);
    expect(store.damage).toBe('lost');
    expect(store.get().commissions).toEqual([]);
  });

  it('keeps every one that went bad, even on the same day', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, 'first');
    new MemoryStore(file);
    writeFileSync(file, 'second');
    new MemoryStore(file);
    const kept = aside(dir, 'memory').map((f) => readFileSync(join(dir, f), 'utf8')).sort();
    expect(kept).toEqual(['first', 'second']);
  });

  it('says nothing when all is well, or on a first start', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    expect(new MemoryStore(file).damage).toBeNull();
    writeFileSync(file, notebook(['one']));
    expect(new MemoryStore(file).damage).toBeNull();
    expect(aside(dir, 'memory')).toEqual([]);
  });

  it('forgetting everything takes the copy and the broken ones too', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, notebook(['secret']));
    new MemoryStore(file);
    writeFileSync(file, 'garbage');
    const store = new MemoryStore(file);
    store.clear();
    expect(existsSync(join(dir, 'memory.last-good.json'))).toBe(false);
    expect(aside(dir, 'memory')).toEqual([]);
  });
});

describe('the copy of the notebook', () => {
  it('not being able to make it does not stop the shop opening', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, notebook(['a']));
    mkdirSync(join(dir, 'memory.last-good.json'));
    const store = new MemoryStore(file);
    expect(store.get().commissions).toHaveLength(1);
    expect(store.damage).toBeNull();
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a notebook that has gone missing comes back from it, and the shop says so', () => {
    const dir = home();
    writeFileSync(join(dir, 'memory.last-good.json'), notebook(['a', 'b']));
    const file = join(dir, 'memory.json');
    const store = new MemoryStore(file);
    expect(store.damage).toBe('missing');
    expect(store.get().commissions).toHaveLength(2);
    expect(existsSync(file)).toBe(true);
  });

  it('forgetting everything also takes a save that never finished', () => {
    const dir = home();
    const file = join(dir, 'memory.json');
    writeFileSync(file, notebook(['a']));
    const store = new MemoryStore(file);
    writeFileSync(`${file}.tmp`, notebook(['secret']));
    mkdirSync(join(dir, 'backup', 'v1'), { recursive: true });
    writeFileSync(join(dir, 'backup', 'v1', 'pending.json'), '{"form":{"want":"secret"}}');
    mkdirSync(join(dir, 'backup', 'v2', 'pending'), { recursive: true });
    writeFileSync(join(dir, 'backup', 'v2', 'pending', 'r1.json'), '{"form":{"want":"secret"}}');
    store.clear();
    expect(existsSync(`${file}.tmp`)).toBe(false);
    expect(existsSync(join(dir, 'backup', 'v1', 'pending.json'))).toBe(false);
    expect(existsSync(join(dir, 'backup', 'v2', 'pending'))).toBe(false);
  });
});

describe('other data files that cannot be read', () => {
  it('the ledger of the wrong shape is put aside too, and it says so', () => {
    const dir = home();
    const file = join(dir, 'spend.json');
    writeFileSync(file, '{"x":1}');
    const ledger = new SpendLedger(file);
    ledger.record('/w/a', 's', 0.5);
    expect(aside(dir, 'spend')).toHaveLength(1);
    expect(ledger.damaged).toBe(true);
  });

  it('a healthy ledger and healthy settings say nothing', () => {
    const dir = home();
    expect(new SpendLedger(join(dir, 'spend.json')).damaged).toBe(false);
    expect(new SettingsStore(join(dir, 'settings.json'), dir).damaged).toBe(false);
  });

  for (const bad of ['null', '[]', '3']) {
    it(`settings holding ${bad} are put aside too, and they say so`, () => {
      const dir = home();
      const file = join(dir, 'settings.json');
      writeFileSync(file, bad);
      const settings = new SettingsStore(file, dir);
      settings.update({ name: 'New' });
      expect(readFileSync(join(dir, aside(dir, 'settings')[0]), 'utf8')).toBe(bad);
      expect(settings.damaged).toBe(true);
    });
  }

  it('the ledger is put aside rather than written over, and forgetting takes it', () => {
    const dir = home();
    const file = join(dir, 'spend.json');
    writeFileSync(file, '[{"key":"secret');
    const ledger = new SpendLedger(file);
    ledger.record('/w/a', 's', 0.5);
    expect(aside(dir, 'spend')).toHaveLength(1);
    expect(readFileSync(join(dir, aside(dir, 'spend')[0]), 'utf8')).toBe('[{"key":"secret');
    ledger.forget();
    expect(aside(dir, 'spend')).toEqual([]);
  });

  it('the settings are put aside rather than written over', () => {
    const dir = home();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{"name":"Sam');
    const settings = new SettingsStore(file, dir);
    settings.update({ name: 'New' });
    expect(readFileSync(join(dir, aside(dir, 'settings')[0]), 'utf8')).toBe('{"name":"Sam');
  });
});
