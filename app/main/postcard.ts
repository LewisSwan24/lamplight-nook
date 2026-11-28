import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSTCARD_MAX_BYTES, keepPostcard, postcardText, readPostcard } from '../shared/postcard';
import type { Postcard } from '../shared/postcard';
import { SCENES, type SceneId } from '../shared/scenes';
import { createHash } from 'node:crypto';

/** A card in the record: who, where, the day it first came, and a short key to know the same card again. */
type Received = { name: string; home: SceneId; date: string | null; key: string };
const keyOf = (card: Postcard) => createHash('sha256').update(postcardText(card)).digest('hex').slice(0, 16);
const isReceived = (r: unknown): r is Received => {
  const o = r as Received;
  return !!o && typeof o.name === 'string' && (SCENES as readonly string[]).includes(o.home)
    && (o.date === null || typeof o.date === 'string') && typeof o.key === 'string';
};

export type PostcardOpen = { ok: true; card: Postcard } | { ok: false; reason: 'big' | 'notPostcard' | 'broken' };

/**
 * A postcard file someone sent (docs/plan-1.5.md E3). Its size is looked at before anything is read, and no more than
 * that is read even if the file grows meanwhile. Nothing is ever written there; once open, the post office keeps a copy of
 * the card itself on its wall (PostcardWall), and nothing else.
 */
export function readPostcardFile(path: string): PostcardOpen {
  let fd: number | undefined;
  try {
    const st = statSync(path);
    if (!st.isFile()) return { ok: false, reason: 'notPostcard' };
    if (st.size > POSTCARD_MAX_BYTES) return { ok: false, reason: 'big' };
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(POSTCARD_MAX_BYTES + 1);
    const n = readSync(fd, buf, 0, buf.length, 0);
    if (n > POSTCARD_MAX_BYTES) return { ok: false, reason: 'big' };
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, n));
    return readPostcard(text);
  } catch {
    return { ok: false, reason: 'notPostcard' };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * The postcards the post office keeps on its wall (plan-1.6.md F2), in postcards.json in the data folder: the cards as they
 * came, newest first, so no dates. Each is read again as a stranger's file would be, and one that would not open now is let
 * go of; a file that cannot be read at all is an empty wall.
 */
export class PostcardWall {
  private file: string;
  private wall: Postcard[];
  /**
   * Every card ever opened, oldest first, with the day it was first opened (plan-2.0.md J8): the wall lets cards go,
   * the town's record does not. A file from before 2.0 has no such list; the cards on its wall stand in, undated.
   */
  private got: Received[];

  constructor(dir: string) {
    this.file = join(dir, 'postcards.json');
    const { wall, got } = this.read();
    this.wall = wall;
    this.got = got;
  }

  private read(): { wall: Postcard[]; got: Received[] } {
    if (!existsSync(this.file)) return { wall: [], got: [] };
    try {
      const o = JSON.parse(readFileSync(this.file, 'utf8')) as { cards?: unknown; received?: unknown };
      const wall = Array.isArray(o.cards)
        ? o.cards.flatMap((c) => {
            const read = readPostcard(JSON.stringify(c));
            return read.ok ? [read.card] : [];
          })
        : [];
      const got = Array.isArray(o.received)
        ? o.received.filter(isReceived)
        : [...wall].reverse().map((c) => ({ name: c.name, home: c.home, date: null, key: keyOf(c) }));
      return { wall, got };
    } catch {
      return { wall: [], got: [] };
    }
  }

  /** Every card ever opened, oldest first: who sent it, where their shop is, the day it came. */
  received(): { name: string; home: SceneId; date: string | null }[] {
    return this.got.map(({ name, home, date }) => ({ name, home, date }));
  }

  cards(): Postcard[] {
    return [...this.wall];
  }

  /** The card at this place on the wall, or null. */
  card(i: number): Postcard | null {
    return Number.isInteger(i) ? this.wall[i] ?? null : null;
  }

  /** A card opened on `date` (the shop's day): onto the wall, and into the record the first time it is seen. */
  keep(card: Postcard, date: string) {
    this.wall = keepPostcard(this.wall, card);
    const key = keyOf(card);
    if (!this.got.some((g) => g.key === key)) this.got.push({ name: card.name, home: card.home, date, key });
    const out = { version: 1, cards: this.wall.map((c) => JSON.parse(postcardText(c))), received: this.got };
    writeFileSync(`${this.file}.tmp`, `${JSON.stringify(out, null, 1)}\n`);
    renameSync(`${this.file}.tmp`, this.file);
  }
}
