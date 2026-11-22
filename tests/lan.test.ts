import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nacl from 'tweetnacl';
import { afterEach, describe, expect, it } from 'vitest';
import { homeAddresses, LanServer } from '../app/main/lan';

// The connection on the home network (docs/plan-1.5.md E1): off until switched on, only on home-network addresses,
// only paired devices, every message sealed with the device's own key.

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const servers: LanServer[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await s.stop(); });

let clock = 1_000_000;
function make() {
  const s = new LanServer({ file: join(mkdtempSync(join(tmpdir(), 'lamplight-lan-')), 'devices.json'), addresses: () => ['127.0.0.1'], now: () => clock, waitMs: 200 });
  servers.push(s);
  return s;
}

/** A raw request, so the Host header can be anything. */
function send(port: number, path: string, body?: unknown, host = `127.0.0.1:${port}`): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, path, method: data ? 'POST' : 'GET', headers: { Host: host, 'Content-Type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

/** What a phone sends: the device's id and a sealed message. */
function sealed(id: string, key: Uint8Array, message: unknown) {
  const n = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { id, n: b64(n), b: b64(nacl.secretbox(new TextEncoder().encode(JSON.stringify(message)), n, key)) };
}
const open = (key: Uint8Array, text: string) => {
  const { n, b } = JSON.parse(text);
  return JSON.parse(new TextDecoder().decode(nacl.secretbox.open(unb64(b), unb64(n), key)!));
};

describe('which addresses count as the home network', () => {
  it('keeps the private IPv4 ranges and nothing else', () => {
    const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal, netmask: '', mac: '', cidr: null });
    const nets = {
      lo: [v4('127.0.0.1', true)],
      wifi: [v4('192.168.1.20'), { ...v4('fe80::1'), family: 'IPv6' }],
      vpn: [v4('10.8.0.2'), v4('172.16.4.1'), v4('172.31.255.1'), v4('172.32.0.1')],
      wan: [v4('8.8.4.4'), v4('169.254.10.10')],
    };
    expect(homeAddresses(nets as never)).toEqual(['192.168.1.20', '10.8.0.2', '172.16.4.1', '172.31.255.1']);
  });
});

describe('the address in the QR code', () => {
  it('prefers a Wi-Fi address over a virtual adapter', async () => {
    const s = new LanServer({ file: join(mkdtempSync(join(tmpdir(), 'lamplight-lan-')), 'devices.json'), addresses: () => ['127.0.0.1', '127.0.0.2'] });
    servers.push(s);
    await s.start(0);
    // Loopback stands in for both here; the ranking is by prefix.
    expect(s.pair('phone').url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#d=/);
  });
});

describe('the server', () => {
  it('does not listen until it is started, and stops listening when stopped', async () => {
    const s = make();
    expect(s.listening).toBe(false);
    const port = await s.start(0);
    expect(s.listening).toBe(true);
    expect(s.listeningOn()).toEqual([`127.0.0.1:${port}`]);
    await s.stop();
    expect(s.listening).toBe(false);
    await expect(send(port, '/')).rejects.toThrow();
  });

  it('serves the page only under its own address, never under another host name', async () => {
    const s = make();
    const port = await s.start(0);
    expect((await send(port, '/')).status).toBe(200);
    expect((await send(port, '/', undefined, `evil.example:${port}`)).status).toBe(403);
    expect((await send(port, '/', undefined, `127.0.0.1:${port + 1}`)).status).toBe(403);
  });

  it('pairs a new device that proves it has the key from the QR code', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, key, url } = s.pair('phone');
    expect(url).toContain(`#d=${id}&k=`);
    expect(s.devices()).toMatchObject([{ id, name: 'phone', paired: false }]);
    const ok = await send(port, '/pair', sealed(id, unb64(key), { c: 1 }));
    expect(ok.status).toBe(200);
    expect(s.devices()).toMatchObject([{ id, paired: true }]);
  });

  it('refuses an unknown device, a wrong key and a message it has seen before', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, key } = s.pair('phone');
    const k = unb64(key);
    await send(port, '/pair', sealed(id, k, { c: 1 }));
    expect((await send(port, '/poll', sealed('nobody', k, { c: 2, after: 0 }))).status).toBe(403);
    expect((await send(port, '/poll', sealed(id, nacl.randomBytes(32), { c: 2, after: 0 }))).status).toBe(403);
    expect((await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).status).toBe(200);
    expect((await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).status).toBe(403);
  });

  it('hands a paired device what goes on in the shop, sealed with its key', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, key } = s.pair('phone');
    const k = unb64(key);
    await send(port, '/pair', sealed(id, k, { c: 1 }));
    s.push({ t: 5, kind: 'tool', agent: 'adeng', plain: 'Reading the brief' });
    const got = await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }));
    const said = open(k, got.text);
    expect(said.events).toEqual([{ seq: 1, t: 5, kind: 'tool', agent: 'adeng', plain: 'Reading the brief' }]);
    expect(said.next).toBe(1);
    // Nothing new: the poll waits, then comes back empty.
    expect(open(k, (await send(port, '/poll', sealed(id, k, { c: 3, after: 1 }))).text).events).toEqual([]);
  });

  it('stops taking pairing tries for a minute after five wrong ones', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, key } = s.pair('phone');
    for (let i = 0; i < 5; i++) expect((await send(port, '/pair', sealed(id, nacl.randomBytes(32), { c: 1 }))).status).toBe(403);
    expect((await send(port, '/pair', sealed(id, unb64(key), { c: 1 }))).status).toBe(429);
    clock += 61_000;
    expect((await send(port, '/pair', sealed(id, unb64(key), { c: 1 }))).status).toBe(200);
  });

  it('shuts a removed device out at once, and remembers the devices across a restart', async () => {
    const s = make();
    const port = await s.start(0);
    const phone = s.pair('phone');
    const tablet = s.pair('tablet');
    const k = unb64(phone.key);
    await send(port, '/pair', sealed(phone.id, k, { c: 1 }));
    s.remove(phone.id);
    expect((await send(port, '/poll', sealed(phone.id, k, { c: 2, after: 0 }))).status).toBe(403);
    const again = new LanServer({ file: s.file, addresses: () => ['127.0.0.1'] });
    expect(again.devices().map((d) => d.id)).toEqual([tablet.id]);
    expect(JSON.stringify(again.devices())).not.toContain(tablet.key);
  });
});
