import { cleanFurnishings } from '../app/shared/furnish';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { diagnosticsEntries } from '../app/main/diagnostics';
import { Log } from '../app/main/log';
import { zip } from '../app/main/zip';

const KEY = 'sk-ant-api03-' + 'q'.repeat(40);
const dir = () => mkdtempSync(join(tmpdir(), 'diag-'));

describe('the log', () => {
  it('writes one line per event and masks keys', () => {
    const d = dir();
    const log = new Log(d, () => new Date('2026-10-29T08:00:00Z'));
    log.info('run end', { ok: false, detail: `401 for ${KEY}` });
    log.error('boom', new Error('broken\nsecond line'));
    const text = readFileSync(join(d, 'main-2026-10-29.log'), 'utf8');
    expect(text).toContain('INFO run end');
    expect(text).toContain('ERROR boom Error: broken');
    expect(text).not.toContain(KEY);
  });

  it('keeps a week', () => {
    const d = dir();
    for (const day of ['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-29']) writeFileSync(join(d, `main-${day}.log`), 'x\n');
    new Log(d, () => new Date('2026-10-29T08:00:00Z')).prune();
    expect(new Log(d).files()).toEqual(['main-2026-10-23.log', 'main-2026-10-29.log']);
  });
});

describe('the diagnostics bundle', () => {
  const build = () => {
    const root = dir();
    const home = join(root, 'Users', 'lewis');
    const logDir = join(root, 'logs');
    const crashDir = join(root, 'Crashpad');
    mkdirSync(join(crashDir, 'completed'), { recursive: true });
    writeFileSync(join(crashDir, 'completed', 'a.dmp'), 'MEMORY ' + KEY);
    const log = new Log(logDir);
    log.error('failed to open', `${home}/Documents/x with ${KEY}`);
    return diagnosticsEntries({
      app: { version: '0.5.0', packaged: true, electron: '38', chrome: '140', node: '22', locale: 'zh-CN' },
      os: { platform: 'win32', release: '10.0.26100', arch: 'x64' },
      hasClaude: true,
      keySource: 'stored',
      settings: { name: 'Lewis', avatar: 1, workRoot: `${home}/Documents/x`, onboarded: true, muted: false, detailed: false, volume: 70, captions: false, reducedMotion: false, notify: true, closeToTray: false, mini: true, updates: true, scene: 'cafe', furnish: cleanFurnishings(undefined), budgetUsd: 3, monthCapUsd: 20, language: 'system' },
      defaultWorkRoot: `${home}/Documents/default`,
      logDir,
      crashDir,
      home,
    });
  };

  it('holds logs and a summary, never the key, the name, the home folder or crash memory', () => {
    const entries = build();
    expect(entries.map((e) => e.name)).toEqual(['README.txt', 'system.json', expect.stringMatching(/^logs\/main-.*\.log$/)]);
    const all = entries.map((e) => String(e.data)).join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('Lewis');
    expect(all).not.toContain('/Users/lewis');
    expect(all).not.toContain('MEMORY');
    const system = JSON.parse(String(entries[1].data));
    expect(system.apiKey).toBe('stored');
    expect(system.settings.workRoot).toBe('(custom)');
    expect(system.crashDumps).toEqual([{ name: 'completed/a.dmp', bytes: expect.any(Number) }]);
  });

  it('is a zip whose entries read back intact', () => {
    const entries = build();
    const buf = zip(entries);
    // Walk the central directory the way an unzip tool does.
    const end = buf.length - 22;
    expect(buf.readUInt32LE(end)).toBe(0x06054b50);
    let at = buf.readUInt32LE(end + 16);
    const names: string[] = [];
    for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
      expect(buf.readUInt32LE(at)).toBe(0x02014b50);
      const size = buf.readUInt32LE(at + 20);
      const nameLen = buf.readUInt16LE(at + 28);
      const local = buf.readUInt32LE(at + 42);
      const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
      const start = local + 30 + buf.readUInt16LE(local + 26);
      const data = inflateRawSync(buf.subarray(start, start + size));
      expect(crc32(data)).toBe(buf.readUInt32LE(at + 16));
      expect(data.toString('utf8')).toBe(String(entries[i].data));
      names.push(name);
      at += 46 + nameLen;
    }
    expect(names).toEqual(entries.map((e) => e.name));
  });
});
