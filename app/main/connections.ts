import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDay } from '../shared/localday';
import type { Connection, ConnectionKind } from '../shared/types';
import { knowSecret, type KeyCrypto } from './api-key';

/** A connection's id names its MCP server (nook-<id>), so only this shape is ever taken from a file or the page. */
export const CONNECTION_ID = /^k\d+$/;
const KINDS = new Set<ConnectionKind>(['folder', 'calendar', 'maildraft', 'test']);

const isConnection = (c: Partial<Connection> | null): c is Connection => Boolean(c && typeof c.id === 'string' && CONNECTION_ID.test(c.id)
  && KINDS.has(c.kind as ConnectionKind) && typeof c.label === 'string' && typeof c.added === 'string' && c.config && typeof c.config === 'object');

/** Write through a temporary file, so a crash halfway leaves the old file whole. */
function writeAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

/**
 * The user's connections (road-to-1.3.md C4), in the data folder: connections.json has what each is, never a secret;
 * the secrets (a calendar's private address, later a token) are in connections.bin, encrypted by the OS like the API key
 * (KeyStore). A secret is only ever unlocked here in the main process, and is masked in the log and the recordings from
 * the moment it is added or unlocked.
 */
export class ConnectionStore {
  private items: Connection[];
  private readonly json: string;
  private readonly bin: string;

  constructor(private dir: string, private crypto: KeyCrypto, private today: () => string = () => localDay(new Date())) {
    this.json = join(dir, 'connections.json');
    this.bin = join(dir, 'connections.bin');
    this.items = this.read();
  }

  /** A file that cannot be read counts as no connections, and is left as it is until one is added. */
  private read(): Connection[] {
    try {
      const data = JSON.parse(readFileSync(this.json, 'utf8')) as { connections?: unknown };
      return Array.isArray(data?.connections) ? data.connections.filter(isConnection) : [];
    } catch {
      return [];
    }
  }

  private save() {
    mkdirSync(this.dir, { recursive: true });
    writeAtomic(this.json, `${JSON.stringify({ connections: this.items }, null, 2)}\n`);
  }

  private secrets(): Record<string, string> {
    if (!existsSync(this.bin) || !this.crypto.isEncryptionAvailable()) return {};
    try {
      return JSON.parse(this.crypto.decryptString(readFileSync(this.bin))) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private saveSecrets(all: Record<string, string>) {
    if (!Object.keys(all).length) {
      rmSync(this.bin, { force: true });
      return;
    }
    mkdirSync(this.dir, { recursive: true });
    writeAtomic(this.bin, this.crypto.encryptString(JSON.stringify(all)));
  }

  list(): Connection[] {
    return this.items.map((c) => ({ ...c, config: { ...c.config } }));
  }

  get(id: string): Connection | undefined {
    return this.items.find((c) => c.id === id);
  }

  /** Null when it has a secret and the OS cannot encrypt it: then nothing is written and the connection is not made. */
  add(kind: ConnectionKind, label: string, config: Connection['config'], secret?: string): Connection | null {
    if (secret !== undefined && !this.crypto.isEncryptionAvailable()) return null;
    let n = Date.now();
    while (this.items.some((c) => c.id === `k${n}`)) n++;
    const c: Connection = { id: `k${n}`, kind, label, added: this.today(), config: { ...config }, ...(secret !== undefined ? { hasSecret: true } : {}) };
    if (secret !== undefined) {
      knowSecret(secret);
      this.saveSecrets({ ...this.secrets(), [c.id]: secret });
    }
    this.items.push(c);
    this.save();
    return { ...c, config: { ...c.config } };
  }

  /** A connection's secret, unlocked; null when it has none or it cannot be read. */
  secret(id: string): string | null {
    const s = this.secrets()[id];
    if (typeof s !== 'string') return null;
    knowSecret(s);
    return s;
  }

  pause(id: string, on: boolean): boolean {
    const c = this.get(id);
    if (!c) return false;
    if (on) c.paused = true;
    else delete c.paused;
    this.save();
    return true;
  }

  /** A tool of the connection ran: the card says when it was last used. */
  used(id: string) {
    const c = this.get(id);
    if (!c || c.lastUsed === this.today()) return;
    c.lastUsed = this.today();
    this.save();
  }

  /** Disconnect: the secret and the settings go. What it did stays in the records (C6). */
  remove(id: string): boolean {
    if (!this.get(id)) return false;
    const all = this.secrets();
    if (id in all) {
      delete all[id];
      this.saveSecrets(all);
    }
    this.items = this.items.filter((c) => c.id !== id);
    this.save();
    return true;
  }
}
