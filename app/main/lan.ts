import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { NetworkInterfaceInfo } from 'node:os';
import nacl from 'tweetnacl';
import { lanPage } from './lan-page';

/**
 * The shop on the home network (docs/plan-1.5.md E1). Off until the user switches it on; then a small HTTP server on each
 * of this computer's home-network addresses, for devices paired with a QR code. Each device has its own 32-byte key, which
 * only travels in the QR code's #fragment; every message either way is sealed with it (tweetnacl secretbox), because a
 * browser gives no crypto.subtle to a page on http://192.168.x.x. A message carries a counter that only goes up, so none
 * can be played again. The Host header must be one of our own addresses, so no other web page can reach in through the
 * browser. Five wrong pairing tries close pairing for a minute.
 */

/** What the shop tells paired devices: a slice of each event the window gets, never paths or the raw stream. */
export type LanEvent = { t: number; kind: string; agent: string; plain: string };
export type LanDevice = { id: string; name: string; added: string; paired: boolean; lastSeen?: string };
type Kept = LanDevice & { key: string; counter: number };

/** 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16: the home network. Never loopback, link-local or public addresses. */
export function homeAddresses(nets: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const home = (a: string) => {
    const [x, y] = a.split('.').map(Number);
    return x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
  };
  return Object.values(nets).flatMap((list) => (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal && home(n.address)).map((n) => n.address));
}

const PAIR_TRIES = 5;
const PAIR_PAUSE_MS = 60_000;
const WAIT_MS = 25_000;
const KEEP_EVENTS = 200;
const MAX_BODY = 16_384;
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

export class LanServer {
  readonly file: string;
  private servers: Server[] = [];
  private hosts = new Set<string>();
  private port = 0;
  private kept: Kept[];
  private events: (LanEvent & { seq: number })[] = [];
  private seq = 0;
  private waiting = new Set<() => void>();
  private wrongTries = 0;
  private pausedUntil = 0;
  private now: () => number;
  private waitMs: number;

  constructor(private opts: { file: string; addresses: () => string[]; now?: () => number; waitMs?: number; page?: () => string }) {
    this.file = opts.file;
    this.now = opts.now ?? Date.now;
    this.waitMs = opts.waitMs ?? WAIT_MS;
    this.kept = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as Kept[]) : [];
  }

  get listening() {
    return this.servers.length > 0;
  }

  /** host:port of each address listened on. */
  listeningOn(): string[] {
    return [...this.hosts];
  }

  /** Listen on every home-network address at this port (0: any free one, the same for all). Returns the port. */
  async start(port: number): Promise<number> {
    await this.stop();
    this.port = port;
    for (const address of this.opts.addresses()) {
      const server = createServer((req, res) => void this.handle(req, res));
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.port, address, () => resolve());
      });
      this.port = (server.address() as { port: number }).port;
      this.servers.push(server);
      this.hosts.add(`${address}:${this.port}`);
    }
    return this.port;
  }

  async stop() {
    for (const wake of this.waiting) wake();
    const closing = this.servers.map((s) => new Promise<void>((resolve) => { s.closeAllConnections(); s.close(() => resolve()); }));
    this.servers = [];
    this.hosts.clear();
    await Promise.all(closing);
  }

  /** A new device to pair: its key and the address the QR code carries, the key after the # so it never reaches us. */
  pair(name: string): { id: string; key: string; url: string } {
    const id = randomBytes(8).toString('hex');
    const key = b64(nacl.randomBytes(nacl.secretbox.keyLength));
    this.kept.push({ id, name, key, added: new Date(this.now()).toISOString(), paired: false, counter: 0 });
    this.save();
    // A Wi-Fi router hands out 192.168.x.x; 172.x is often a virtual adapter (WSL, Hyper-V) that no phone can reach.
    const rank = (h: string) => (h.startsWith('192.168.') ? 0 : h.startsWith('10.') ? 1 : 2);
    const host = [...this.listeningOn()].sort((a, b) => rank(a) - rank(b))[0] ?? `0.0.0.0:${this.port}`;
    return { id, key, url: `http://${host}/#d=${id}&k=${encodeURIComponent(key)}` };
  }

  devices(): LanDevice[] {
    return this.kept.map(({ id, name, added, paired, lastSeen }) => ({ id, name, added, paired, ...(lastSeen ? { lastSeen } : {}) }));
  }

  /** Forget a device: its next message is refused. */
  remove(id: string) {
    this.kept = this.kept.filter((d) => d.id !== id);
    this.save();
    // A poll it has waiting ends now, refused.
    for (const wake of this.waiting) wake();
  }

  /** Something happened in the shop: paired devices get it on their next poll. */
  push(e: LanEvent) {
    this.events.push({ seq: ++this.seq, t: e.t, kind: e.kind, agent: e.agent, plain: e.plain });
    if (this.events.length > KEEP_EVENTS) this.events.shift();
    for (const wake of this.waiting) wake();
  }

  private save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.kept, null, 1));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const end = (status: number, body = '', type = 'text/plain') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    };
    if (!this.hosts.has(req.headers.host ?? '')) return end(403);
    if (req.method === 'GET' && req.url === '/') return end(200, (this.opts.page ?? lanPage)(), 'text/html; charset=utf-8');
    if (req.method !== 'POST' || (req.url !== '/pair' && req.url !== '/poll')) return end(404);
    const pairing = req.url === '/pair';
    if (pairing && this.now() < this.pausedUntil) return end(429);
    const said = await this.read(req);
    const device = said && this.kept.find((d) => d.id === said.id);
    const message = device && said ? this.unseal(device, said) : null;
    if (!device || !message || typeof message.c !== 'number' || message.c <= device.counter || (!pairing && !device.paired)) {
      if (pairing && ++this.wrongTries >= PAIR_TRIES) {
        this.wrongTries = 0;
        this.pausedUntil = this.now() + PAIR_PAUSE_MS;
      }
      return end(403);
    }
    device.counter = message.c;
    device.lastSeen = new Date(this.now()).toISOString();
    if (pairing) {
      device.paired = true;
      this.wrongTries = 0;
      this.save();
      return end(200, JSON.stringify(this.seal(device, { ok: true })), 'application/json');
    }
    this.save();
    const after = typeof message.after === 'number' ? message.after : 0;
    if (!this.events.some((e) => e.seq > after)) await this.waitForNews();
    // Removed while it waited: nothing more for it.
    if (!this.kept.includes(device)) return end(403);
    const events = this.events.filter((e) => e.seq > after);
    return end(200, JSON.stringify(this.seal(device, { events, next: this.seq })), 'application/json');
  }

  private waitForNews() {
    return new Promise<void>((resolve) => {
      const wake = () => { clearTimeout(timer); this.waiting.delete(wake); resolve(); };
      const timer = setTimeout(wake, this.waitMs);
      this.waiting.add(wake);
    });
  }

  private read(req: IncomingMessage): Promise<{ id: string; n: string; b: string } | null> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (c: Buffer) => {
        body += c;
        if (body.length > MAX_BODY) { resolve(null); req.destroy(); }
      });
      req.on('end', () => {
        try {
          const v = JSON.parse(body);
          resolve(typeof v?.id === 'string' && typeof v.n === 'string' && typeof v.b === 'string' ? v : null);
        } catch {
          resolve(null);
        }
      });
    });
  }

  private unseal(device: Kept, said: { n: string; b: string }): { c?: unknown; after?: unknown } | null {
    const nonce = unb64(said.n);
    if (nonce.length !== nacl.secretbox.nonceLength) return null;
    const opened = nacl.secretbox.open(unb64(said.b), nonce, unb64(device.key));
    if (!opened) return null;
    try {
      return JSON.parse(new TextDecoder().decode(opened));
    } catch {
      return null;
    }
  }

  private seal(device: Kept, message: unknown) {
    const n = nacl.randomBytes(nacl.secretbox.nonceLength);
    return { n: b64(n), b: b64(nacl.secretbox(new TextEncoder().encode(JSON.stringify(message)), n, unb64(device.key))) };
  }
}
