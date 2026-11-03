import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeVersion, compat, parseVersion, testedVersion } from '../app/main/claude-version';

describe('Claude Code version', () => {
  it('reads the version out of what claude --version prints', () => {
    expect(parseVersion('2.1.306 (Claude Code)\n')).toEqual([2, 1, 306]);
    expect(parseVersion('claude 10.0.1')).toEqual([10, 0, 1]);
    expect(parseVersion('Claude Code')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('calls an earlier minor or major version old, a later major newer, and the rest fine', () => {
    expect(compat('2.1.306', '2.1.306')).toBe('ok');
    expect(compat('2.1.12', '2.1.306')).toBe('ok');
    expect(compat('2.4.0', '2.1.306')).toBe('ok');
    expect(compat('2.0.99', '2.1.306')).toBe('old');
    expect(compat('1.9.0', '2.1.306')).toBe('old');
    expect(compat('3.0.0', '2.1.306')).toBe('newer');
    expect(compat(undefined, '2.1.306')).toBe('unknown');
    expect(compat('2.1.0', undefined)).toBe('unknown');
  });

  it('knows which version the SDK in this build was made for', () => {
    expect(parseVersion(testedVersion())).not.toBeNull();
  });

  it('takes the SDK\'s own copy (development) as the tested version without running anything', async () => {
    let runs = 0;
    const r = await claudeVersion(undefined, async () => { runs++; return ''; });
    expect(r).toEqual({ version: testedVersion(), compat: 'ok', tested: testedVersion() });
    expect(runs).toBe(0);
  });

  it('asks the installed copy once, and again only after the file changes (an update)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lamplight-claude-')), 'claude');
    writeFileSync(file, '');
    utimesSync(file, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));
    let answer = '2.0.14 (Claude Code)';
    let runs = 0;
    const run = async () => { runs++; return answer; };

    expect(await claudeVersion(file, run)).toMatchObject({ version: '2.0.14', compat: 'old' });
    expect(await claudeVersion(file, run)).toMatchObject({ version: '2.0.14' });
    expect(runs).toBe(1);

    answer = `${testedVersion()} (Claude Code)`;
    utimesSync(file, new Date('2026-11-03T00:00:00Z'), new Date('2026-11-03T00:00:00Z'));
    expect(await claudeVersion(file, run)).toMatchObject({ version: testedVersion(), compat: 'ok' });
    expect(runs).toBe(2);
  });

  it('treats a copy that will not say its version as unknown, not as old', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lamplight-claude-')), 'claude');
    writeFileSync(file, '');
    expect(await claudeVersion(file, async () => { throw new Error('ENOENT'); })).toMatchObject({ version: undefined, compat: 'unknown' });
  });
});
