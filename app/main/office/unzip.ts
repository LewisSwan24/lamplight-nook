import { inflateRawSync } from 'node:zlib';

/** At most this many entries, and this much unpacked in total, before a package is read at all (road-to-1.3.md C1). */
export const ZIP_MAX_ENTRIES = 5_000;
export const ZIP_MAX_BYTES = 100 * 1024 * 1024;

export type ZipLimits = { entries: number; bytes: number };

/** Why a package was not read: past the limits (the staff are told the file is too big), or not a zip we can read. */
export class ZipError extends Error {
  constructor(public reason: 'tooBig' | 'unreadable', message: string) {
    super(message);
  }
}

/** A package's entries by name; each is unpacked only when asked for. */
export type ZipEntries = Map<string, () => Buffer>;

/**
 * Reads the central directory of an Office package, and refuses it before unpacking anything when it has too many
 * entries or says it unpacks to too much. What an entry says about its size is not trusted either: inflating stops at the
 * declared size and at what is left of the total, so a zip bomb that lies about its sizes fails instead of filling memory.
 * Stored and deflated entries only, no zip64, no encryption: Office writes nothing else.
 */
export function readZip(buf: Buffer, limits: ZipLimits = { entries: ZIP_MAX_ENTRIES, bytes: ZIP_MAX_BYTES }): ZipEntries {
  const end = findEnd(buf);
  const count = buf.readUInt16LE(end + 10);
  const dirSize = buf.readUInt32LE(end + 12);
  const dirAt = buf.readUInt32LE(end + 16);
  if (count === 0xffff || dirAt === 0xffffffff || dirSize === 0xffffffff) throw new ZipError('unreadable', 'zip64 is not supported');
  if (count > limits.entries) throw new ZipError('tooBig', `the package has ${count} entries, more than ${limits.entries}`);
  if (dirAt + dirSize > buf.length) throw new ZipError('unreadable', 'the central directory is past the end of the file');

  type Entry = { name: string; raw: Buffer; method: number; packed: number; size: number; local: number };
  const entries: Entry[] = [];
  // Part names do not care about case in Office: two entries that differ only in case could make this reader and Office
  // see different files, so the check would look at one and Office open the other.
  const seen = new Set<string>();
  let declared = 0;
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new ZipError('unreadable', 'a central directory entry is damaged');
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const packed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const next = at + 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    const name = buf.toString(flags & 0x0800 ? 'utf8' : 'latin1', at + 46, at + 46 + nameLength);
    if (flags & 1) throw new ZipError('unreadable', `${name} is encrypted`);
    if (method !== 0 && method !== 8) throw new ZipError('unreadable', `${name} uses compression method ${method}`);
    if (packed === 0xffffffff || size === 0xffffffff) throw new ZipError('unreadable', 'zip64 is not supported');
    if (seen.has(name.toLowerCase())) throw new ZipError('unreadable', `${name} is in the package twice`);
    seen.add(name.toLowerCase());
    declared += size;
    if (declared > limits.bytes) throw new ZipError('tooBig', `the package unpacks to more than ${limits.bytes} bytes`);
    entries.push({ name, raw: buf.subarray(at + 46, at + 46 + nameLength), method, packed, size, local: buf.readUInt32LE(at + 42) });
    at = next;
  }

  let left = limits.bytes;
  const out: ZipEntries = new Map();
  for (const e of entries) {
    out.set(e.name, () => {
      const local = e.local;
      if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new ZipError('unreadable', `${e.name} is damaged`);
      const nameAt = local + 30;
      // The entry's own header must name the same file, or a reader going by local headers would see another one.
      if (!buf.subarray(nameAt, nameAt + buf.readUInt16LE(local + 26)).equals(e.raw)) throw new ZipError('unreadable', `${e.name} is named differently in its own header`);
      const start = nameAt + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + e.packed);
      if (data.length < e.packed) throw new ZipError('unreadable', `${e.name} is cut short`);
      let raw: Buffer;
      if (e.method === 0) raw = data;
      else {
        // One past the declared size, so an entry that unpacks to more than it said is caught rather than cut quietly.
        const most = Math.min(e.size + 1, left + 1);
        try {
          raw = inflateRawSync(data, { maxOutputLength: Math.max(most, 1) });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new ZipError('tooBig', `${e.name} unpacks to more than it says`);
          throw new ZipError('unreadable', `${e.name} cannot be unpacked`);
        }
      }
      if (raw.length !== e.size) throw new ZipError(raw.length > e.size ? 'tooBig' : 'unreadable', `${e.name} unpacks to ${raw.length} bytes, not the ${e.size} it says`);
      if (raw.length > left) throw new ZipError('tooBig', `the package unpacks to more than ${limits.bytes} bytes`);
      left -= raw.length;
      return raw;
    });
  }
  return out;
}

/** The end-of-central-directory record, searched for from the end past a comment of up to 64 KB. */
function findEnd(buf: Buffer): number {
  for (let at = buf.length - 22; at >= Math.max(0, buf.length - 22 - 0xffff); at--) {
    if (buf.readUInt32LE(at) === 0x06054b50) return at;
  }
  throw new ZipError('unreadable', 'not a zip file');
}

/** One entry's text, or undefined when the package has no such entry. */
export const entryText = (zip: ZipEntries, name: string): string | undefined => zip.get(name)?.().toString('utf8');
