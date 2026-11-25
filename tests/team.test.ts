import { mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nacl from 'tweetnacl';
import { afterEach, describe, expect, it } from 'vitest';
import { Reservations } from '../app/main/budget';
import { DecisionBroker } from '../app/main/decision-broker';
import { LanServer, toLanAsk } from '../app/main/lan';
import { SpendLedger } from '../app/main/spend';
import type { DecisionRequest } from '../app/shared/types';

// One shop, several people (docs/plan-1.5.md E5): each paired device has a role the server holds it to, what a person's
// commissions cost is kept against them, and a person's own cap stops their rounds.

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const servers: LanServer[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await s.stop(); });

function send(port: number, path: string, body: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end(data);
  });
}
const sealed = (id: string, key: Uint8Array, message: unknown) => {
  const n = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { id, n: b64(n), b: b64(nacl.secretbox(new TextEncoder().encode(JSON.stringify(message)), n, key)) };
};
const open = (key: Uint8Array, text: string) => {
  const { n, b } = JSON.parse(text);
  return JSON.parse(new TextDecoder().decode(nacl.secretbox.open(unb64(b), unb64(n), key)!));
};

const permission: Omit<DecisionRequest, 'id'> = {
  kind: 'permission', agent: 'main', tool: 'Bash', title: 'Run the check', detail: 'node check.js', options: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }], defaultId: 'allow',
};

/** A shop on the home network with a broker and a commission desk, wired as the app wires them. */
async function shop() {
  const commissions: { who: { id: string; name: string }; want: string; template: string }[] = [];
  let s!: LanServer;
  const broker = new DecisionBroker(() => s.asksChanged());
  const file = join(mkdtempSync(join(tmpdir(), 'lamplight-team-')), 'devices.json');
  s = new LanServer({
    file, addresses: () => ['127.0.0.1'], waitMs: 200,
    asks: () => broker.open().map(toLanAsk),
    answer: (id, choice) => broker.answer({ id, choice }, 'phone'),
    commission: async (who, form) => { commissions.push({ who, ...form }); return { ok: true }; },
  });
  servers.push(s);
  const port = await s.start(0);
  let c = 1;
  const device = async (name: string) => {
    const { id, key } = s.pair(name);
    // The QR code's key works once; the shop hands back the device's own (E7).
    const code = unb64(key);
    const k = unb64(open(code, (await send(port, '/pair', sealed(id, code, { c: c++ }))).text).key);
    return { id, say: (path: string, message: object) => send(port, path, sealed(id, k, { c: c++, ...message })), open: (text: string) => open(k, text) };
  };
  return { s, broker, port, file, commissions, device };
}

describe('roles', () => {
  it('pairs a new device as one that may answer, and reads one paired before roles that way too', async () => {
    const { s, file, device } = await shop();
    await device('phone');
    expect(s.devices()[0].role).toBe('approve');
    writeFileSync(file, JSON.stringify([{ id: 'old1', name: 'Old phone', added: '2026-11-21T00:00:00Z', paired: true, key: b64(nacl.randomBytes(32)), counter: 3 }]));
    const again = new LanServer({ file, addresses: () => [] });
    expect(again.devices()[0].role).toBe('approve');
  });

  it('tells each device its role when it polls', async () => {
    const { s, device } = await shop();
    const phone = await device('phone');
    s.setRole(phone.id, 'watch');
    expect(phone.open((await phone.say('/poll', { after: 0 })).text).role).toBe('watch');
  });

  it('does not let a device that only watches answer a request', async () => {
    const { s, broker, device } = await shop();
    const phone = await device('phone');
    s.setRole(phone.id, 'watch');
    void broker.ask(permission);
    expect((await phone.say('/answer', { id: 'd1', choice: 'allow' })).status).toBe(403);
    expect(broker.open().map((r) => r.id)).toEqual(['d1']);
  });

  it('takes a commission only from a device allowed to hand one in', async () => {
    const { s, commissions, device } = await shop();
    const watcher = await device('phone');
    s.setRole(watcher.id, 'watch');
    const approver = await device('tablet');
    for (const d of [watcher, approver]) expect((await d.say('/commission', { want: 'a page about tea', template: 'page' })).status).toBe(403);
    expect(commissions).toEqual([]);

    const laptop = await device('laptop');
    s.setRole(laptop.id, 'commission');
    const r = await laptop.say('/commission', { want: 'a page about tea', template: 'page' });
    expect(r.status).toBe(200);
    expect(laptop.open(r.text)).toEqual({ ok: true });
    expect(commissions).toEqual([{ who: { id: laptop.id, name: 'laptop' }, want: 'a page about tea', template: 'page' }]);
  });

  it('turns away a commission that says nothing, or asks for a kind the page cannot hand in', async () => {
    const { s, commissions, device } = await shop();
    const laptop = await device('laptop');
    s.setRole(laptop.id, 'commission');
    for (const form of [{ want: '  ', template: 'page' }, { want: 'tidy my photos', template: 'tidy' }, { want: 'x'.repeat(5000), template: 'page' }, { want: 'hello', template: 42 }]) {
      expect(laptop.open((await laptop.say('/commission', form)).text)).toEqual({ ok: false, why: 'form' });
    }
    expect(commissions).toEqual([]);
  });
});

describe("each person's spending", () => {
  it('adds up to what the whole shop spent', () => {
    const ledger = new SpendLedger(join(mkdtempSync(join(tmpdir(), 'lamplight-team-')), 'spend.json'));
    const now = new Date(2026, 10, 23);
    ledger.record('C:/works/a', 's1', 1.25, now);
    ledger.record('C:/works/b', 's2', 0.5, now, 'dev1');
    ledger.record('C:/works/b', 's2', 0.75, now, 'dev1');
    ledger.record('C:/works/c', 's3', 0.4, now, 'dev2');
    ledger.estimate('C:/works/c', 's3', 0.1, now, 'dev2');
    const people = ledger.byPerson(now);
    expect(people).toEqual({ '': 1.25, dev1: 0.75, dev2: 0.5 });
    expect(Object.values(people).reduce((a, b) => a + b, 0)).toBeCloseTo(ledger.thisMonth(now), 9);
    expect(ledger.months()[0].people).toEqual(people);
  });
});

describe("a person's own cap", () => {
  const caps = { roundUsd: 0, monthUsd: 20, personUsd: 2 };

  it('does not let their round start once it is reached', () => {
    const r = new Reservations().reserve('r1', undefined, caps, { month: 3, project: 0, person: 1.8 }, 'dev1');
    expect(r).toEqual({ refused: { cap: 'person', capUsd: 2, spentUsd: 1.8, leftUsd: expect.closeTo(0.2, 9) } });
  });

  it('stops their round where it would pass it', () => {
    expect(new Reservations().reserve('r1', undefined, caps, { month: 3, project: 0, person: 0.5 }, 'dev1')).toEqual({ usd: 1.5, by: 'person' });
  });

  it("counts what that person's rounds under way hold, and nobody else's", () => {
    const r = new Reservations();
    expect(r.reserve('r1', undefined, caps, { month: 0, project: 0, person: 0 }, 'dev1')).toEqual({ usd: 2, by: 'person' });
    expect('refused' in r.reserve('r2', undefined, caps, { month: 0, project: 0, person: 0 }, 'dev1')).toBe(true);
    expect(r.reserve('r3', undefined, caps, { month: 0, project: 0, person: 0 }, 'dev2')).toEqual({ usd: 2, by: 'person' });
  });

  it("leaves the owner's rounds to the shop's own caps", () => {
    expect(new Reservations().reserve('r1', undefined, { roundUsd: 0, monthUsd: 20 }, { month: 3, project: 0 })).toEqual({ usd: 17, by: 'month' });
  });
});
