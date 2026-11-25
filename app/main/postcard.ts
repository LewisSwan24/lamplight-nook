import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSTCARD_MAX_BYTES, keepPostcard, postcardText, readPostcard } from '../shared/postcard';
import type { Postcard } from '../shared/postcard';

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

  constructor(dir: string) {
    this.file = join(dir, 'postcards.json');
    this.wall = this.read();
  }

  private read(): Postcard[] {
    if (!existsSync(this.file)) return [];
    try {
      const o = JSON.parse(readFileSync(this.file, 'utf8')) as { cards?: unknown };
      if (!Array.isArray(o.cards)) return [];
      return o.cards.flatMap((c) => {
        const read = readPostcard(JSON.stringify(c));
        return read.ok ? [read.card] : [];
      });
    } catch {
      return [];
    }
  }

  cards(): Postcard[] {
    return [...this.wall];
  }

  /** The card at this place on the wall, or null. */
  card(i: number): Postcard | null {
    return Number.isInteger(i) ? this.wall[i] ?? null : null;
  }

  keep(card: Postcard) {
    this.wall = keepPostcard(this.wall, card);
    const out = { version: 1, cards: this.wall.map((c) => JSON.parse(postcardText(c))) };
    writeFileSync(`${this.file}.tmp`, `${JSON.stringify(out, null, 1)}\n`);
    renameSync(`${this.file}.tmp`, this.file);
  }
}
