// Builds the Microsoft Store package (MSIX) from the unpacked Windows app that `npm run dist` leaves in
// dist/win-unpacked. electron-builder only makes MSIX on Windows, so this writes the package itself, the
// way Microsoft's MSIX SDK (makemsix) lays it out: payload files, AppxManifest.xml, AppxBlockMap.xml and
// [Content_Types].xml in a zip64 archive, each file deflated in 64 KB blocks that unpack on their own.
// The package is unsigned: the Store signs what it publishes.
//
// Identity comes from Partner Center (Product identity page) through the environment:
//   MSIX_IDENTITY_NAME, MSIX_PUBLISHER (CN=...), MSIX_PUBLISHER_NAME.
// Without them the package gets a test identity whose publisher Windows accepts unsigned
// (Add-AppxPackage -AllowUnsigned), for trying the package on a Windows 11 machine.
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readdirSync, statSync, writeSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCK = 64 * 1024;

/** The publisher suffix that marks a package Windows may install without a signature. */
export const UNSIGNED_OID = 'OID.2.25.311729368913984317654407730594956997722=1';
export const TEST_IDENTITY = { name: 'LamplightNook.Test', publisher: `CN=Lamplight Nook Test, ${UNSIGNED_OID}`, publisherName: 'Lamplight Nook (test)' };

// Content types and whether to compress, as the MSIX SDK assigns them (anything else: octet-stream, compressed).
const TYPES = {
  dll: ['application/x-msdownload', true], exe: ['application/x-msdownload', true], json: ['application/json', true],
  txt: ['text/plain', true], html: ['text/html', true], htm: ['text/html', true], js: ['application/x-javascript', true],
  css: ['text/css', true], xml: ['text/xml', true], png: ['image/png', false], jpg: ['image/jpeg', false],
  jpeg: ['image/jpeg', false], gif: ['image/gif', false], ico: ['image/vnd.microsoft.icon', true], zip: ['application/x-zip-compressed', false],
  mp3: ['audio/mpeg', false], wav: ['audio/wav', true], svg: ['image/svg+xml', true],
};
const MANIFEST_TYPE = 'application/vnd.ms-appx.manifest+xml';
const BLOCKMAP_TYPE = 'application/vnd.ms-appx.blockmap+xml';

const extension = (name) => {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
};
export const typeOf = (name) => TYPES[extension(name).toLowerCase()] ?? ['application/octet-stream', true];

/** A zip item name the way OPC wants it: forward slashes, reserved and non-ASCII characters percent-encoded. */
export function partName(name) {
  const reserved = ' !#$%&\'()+,;=@[]^`{}';
  let out = '';
  for (const ch of name.replace(/\\/g, '/')) {
    if (reserved.includes(ch)) out += `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
    else if (ch.codePointAt(0) > 0x7e) for (const b of Buffer.from(ch, 'utf8')) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    else out += ch;
  }
  return out;
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Package version: Windows wants four parts, and the Store wants the last one to be 0. */
export const packageVersion = (v) => {
  const parts = v.split(/[.+-]/).slice(0, 3).map((n) => String(parseInt(n, 10) || 0));
  while (parts.length < 3) parts.push('0');
  return `${parts.join('.')}.0`;
};

export function manifest({ identity, version, displayName, description, executable, languages }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${xml(identity.name)}" ProcessorArchitecture="x64" Publisher="${xml(identity.publisher)}" Version="${version}" />
  <Properties>
    <DisplayName>${xml(displayName)}</DisplayName>
    <PublisherDisplayName>${xml(identity.publisherName)}</PublisherDisplayName>
    <Description>${xml(description)}</Description>
    <Logo>assets\\StoreLogo.png</Logo>
  </Properties>
  <Resources>
${languages.map((l) => `    <Resource Language="${l}" />`).join('\n')}
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  <Applications>
    <Application Id="LamplightNook" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="${xml(displayName)}" Description="${xml(description)}" BackgroundColor="transparent"
        Square150x150Logo="assets\\Square150x150Logo.png" Square44x44Logo="assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="assets\\Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
`;
}

/**
 * Deflate a file in 64 KB blocks. Each block starts a fresh compressor and ends on a full flush, so it can be
 * inflated on its own (Windows checks and updates packages block by block); a final empty block ends the stream.
 */
export function compressBlocks(data) {
  const blocks = [];
  const parts = [];
  for (let off = 0; off < data.length; off += BLOCK) {
    const raw = data.subarray(off, off + BLOCK);
    const packed = deflateRawSync(raw, { level: 9, finishFlush: constants.Z_FULL_FLUSH });
    blocks.push({ hash: createHash('sha256').update(raw).digest('base64'), size: packed.length });
    parts.push(packed);
  }
  parts.push(deflateRawSync(Buffer.alloc(0)));
  return { blocks, body: Buffer.concat(parts) };
}

const storedBlocks = (data) => {
  const blocks = [];
  for (let off = 0; off < data.length; off += BLOCK) blocks.push({ hash: createHash('sha256').update(data.subarray(off, off + BLOCK)).digest('base64') });
  return { blocks, body: data };
};

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Writes the archive as the MSIX SDK does: zip64 records, a data descriptor after every file. */
class ZipWriter {
  constructor(file, when = new Date()) {
    this.fd = openSync(file, 'w');
    this.offset = 0;
    this.entries = [];
    this.stamp = dosTime(when);
  }

  write(buf) {
    writeSync(this.fd, buf);
    this.offset += buf.length;
  }

  /** Adds one item and returns the size of its local header (the block map's LfhSize). */
  add(name, data, compress) {
    const { blocks, body } = compress ? compressBlocks(data) : storedBlocks(data);
    const nameBytes = Buffer.from(name, 'utf8');
    const method = compress ? 8 : 0;
    const crc = crc32(data);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(45, 4);
    lfh.writeUInt16LE(0x08, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(this.stamp.time, 10);
    lfh.writeUInt16LE(this.stamp.date, 12);
    lfh.writeUInt16LE(nameBytes.length, 26);
    const at = this.offset;
    this.write(lfh);
    this.write(nameBytes);
    this.write(body);
    const dd = Buffer.alloc(24);
    dd.writeUInt32LE(0x08074b50, 0);
    dd.writeUInt32LE(crc, 4);
    dd.writeBigUInt64LE(BigInt(body.length), 8);
    dd.writeBigUInt64LE(BigInt(data.length), 16);
    this.write(dd);
    this.entries.push({ nameBytes, method, crc, csize: body.length, usize: data.length, at });
    return { lfhSize: 30 + nameBytes.length, blocks };
  }

  close() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const big = e.csize >= 0xffffffff || e.usize >= 0xffffffff || e.at >= 0xffffffff;
      const extra = big ? Buffer.alloc(28) : Buffer.alloc(0);
      if (big) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(24, 2);
        extra.writeBigUInt64LE(BigInt(e.usize), 4);
        extra.writeBigUInt64LE(BigInt(e.csize), 12);
        extra.writeBigUInt64LE(BigInt(e.at), 20);
      }
      const cdh = Buffer.alloc(46);
      cdh.writeUInt32LE(0x02014b50, 0);
      cdh.writeUInt16LE(45, 4);
      cdh.writeUInt16LE(45, 6);
      cdh.writeUInt16LE(0x08, 8);
      cdh.writeUInt16LE(e.method, 10);
      cdh.writeUInt16LE(this.stamp.time, 12);
      cdh.writeUInt16LE(this.stamp.date, 14);
      cdh.writeUInt32LE(e.crc, 16);
      cdh.writeUInt32LE(big ? 0xffffffff : e.csize, 20);
      cdh.writeUInt32LE(big ? 0xffffffff : e.usize, 24);
      cdh.writeUInt16LE(e.nameBytes.length, 28);
      cdh.writeUInt16LE(extra.length, 30);
      cdh.writeUInt32LE(big ? 0xffffffff : e.at, 42);
      this.write(cdh);
      this.write(e.nameBytes);
      this.write(extra);
    }
    const cdSize = this.offset - cdStart;
    const eocd64At = this.offset;
    const eocd64 = Buffer.alloc(56);
    eocd64.writeUInt32LE(0x06064b50, 0);
    eocd64.writeBigUInt64LE(44n, 4);
    eocd64.writeUInt16LE(45, 12);
    eocd64.writeUInt16LE(45, 14);
    eocd64.writeBigUInt64LE(BigInt(this.entries.length), 24);
    eocd64.writeBigUInt64LE(BigInt(this.entries.length), 32);
    eocd64.writeBigUInt64LE(BigInt(cdSize), 40);
    eocd64.writeBigUInt64LE(BigInt(cdStart), 48);
    this.write(eocd64);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(eocd64At), 8);
    locator.writeUInt32LE(1, 16);
    this.write(locator);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0xffff, 8);
    eocd.writeUInt16LE(0xffff, 10);
    eocd.writeUInt32LE(0xffffffff, 12);
    eocd.writeUInt32LE(0xffffffff, 16);
    this.write(eocd);
    closeSync(this.fd);
  }
}

/** Every file under a folder, as package paths with forward slashes, in a stable order. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.isFile()) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

/**
 * Packs `files` (package path -> absolute source path) plus the manifest into `out`.
 * Returns the block map and content types written, for checking.
 */
export function pack(files, manifestXml, out, when) {
  const zip = new ZipWriter(out, when);
  const fileEntries = [];
  const defaults = new Map();
  const overrides = [];
  const addType = (name, type) => {
    const ext = extension(name).toLowerCase();
    if (!ext) overrides.push([`/${partName(name)}`, type]);
    else if (!defaults.has(ext)) defaults.set(ext, [extension(name), type]);
    else if (defaults.get(ext)[1] !== type) overrides.push([`/${partName(name)}`, type]);
  };
  const addFile = (name, data, type, compress) => {
    const { lfhSize, blocks } = zip.add(partName(name), data, compress);
    addType(name, type);
    fileEntries.push({ name: name.replace(/\//g, '\\'), size: data.length, lfhSize, blocks, compress });
  };
  for (const [name, src] of Object.entries(files)) {
    const [type, compress] = typeOf(name);
    addFile(name, readFileSync(src), type, compress);
  }
  addFile('AppxManifest.xml', Buffer.from(manifestXml, 'utf8'), MANIFEST_TYPE, true);

  const blockMap = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">',
    ...fileEntries.map((f) => {
      const head = `<File Name="${xml(f.name)}" Size="${f.size}" LfhSize="${f.lfhSize}"`;
      if (!f.blocks.length) return `${head}/>`;
      const blocks = f.blocks.map((b) => (f.compress ? `<Block Hash="${b.hash}" Size="${b.size}"/>` : `<Block Hash="${b.hash}"/>`));
      return `${head}>${blocks.join('')}</File>`;
    }),
    '</BlockMap>',
  ].join('');
  zip.add('AppxBlockMap.xml', Buffer.from(blockMap, 'utf8'), true);
  addType('AppxBlockMap.xml', BLOCKMAP_TYPE);

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    ...[...defaults.values()].map(([ext, type]) => `<Default ContentType="${type}" Extension="${xml(ext)}"/>`),
    ...overrides.map(([part, type]) => `<Override ContentType="${type}" PartName="${xml(part)}"/>`),
    '</Types>',
  ].join('');
  zip.add('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'), true);
  zip.close();
  return { blockMap, contentTypes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(ROOT, 'locales', 'en.json'), 'utf8'));
  const appDir = join(ROOT, 'dist', 'win-unpacked');
  const productName = pkg.build.productName;
  if (!statSync(join(appDir, `${productName}.exe`), { throwIfNoEntry: false })) {
    console.error(`No ${productName}.exe in dist/win-unpacked: run npm run dist first.`);
    process.exit(1);
  }
  const env = process.env;
  const identity = env.MSIX_IDENTITY_NAME
    ? { name: env.MSIX_IDENTITY_NAME, publisher: env.MSIX_PUBLISHER ?? '', publisherName: env.MSIX_PUBLISHER_NAME ?? '' }
    : TEST_IDENTITY;
  if (!identity.publisher.startsWith('CN=') || !identity.publisherName) {
    console.error('Set MSIX_PUBLISHER (CN=...) and MSIX_PUBLISHER_NAME along with MSIX_IDENTITY_NAME, as Partner Center shows them.');
    process.exit(1);
  }
  const files = {};
  for (const f of listFiles(appDir)) if (f !== 'resources/elevate.exe') files[`app/${f}`] = join(appDir, f);
  for (const f of listFiles(join(ROOT, 'assets', 'store'))) files[`assets/${f}`] = join(ROOT, 'assets', 'store', f);
  const version = packageVersion(pkg.version);
  const xmlText = manifest({ identity, version, displayName: productName, description: en.app.tagline, executable: `app\\${productName}.exe`, languages: ['en-US', 'zh-CN'] });
  const test = identity === TEST_IDENTITY ? '-test' : '';
  const out = join(ROOT, 'dist', `Lamplight-Nook-${pkg.version}${test}.msix`);
  pack(files, xmlText, out);
  console.log(`MSIX ${version} (${identity.name}) -> ${out}`);
}
