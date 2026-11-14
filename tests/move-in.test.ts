import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moveIn, moveInOffer, storeDataDir } from '../app/main/move-in';

/** Two data folders side by side: the installer build's, with a shop in it, and the Store build's, empty. */
function folders() {
  const root = mkdtempSync(join(tmpdir(), 'lamplight-movein-'));
  const old = join(root, 'Lamplight Nook');
  const own = join(root, 'Lamplight Nook Store');
  mkdirSync(join(old, 'versions', 'c1'), { recursive: true });
  mkdirSync(join(old, 'logs'), { recursive: true });
  mkdirSync(join(old, 'backup', '2026-11-01-v2'), { recursive: true });
  mkdirSync(own, { recursive: true });
  const files: Record<string, string> = {
    'settings.json': JSON.stringify({ name: 'Sam', onboarded: true, language: 'en' }),
    'memory.json': JSON.stringify({ commissions: [
      { id: 'c1', title: 'A page', result: 'done' },
      { id: 'c2', title: 'A letter', result: 'done' },
      { id: 'c3', title: 'Stopped', result: 'cancelled' },
    ] }),
    'memory.last-good.json': '{"commissions":[]}',
    'spend.json': JSON.stringify([{ key: 'a|s', usd: 0.5, month: '2026-10' }, { key: 'b|s', usd: 1.25, month: '2026-11' }]),
    'data-version.json': '{"data":2}',
    'pending.json': '{"form":{"want":"half done"}}',
    'api-key.bin': 'locked to the other build',
    'versions/c1/index.html': '<p>first</p>',
    'logs/2026-11-14.log': 'a line',
    'backup/2026-11-01-v2/memory.json': '{}',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(old, name), text);
  return { old, own, files };
}

const listing = (dir: string) => readdirSync(dir, { recursive: true }).map(String).sort();

describe('the Store build moving in (road-to-1.1.md A2)', () => {
  it('keeps its own folder next to the installer build’s', () => {
    expect(storeDataDir(join('C:', 'Users', 'u', 'AppData', 'Roaming'))).toBe(join('C:', 'Users', 'u', 'AppData', 'Roaming', 'Lamplight Nook Store'));
  });

  it('offers to move in when the installer build has a shop and the Store build has none, with what it holds', () => {
    const { old, own } = folders();
    expect(moveInOffer(old, own)).toEqual({ works: 2, spentUsd: 1.75 });
  });

  it('offers nothing without an old folder, or with one that holds no shop', () => {
    const { own } = folders();
    expect(moveInOffer(undefined, own)).toBeNull();
    const bare = mkdtempSync(join(tmpdir(), 'lamplight-bare-'));
    mkdirSync(join(bare, 'logs'));
    writeFileSync(join(bare, 'data-version.json'), '{"data":3}');
    expect(moveInOffer(bare, own)).toBeNull();
    expect(moveInOffer(join(bare, 'not-there'), own)).toBeNull();
  });

  it('offers nothing once the Store build has a shop of its own', () => {
    for (const mine of ['settings.json', 'memory.json', 'spend.json']) {
      const { old, own } = folders();
      writeFileSync(join(own, mine), '{}');
      expect(moveInOffer(old, own)).toBeNull();
    }
  });

  it('counts a ledger without a notebook, and a notebook without a ledger', () => {
    const { old, own } = folders();
    const onlyLedger = mkdtempSync(join(tmpdir(), 'lamplight-ledger-'));
    writeFileSync(join(onlyLedger, 'spend.json'), readFileSync(join(old, 'spend.json')));
    expect(moveInOffer(onlyLedger, own)).toEqual({ works: 0, spentUsd: 1.75 });
    const onlyNotebook = mkdtempSync(join(tmpdir(), 'lamplight-notebook-'));
    writeFileSync(join(onlyNotebook, 'memory.json'), readFileSync(join(old, 'memory.json')));
    expect(moveInOffer(onlyNotebook, own)).toEqual({ works: 2, spentUsd: 0 });
  });

  it('copies the settings, the notebook, the ledger and the kept versions, and leaves the original as it was', () => {
    const { old, own, files } = folders();
    const before = listing(old);
    const brought = moveIn(old, own);
    expect(brought.sort()).toEqual(['data-version.json', 'memory.json', 'memory.last-good.json', 'settings.json', 'spend.json', 'versions'].sort());
    for (const name of ['settings.json', 'memory.json', 'memory.last-good.json', 'spend.json', 'data-version.json', join('versions', 'c1', 'index.html')]) {
      expect(readFileSync(join(own, name), 'utf8')).toBe(files[name.split('\\').join('/')]);
    }
    expect(listing(old)).toEqual(before);
    for (const [name, text] of Object.entries(files)) expect(readFileSync(join(old, name), 'utf8')).toBe(text);
  });

  it('leaves the key, the unfinished commission, the logs and the backups behind', () => {
    const { old, own } = folders();
    moveIn(old, own);
    for (const name of ['api-key.bin', 'pending.json', 'logs', 'backup']) expect(existsSync(join(own, name))).toBe(false);
  });

  it('drops the mark a fresh start left when the old folder has none, so the old data still gets brought up to date', () => {
    const { old, own } = folders();
    writeFileSync(join(own, 'data-version.json'), '{"data":3}');
    const unmarked = mkdtempSync(join(tmpdir(), 'lamplight-unmarked-'));
    writeFileSync(join(unmarked, 'memory.json'), readFileSync(join(old, 'memory.json')));
    expect(moveIn(unmarked, own)).toEqual(['memory.json']);
    expect(existsSync(join(own, 'data-version.json'))).toBe(false);
  });

  it('takes the old mark over the fresh one', () => {
    const { old, own } = folders();
    writeFileSync(join(own, 'data-version.json'), '{"data":3}');
    moveIn(old, own);
    expect(readFileSync(join(own, 'data-version.json'), 'utf8')).toBe('{"data":2}');
  });
});
