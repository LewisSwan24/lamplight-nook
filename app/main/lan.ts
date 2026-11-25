import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { NetworkInterfaceInfo } from 'node:os';
import nacl from 'tweetnacl';
import { FROM_AFAR, type TemplateId } from '../shared/templates';
import type { DecisionRequest, LanRole } from '../shared/types';
import { lanPage } from './lan-page';

/**
 * The shop on the home network (docs/plan-1.5.md E1). Off until the user switches it on; then a small HTTP server on each
 * of this computer's home-network addresses, for devices paired with a QR code. Each device has its own 32-byte key, which
 * only travels in the QR code's #fragment; every message either way is sealed with it (tweetnacl secretbox), because a
 * browser gives no crypto.subtle to a page on http://192.168.x.x. A message carries a counter that only goes up, so none
 * can be played again. The Host header must be one of our own addresses, so no other web page can reach in through the
 * browser. Five wrong pairing tries close pairing for a minute. A QR code pairs once, within ten minutes, and the device
 * gets a fresh key of its own as it pairs (E7).
 */

/** What the shop tells paired devices: a slice of each event the window gets, never paths or the raw stream. */
export type LanEvent = { t: number; kind: string; agent: string; plain: string };
/**
 * What a paired device may do (E5): watch only, answer requests too, or hand in commissions as well. The server holds a
 * device to it; the page only follows. A device paired before roles came is one that answers, as every one was then.
 */
export const LAN_ROLES: readonly LanRole[] = ['watch', 'approve', 'commission'];
/** What a person may spend in a calendar month, in US dollars (0: no cap of their own). */
export const PERSON_CAP_CHOICES = [0, 1, 2, 5, 10] as const;
export type LanDevice = { id: string; name: string; added: string; paired: boolean; lastSeen?: string; role: LanRole; capUsd: number };
type Kept = LanDevice & { key: string; counter: number };
/** A commission handed in from a browser: what is wanted and which kind of work (only one a page can hand in). */
export type FarForm = { want: string; template: TemplateId };
/** How a commission from afar was taken: queued, or why not (the form, or a cap that stops it starting). */
export type FarTaken = { ok: true } | { ok: false; why: 'form' | 'cap' | 'busy' };
/** The most a want may say from a page, as on the desk's own slip. */
const WANT_MAX = 2000;
/** A request waiting for an answer, as the phone sees it (E4): never `detail`, which holds the whole command and its paths. */
export type LanAsk = { id: string; kind: DecisionRequest['kind']; agent: string; title: string; reason?: string; options: { id: string; label: string }[] };

export function toLanAsk(req: DecisionRequest): LanAsk {
  return { id: req.id, kind: req.kind, agent: req.agent, title: req.title, ...(req.reason ? { reason: req.reason } : {}), options: req.options.map(({ id, label }) => ({ id, label })) };
}

/** 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16: the home network. Never loopback, link-local or public addresses. */
export function homeAddresses(nets: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const home = (a: string) => {
    const [x, y] = a.split('.').map(Number);
    return x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
  };
  return Object.values(nets).flatMap((list) => (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal && home(n.address)).map((n) => n.address));
}

export type { LanRole };

const PAIR_TRIES = 5;
const PAIR_PAUSE_MS = 60_000;
/** A QR code nobody scanned stops pairing after this long (E7); pairing again on the computer makes a new one. */
const PAIR_FRESH_MS = 10 * 60_000;
const WAIT_MS = 25_000;
const KEEP_EVENTS = 200;
const MAX_BODY = 16_384;
/** A request still arriving after this long is cut off (E7). The long poll waits on our side, after it has arrived. */
const SLOW_MS = 10_000;
/**
 * What the page may do (E7): its own inline script and style, talk only to the shop that served it, never be framed by
 * another page (which could press its buttons), and send no address along when it is left.
 */
const PAGE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
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
  private slowMs: number;
  /** Goes up whenever a request comes or goes, so a phone knows whether its list is current. */
  private version = 0;

  constructor(private opts: {
    file: string; addresses: () => string[]; now?: () => number; waitMs?: number; slowMs?: number; page?: () => string; asks?: () => LanAsk[]; answer?: (id: string, choice: string) => boolean;
    /** A commission handed in from a device allowed to (E5). */
    commission?: (who: { id: string; name: string }, form: FarForm) => Promise<FarTaken>;
  }) {
    this.file = opts.file;
    this.now = opts.now ?? Date.now;
    this.waitMs = opts.waitMs ?? WAIT_MS;
    this.slowMs = opts.slowMs ?? SLOW_MS;
    const read = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Kept>[]) : [];
    this.kept = read.map((d) => ({ ...d, role: LAN_ROLES.includes(d.role!) ? d.role! : 'approve', capUsd: typeof d.capUsd === 'number' ? d.capUsd : 0 }) as Kept);
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
      // A request that dribbles in (a slow sender holding connections open) is cut off once it has taken too long.
      const slow = { requestTimeout: this.slowMs, headersTimeout: this.slowMs, connectionsCheckingInterval: Math.min(1000, this.slowMs / 3) };
      const server = createServer(slow, (req, res) => void this.handle(req, res));
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
    this.kept.push({ id, name, key, added: new Date(this.now()).toISOString(), paired: false, counter: 0, role: 'approve', capUsd: 0 });
    this.save();
    // A Wi-Fi router hands out 192.168.x.x; 172.x is often a virtual adapter (WSL, Hyper-V) that no phone can reach.
    const rank = (h: string) => (h.startsWith('192.168.') ? 0 : h.startsWith('10.') ? 1 : 2);
    const host = [...this.listeningOn()].sort((a, b) => rank(a) - rank(b))[0] ?? `0.0.0.0:${this.port}`;
    return { id, key, url: `http://${host}/#d=${id}&k=${encodeURIComponent(key)}` };
  }

  devices(): LanDevice[] {
    return this.kept.map(({ id, name, added, paired, lastSeen, role, capUsd }) => ({ id, name, added, paired, ...(lastSeen ? { lastSeen } : {}), role, capUsd }));
  }

  /** The owner changed what a device may do; a poll it has waiting hears at once. */
  setRole(id: string, role: LanRole) {
    const d = this.kept.find((x) => x.id === id);
    if (!d || !LAN_ROLES.includes(role)) return;
    d.role = role;
    this.save();
    for (const wake of this.waiting) wake();
  }

  /** The owner set what a device's person may spend in a month (0: no cap of their own). */
  setCap(id: string, usd: number) {
    const d = this.kept.find((x) => x.id === id);
    if (!d || !(PERSON_CAP_CHOICES as readonly number[]).includes(usd)) return;
    d.capUsd = usd;
    this.save();
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

  /** A request came or went: waiting phones get the new list now. */
  asksChanged() {
    this.version++;
    for (const wake of this.waiting) wake();
  }

  private save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.kept, null, 1));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const end = (status: number, body = '', type = 'text/plain', more = {}) => {
      // Cut off while it arrived (too large, too slow): there is nobody left to answer.
      if (res.socket?.destroyed) return;
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...more });
      res.end(body);
    };
    if (!this.hosts.has(req.headers.host ?? '')) return end(403);
    if (req.method === 'GET' && req.url === '/') return end(200, (this.opts.page ?? lanPage)(), 'text/html; charset=utf-8', PAGE_HEADERS);
    if (req.method !== 'POST' || !['/pair', '/poll', '/answer', '/commission'].includes(req.url ?? '')) return end(404);
    const pairing = req.url === '/pair';
    if (pairing && this.now() < this.pausedUntil) return end(429);
    const said = await this.read(req);
    const device = said && this.kept.find((d) => d.id === said.id);
    const message = device && said ? this.unseal(device, said) : null;
    // A QR code pairs once, and only while it is fresh (E7): a photo of it, or the address copied, is no use later.
    const spent = pairing && device && (device.paired || this.now() - Date.parse(device.added) > PAIR_FRESH_MS);
    if (!device || !message || typeof message.c !== 'number' || message.c <= device.counter || (!pairing && !device.paired) || spent) {
      if (pairing && ++this.wrongTries >= PAIR_TRIES) {
        this.wrongTries = 0;
        this.pausedUntil = this.now() + PAIR_PAUSE_MS;
      }
      return end(403);
    }
    device.counter = message.c;
    device.lastSeen = new Date(this.now()).toISOString();
    if (pairing) {
      // The device's own key from now on, sent sealed with the code's; the key in the QR code opens nothing after this.
      const key = b64(nacl.randomBytes(nacl.secretbox.keyLength));
      const sealed = this.seal(device, { ok: true, key });
      device.key = key;
      device.paired = true;
      this.wrongTries = 0;
      this.save();
      return end(200, JSON.stringify(sealed), 'application/json');
    }
    this.save();
    const reply = (message: unknown) => end(200, JSON.stringify(this.seal(device, message)), 'application/json');
    if (req.url === '/answer') {
      // Watching only: the request stays for someone who may answer it (E5).
      if (device.role === 'watch') return end(403);
      const ok = typeof message.id === 'string' && typeof message.choice === 'string' && (this.opts.answer?.(message.id, message.choice) ?? false);
      return reply({ ok });
    }
    if (req.url === '/commission') {
      if (device.role !== 'commission' || !this.opts.commission) return end(403);
      const want = typeof message.want === 'string' ? message.want.trim() : '';
      const kind = message.template;
      if (!want || want.length > WANT_MAX || typeof kind !== 'string' || !(FROM_AFAR as readonly string[]).includes(kind)) return reply({ ok: false, why: 'form' });
      return reply(await this.opts.commission({ id: device.id, name: device.name }, { want, template: kind as TemplateId }));
    }
    const after = typeof message.after === 'number' ? message.after : 0;
    // A phone that already has the current list of requests waits for something new; one that has not, gets it now.
    if (!this.events.some((e) => e.seq > after) && message.asks === this.version) await this.waitForNews();
    // Removed while it waited: nothing more for it.
    if (!this.kept.includes(device)) return end(403);
    const events = this.events.filter((e) => e.seq > after);
    return reply({ events, next: this.seq, asks: this.opts.asks?.() ?? [], version: this.version, role: device.role });
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
      // Cut off before it all came (too slow): nothing to read, and nothing left waiting on it.
      req.on('close', () => resolve(null));
    });
  }

  private unseal(device: Kept, said: { n: string; b: string }): { c?: unknown; after?: unknown; asks?: unknown; id?: unknown; choice?: unknown; want?: unknown; template?: unknown } | null {
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
