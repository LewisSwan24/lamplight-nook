import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript build script without type declarations
import { collect, importedPackages, render, unapproved } from '../scripts/notices.mjs';

type Pkg = { name: string; version: string; license: string; texts: string[] };

describe('third-party notices', () => {
  const imported: string[] = importedPackages('app');
  const packages: Pkg[] = collect(imported);

  it('finds what the app imports, without Node built-ins', () => {
    expect(imported).toEqual(expect.arrayContaining(['@anthropic-ai/claude-agent-sdk', 'electron', 'phaser', 'yaml']));
    expect(imported.some((n) => n.startsWith('node:'))).toBe(false);
  });

  it('follows run-time dependencies and leaves Electron to its own license files', () => {
    const names = packages.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['phaser', 'eventemitter3', 'yaml', '@anthropic-ai/claude-agent-sdk']));
    expect(names).not.toContain('electron');
    expect(names.some((n) => n.startsWith('@anthropic-ai/claude-agent-sdk-'))).toBe(false);
  });

  it('every shipped package has an approved license and its text', () => {
    expect(unapproved(packages)).toEqual([]);
    for (const p of packages) expect(p.texts.length, p.name).toBeGreaterThan(0);
  });

  it('a copyleft package is stopped for review', () => {
    const modules = mkdtempSync(join(tmpdir(), 'notices-'));
    mkdirSync(join(modules, 'strict'));
    writeFileSync(join(modules, 'strict', 'package.json'), JSON.stringify({ name: 'strict', version: '1.0.0', license: 'GPL-3.0' }));
    expect(unapproved(collect(['strict'], modules))).toEqual(['strict@1.0.0 (GPL-3.0)']);
  });

  it('credits the art, sound and font, and carries the font license in full', () => {
    const ofl = readFileSync('assets/fonts/hand-OFL.txt', 'utf8');
    const text: string = render(packages, ofl);
    for (const credit of ['LimeZu', 'Cyberleaf Studio', 'LXGW WenKai', 'phaser 3.90', 'LICENSES.chromium.html']) expect(text).toContain(credit);
    expect(text).toContain(ofl.trim());
  });
});
