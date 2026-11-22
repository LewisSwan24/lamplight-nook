import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { POSTCARD_MAX_BYTES, readPostcard } from '../shared/postcard';
import type { Postcard } from '../shared/postcard';

export type PostcardOpen = { ok: true; card: Postcard } | { ok: false; reason: 'big' | 'notPostcard' | 'broken' };

/**
 * A postcard file someone sent (docs/plan-1.5.md E3). Its size is looked at before anything is read, and no more than
 * that is read even if the file grows meanwhile. Nothing is ever written, there or anywhere.
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
