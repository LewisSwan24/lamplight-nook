import { request, type IncomingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nacl from 'tweetnacl';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionBroker } from '../app/main/decision-broker';
import { homeAddresses, LanServer, toLanAsk } from '../app/main/lan';
import type { DecisionRequest } from '../app/shared/types';

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
function send(port: number, path: string, body?: unknown, host = `127.0.0.1:${port}`): Promise<{ status: number; text: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, path, method: data ? 'POST' : 'GET', headers: { Host: host, 'Content-Type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
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
/** Pair as the page does (E7): prove the QR code's key once, then keep the fresh key the shop hands back. */
async function pairUp(s: LanServer, port: number, name = 'phone') {
  const { id, key } = s.pair(name);
  const got = await send(port, '/pair', sealed(id, unb64(key), { c: 1 }));
  return { id, k: unb64(open(unb64(key), got.text).key) };
}

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

  it('takes a pairing code once: the shop hands back a fresh key, and the code opens nothing after', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, key } = s.pair('phone');
    const code = unb64(key);
    const fresh = unb64(open(code, (await send(port, '/pair', sealed(id, code, { c: 1 }))).text).key);
    expect(fresh).toHaveLength(32);
    expect(b64(fresh)).not.toBe(key);
    // Someone who photographed the QR code, or copied the address: neither pairing again nor polling gets them in.
    expect((await send(port, '/pair', sealed(id, code, { c: 50 }))).status).toBe(403);
    expect((await send(port, '/poll', sealed(id, code, { c: 51, after: 0 }))).status).toBe(403);
    expect((await send(port, '/poll', sealed(id, fresh, { c: 52, after: 0 }))).status).toBe(200);
    // Nor does the paired device pair a second time.
    expect((await send(port, '/pair', sealed(id, fresh, { c: 53 }))).status).toBe(403);
    expect(readFileSync(s.file, 'utf8')).not.toContain(key);
  });

  it('lets a code nobody scanned go stale after ten minutes', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, key } = s.pair('phone');
    clock += 10 * 60_000 + 1;
    expect((await send(port, '/pair', sealed(id, unb64(key), { c: 1 }))).status).toBe(403);
  });

  it('serves the page so that no other page can frame it or send what it holds anywhere else', async () => {
    const s = make();
    const port = await s.start(0);
    const { headers } = await send(port, '/');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("connect-src 'self'");
    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  it('cuts off a request that never finishes arriving', async () => {
    const s = new LanServer({ file: join(mkdtempSync(join(tmpdir(), 'lamplight-lan-')), 'devices.json'), addresses: () => ['127.0.0.1'], slowMs: 300 });
    servers.push(s);
    const port = await s.start(0);
    const took = await new Promise<number>((resolve) => {
      const t0 = Date.now();
      const sock = connect(port, '127.0.0.1', () => sock.write(`POST /poll HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"id":`));
      sock.on('error', () => {});
      sock.on('close', () => resolve(Date.now() - t0));
      sock.resume();
    });
    expect(took).toBeLessThan(2500);
  });

  it('refuses a request too large to be a message, and goes on answering', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, k } = await pairUp(s, port);
    const big = await send(port, '/poll', { id, n: 'x', b: 'y'.repeat(40_000) }).catch(() => ({ status: 0 }));
    expect([0, 403]).toContain(big.status);
    expect((await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).status).toBe(200);
  });

  it('refuses an unknown device, a wrong key and a message it has seen before', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, k } = await pairUp(s, port);
    expect((await send(port, '/poll', sealed('nobody', k, { c: 2, after: 0 }))).status).toBe(403);
    expect((await send(port, '/poll', sealed(id, nacl.randomBytes(32), { c: 2, after: 0 }))).status).toBe(403);
    expect((await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).status).toBe(200);
    expect((await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).status).toBe(403);
  });

  it('hands a paired device what goes on in the shop, sealed with its key', async () => {
    const s = make();
    const port = await s.start(0);
    const { id, k } = await pairUp(s, port);
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
    const phone = await pairUp(s, port);
    const tablet = s.pair('tablet');
    s.remove(phone.id);
    expect((await send(port, '/poll', sealed(phone.id, phone.k, { c: 2, after: 0 }))).status).toBe(403);
    const again = new LanServer({ file: s.file, addresses: () => ['127.0.0.1'] });
    expect(again.devices().map((d) => d.id)).toEqual([tablet.id]);
    expect(JSON.stringify(again.devices())).not.toContain(tablet.key);
  });
});

// E4: what waits for an answer goes to the phone too, and whichever side answers first settles it.
const permission: Omit<DecisionRequest, 'id'> = {
  kind: 'permission', agent: 'main', tool: 'Bash', title: 'Run the check', reason: 'It runs a program',
  detail: 'node C:/Users/someone/secret/check.js', options: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }], defaultId: 'allow',
};

/** A server and a broker wired the way the app wires them. */
async function wired() {
  const settled: { id: string; choice: string; by: string }[] = [];
  let s!: LanServer;
  const broker = new DecisionBroker(() => s.asksChanged(), (req, choice, by) => settled.push({ id: req.id, choice, by }));
  s = new LanServer({
    file: join(mkdtempSync(join(tmpdir(), 'lamplight-lan-')), 'devices.json'), addresses: () => ['127.0.0.1'], now: () => clock, waitMs: 5000,
    asks: () => broker.open().map(toLanAsk),
    answer: (id, choice) => broker.answer({ id, choice }, 'phone'),
  });
  servers.push(s);
  const port = await s.start(0);
  const { id, k } = await pairUp(s, port);
  return { s, broker, settled, port, id, k };
}

describe('requests on the phone', () => {
  it('hands a paired device what waits for an answer, without the command or its paths', async () => {
    const { broker, port, id, k } = await wired();
    void broker.ask(permission);
    const said = open(k, (await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).text);
    expect(said.asks).toEqual([{ id: 'd1', kind: 'permission', agent: 'main', title: 'Run the check', reason: 'It runs a program', options: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }] }]);
    expect(JSON.stringify(said)).not.toContain('secret');
  });

  it('wakes a waiting poll as soon as a request comes or goes', async () => {
    const { broker, port, id, k } = await wired();
    const first = open(k, (await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).text);
    const started = Date.now();
    setTimeout(() => void broker.ask(permission), 100);
    const next = open(k, (await send(port, '/poll', sealed(id, k, { c: 3, after: first.next, asks: first.version }))).text);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(next.asks.map((a: { id: string }) => a.id)).toEqual(['d1']);
  });

  it('takes an answer from the phone, and the desk hears it was answered there', async () => {
    const { broker, settled, port, id, k } = await wired();
    const asked = broker.ask(permission);
    const got = await send(port, '/answer', sealed(id, k, { c: 2, id: 'd1', choice: 'deny' }));
    expect(got.status).toBe(200);
    expect(open(k, got.text)).toEqual({ ok: true });
    expect(await asked).toBe('deny');
    expect(settled).toEqual([{ id: 'd1', choice: 'deny', by: 'phone' }]);
    // The desk was second: too late.
    expect(broker.answer({ id: 'd1', choice: 'allow' })).toBe(false);
  });

  it('the desk answering first takes the request off the phone', async () => {
    const { broker, settled, port, id, k } = await wired();
    void broker.ask(permission);
    broker.answer({ id: 'd1', choice: 'allow' });
    expect(settled).toEqual([{ id: 'd1', choice: 'allow', by: 'desk' }]);
    expect(open(k, (await send(port, '/answer', sealed(id, k, { c: 2, id: 'd1', choice: 'deny' }))).text)).toEqual({ ok: false });
    expect(open(k, (await send(port, '/poll', sealed(id, k, { c: 3, after: 0 }))).text).asks).toEqual([]);
  });

  it('never takes a serious step from the phone', async () => {
    const { broker, port, id, k } = await wired();
    void broker.ask({ ...permission, kind: 'serious', defaultId: 'deny' });
    expect(open(k, (await send(port, '/poll', sealed(id, k, { c: 2, after: 0 }))).text).asks[0].kind).toBe('serious');
    expect(open(k, (await send(port, '/answer', sealed(id, k, { c: 3, id: 'd1', choice: 'allow' }))).text)).toEqual({ ok: false });
    expect(broker.waiting).toBe(1);
  });

  it('takes no answer from a device it does not know, or one played again', async () => {
    const { broker, port, id, k } = await wired();
    void broker.ask(permission);
    expect((await send(port, '/answer', sealed('nobody', k, { c: 2, id: 'd1', choice: 'allow' }))).status).toBe(403);
    const once = sealed(id, k, { c: 2, id: 'd1', choice: 'deny' });
    void broker.ask(permission);
    expect((await send(port, '/answer', once)).status).toBe(200);
    expect((await send(port, '/answer', { ...once })).status).toBe(403);
    expect(broker.waiting).toBe(1);
  });
});
