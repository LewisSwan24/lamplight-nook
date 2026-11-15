import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { KeyCrypto } from '../app/main/api-key';
import { redactSecrets } from '../app/main/api-key';
import { ConnectionStore } from '../app/main/connections';

/** Stand-in for the OS: reverses the bytes so the file never holds a secret as written. */
const crypto = (available = true): KeyCrypto => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...Buffer.from(s, 'utf8')].reverse()),
  decryptString: (b) => Buffer.from([...b].reverse()).toString('utf8'),
});
const folder = () => mkdtempSync(join(tmpdir(), 'conn-'));
const SECRET = 'https://calendar.example/private-91c0ffee/basic.ics';
const today = () => '2026-11-15';

describe('connections (road-to-1.3.md C4)', () => {
  it('keeps each connection in connections.json and reads it back in a new store', () => {
    const dir = folder();
    const store = new ConnectionStore(dir, crypto(), today);
    expect(store.list()).toEqual([]);
    const c = store.add('test', 'The test box', { timezone: 'Europe/London', depth: 2 })!;
    expect(c.id).toMatch(/^k\d+$/);
    expect(c).toMatchObject({ kind: 'test', label: 'The test box', added: '2026-11-15', config: { timezone: 'Europe/London', depth: 2 } });
    const again = new ConnectionStore(dir, crypto(), today);
    expect(again.list()).toEqual([c]);
    // Two added at once still get ids of their own.
    const d = again.add('test', 'Another', {})!;
    expect(d.id).not.toBe(c.id);
    expect(again.list().map((x) => x.id)).toEqual([c.id, d.id]);
  });

  it('pauses, and notes the day a connection was last used', () => {
    const store = new ConnectionStore(folder(), crypto(), today);
    const c = store.add('test', 'Box', {})!;
    expect(store.pause(c.id, true)).toBe(true);
    expect(store.list()[0].paused).toBe(true);
    store.pause(c.id, false);
    expect(store.list()[0].paused).toBeFalsy();
    store.used(c.id);
    expect(store.list()[0].lastUsed).toBe('2026-11-15');
    expect(store.pause('k404', true)).toBe(false);
  });

  it('treats a bad file as no connections and leaves it as it is', () => {
    const dir = folder();
    for (const bad of ['{ not json', '"just a string"', '{"connections": 3}']) {
      writeFileSync(join(dir, 'connections.json'), bad);
      expect(new ConnectionStore(dir, crypto(), today).list()).toEqual([]);
      expect(readFileSync(join(dir, 'connections.json'), 'utf8')).toBe(bad);
    }
    // Entries that are not connections (a bad id, no kind) are left out; the rest are kept.
    writeFileSync(join(dir, 'connections.json'), JSON.stringify({ connections: [{ id: '../x', kind: 'test', label: 'x', added: '2026-11-15', config: {} }, { id: 'k1', label: 'y' }, { id: 'k2', kind: 'test', label: 'z', added: '2026-11-15', config: {} }] }));
    expect(new ConnectionStore(dir, crypto(), today).list().map((c) => c.id)).toEqual(['k2']);
  });

  it('keeps a secret only in connections.bin, encrypted, and hands it out only in the main process', () => {
    const dir = folder();
    const store = new ConnectionStore(dir, crypto(), today);
    const c = store.add('test', 'Calendar', { timezone: 'Asia/Shanghai' }, SECRET)!;
    expect(c.hasSecret).toBe(true);
    expect(readFileSync(join(dir, 'connections.json'), 'utf8')).not.toContain(SECRET);
    expect(readFileSync(join(dir, 'connections.bin')).toString('utf8')).not.toContain(SECRET);
    expect(new ConnectionStore(dir, crypto(), today).secret(c.id)).toBe(SECRET);
    // Once added, the logs and recordings mask it.
    expect(redactSecrets(`GET ${SECRET} failed`)).toBe('GET [redacted] failed');
  });

  it('cannot add a connection with a secret when the system cannot encrypt, and writes nothing', () => {
    const dir = folder();
    const store = new ConnectionStore(dir, crypto(false), today);
    expect(store.add('test', 'Calendar', {}, SECRET)).toBeNull();
    expect(store.list()).toEqual([]);
    expect(existsSync(join(dir, 'connections.json'))).toBe(false);
    expect(existsSync(join(dir, 'connections.bin'))).toBe(false);
  });

  it('disconnecting removes the secret and the settings', () => {
    const dir = folder();
    const store = new ConnectionStore(dir, crypto(), today);
    const a = store.add('test', 'A', { path: 'C:/A' }, `${SECRET}?a`)!;
    const b = store.add('test', 'B', { path: 'C:/B' }, `${SECRET}?b`)!;
    expect(store.remove(a.id)).toBe(true);
    expect(store.remove(a.id)).toBe(false);
    expect(store.secret(a.id)).toBeNull();
    expect(store.secret(b.id)).toBe(`${SECRET}?b`);
    const again = new ConnectionStore(dir, crypto(), today);
    expect(again.list().map((c) => c.id)).toEqual([b.id]);
    expect(again.secret(a.id)).toBeNull();
    expect(readFileSync(join(dir, 'connections.json'), 'utf8')).not.toContain('C:/A');
    again.remove(b.id);
    expect(again.list()).toEqual([]);
    expect(existsSync(join(dir, 'connections.bin'))).toBe(false);
  });
});
