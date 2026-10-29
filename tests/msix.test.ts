import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript build script without type declarations
import { TEST_IDENTITY, UNSIGNED_OID, listFiles, manifest, pack, packageVersion, partName } from '../scripts/msix.mjs';

type Entry = { name: string; method: number; flags: number; crc: number; csize: number; usize: number; at: number };

/** A small zip reader that follows the zip64 end record, as Windows does for packages. */
function readZip(buf: Buffer) {
  const eocd = buf.length - 22;
  expect(buf.readUInt32LE(eocd)).toBe(0x06054b50);
  expect(buf.readUInt32LE(eocd - 20)).toBe(0x07064b50);
  const z64 = Number(buf.readBigUInt64LE(eocd - 20 + 8));
  expect(buf.readUInt32LE(z64)).toBe(0x06064b50);
  const count = Number(buf.readBigUInt64LE(z64 + 32));
  let p = Number(buf.readBigUInt64LE(z64 + 48));
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    entries.push({
      flags: buf.readUInt16LE(p + 8), method: buf.readUInt16LE(p + 10), crc: buf.readUInt32LE(p + 16),
      csize: buf.readUInt32LE(p + 20), usize: buf.readUInt32LE(p + 24), at: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    });
    p += 46 + nameLen + extraLen;
  }
  const data = (e: Entry) => buf.subarray(e.at + 30 + buf.readUInt16LE(e.at + 26), e.at + 30 + buf.readUInt16LE(e.at + 26) + e.csize);
  return { entries, data };
}

describe('the Store package', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msix-'));
  const src = join(dir, 'src');
  mkdirSync(join(src, 'locales'), { recursive: true });
  const big = Buffer.alloc(200_000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 7919) % 251;
  writeFileSync(join(src, 'Lamplight Nook.exe'), big);
  writeFileSync(join(src, 'locales', 'en-US.pak'), 'hello '.repeat(5000));
  writeFileSync(join(src, 'icon.png'), Buffer.from('not really a png'));
  writeFileSync(join(src, 'empty.txt'), '');
  writeFileSync(join(src, 'LICENSE'), 'MIT');
  const files = Object.fromEntries(listFiles(src).map((f: string) => [`app/${f}`, join(src, f)]));
  const xmlText = manifest({ identity: TEST_IDENTITY, version: '0.5.0.0', displayName: 'Lamplight Nook', description: 'A & B', executable: 'app\\Lamplight Nook.exe', languages: ['en-US', 'zh-CN'] });
  const out = join(dir, 'test.msix');
  const { blockMap, contentTypes } = pack(files, xmlText, out, new Date(2026, 9, 29, 12, 0, 0));
  const buf = readFileSync(out);
  const { entries, data } = readZip(buf);

  it('puts the payload first and the manifest, block map and content types last', () => {
    expect(entries.map((e) => e.name)).toEqual([
      'app/LICENSE', 'app/Lamplight%20Nook.exe', 'app/empty.txt', 'app/icon.png', 'app/locales/en-US.pak',
      'AppxManifest.xml', 'AppxBlockMap.xml', '[Content_Types].xml',
    ]);
    for (const e of entries) expect(e.flags).toBe(0x08);
  });

  it('every block in the block map matches the file and inflates on its own', () => {
    const fileRe = /<File Name="([^"]+)" Size="(\d+)" LfhSize="(\d+)"(?:\/>|>(.*?)<\/File>)/g;
    const mapped = [...blockMap.matchAll(fileRe)];
    expect(mapped.map((m) => m[1])).toEqual(['app\\LICENSE', 'app\\Lamplight Nook.exe', 'app\\empty.txt', 'app\\icon.png', 'app\\locales\\en-US.pak', 'AppxManifest.xml']);
    for (const m of mapped) {
      const entry = entries.find((e) => e.name === partName(m[1]))!;
      expect(Number(m[3]), m[1]).toBe(30 + Buffer.byteLength(entry.name));
      const original = m[1] === 'AppxManifest.xml' ? Buffer.from(xmlText) : readFileSync(join(src, m[1].replace(/^app\\/, '').replace(/\\/g, '/')));
      expect(Number(m[2])).toBe(original.length);
      const blocks = [...(m[4] ?? '').matchAll(/<Block Hash="([^"]+)"(?: Size="(\d+)")?\/>/g)];
      expect(blocks.length).toBe(Math.ceil(original.length / 65536));
      const body = data(entry);
      let at = 0;
      blocks.forEach((b, i) => {
        const raw = original.subarray(i * 65536, (i + 1) * 65536);
        expect(b[1]).toBe(createHash('sha256').update(raw).digest('base64'));
        if (entry.method === 8) {
          const size = Number(b[2]);
          expect(inflateRawSync(body.subarray(at, at + size), { finishFlush: 2 }).equals(raw)).toBe(true);
          at += size;
        } else expect(b[2]).toBeUndefined();
      });
      const whole = entry.method === 8 ? inflateRawSync(body) : body;
      expect(whole.equals(original), m[1]).toBe(true);
    }
  });

  it('stores pictures, deflates the rest, and names content types per extension', () => {
    expect(entries.find((e) => e.name === 'app/icon.png')!.method).toBe(0);
    expect(entries.find((e) => e.name === 'app/Lamplight%20Nook.exe')!.method).toBe(8);
    expect(contentTypes).toContain('<Default ContentType="application/x-msdownload" Extension="exe"/>');
    expect(contentTypes).toContain('<Override ContentType="application/octet-stream" PartName="/app/LICENSE"/>');
    expect(contentTypes).toContain('<Default ContentType="application/vnd.ms-appx.manifest+xml" Extension="xml"/>');
    expect(contentTypes).toContain('<Override ContentType="application/vnd.ms-appx.blockmap+xml" PartName="/AppxBlockMap.xml"/>');
  });

  it('writes a manifest for a full-trust desktop app, escaped', () => {
    expect(xmlText).toContain('EntryPoint="Windows.FullTrustApplication"');
    expect(xmlText).toContain('<rescap:Capability Name="runFullTrust" />');
    expect(xmlText).toContain(`Publisher="CN=Lamplight Nook Test, ${UNSIGNED_OID}"`);
    expect(xmlText).toContain('Description="A &amp; B"');
    expect(xmlText).toContain('Executable="app\\Lamplight Nook.exe"');
  });

  it('encodes names and versions the way Windows expects', () => {
    expect(partName('app\\a b\\c(1)#.txt')).toBe('app/a%20b/c%281%29%23.txt');
    expect(partName('app/小.txt')).toBe('app/%E5%B0%8F.txt');
    expect(packageVersion('0.5.0')).toBe('0.5.0.0');
    expect(packageVersion('1.2')).toBe('1.2.0.0');
    expect(packageVersion('1.2.3-beta.1')).toBe('1.2.3.0');
  });
});
