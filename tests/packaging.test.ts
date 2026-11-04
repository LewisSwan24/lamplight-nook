import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findClaude, installCommand, installerProcess } from '../app/main/claude-locator';

const home = join('/home', 'lewis');
const nativeBin = join(home, '.local', 'bin', 'claude');
const lookup = (found: string[], extra: Partial<Parameters<typeof findClaude>[0]> = {}) => ({
  platform: 'linux' as NodeJS.Platform,
  env: { PATH: ['/usr/bin', '/opt/tools'].join(delimiter) },
  home,
  exists: (p: string) => found.includes(p),
  sdkBinary: false,
  ...extra,
});

describe('installed Claude Code', () => {
  it('leaves development checkouts to the SDK binary', () => {
    expect(findClaude(lookup([nativeBin], { sdkBinary: true }))).toBeUndefined();
  });

  it('prefers the native installer location', () => {
    expect(findClaude(lookup([nativeBin, '/usr/bin/claude']))).toBe(nativeBin);
  });

  it('falls back to a claude binary on PATH', () => {
    const onPath = join('/opt/tools', 'claude');
    expect(findClaude(lookup([onPath]))).toBe(onPath);
  });

  it('honors an explicit path even when the SDK binary is present', () => {
    expect(findClaude(lookup(['/custom/claude'], { sdkBinary: true, env: { LAMPLIGHT_CLAUDE_PATH: '/custom/claude' } }))).toBe('/custom/claude');
  });

  it('reports a missing install', () => {
    expect(findClaude(lookup([]))).toBeNull();
  });
});

describe('installing Claude Code', () => {
  it('offers the official one-line installer for the OS', () => {
    expect(installCommand('win32')).toBe('irm https://claude.ai/install.ps1 | iex');
    expect(installCommand('darwin')).toBe('curl -fsSL https://claude.ai/install.sh | bash');
  });

  it('can run that same installer itself, without a window', () => {
    const win = installerProcess('win32');
    expect(win.file).toBe('powershell.exe');
    expect(win.args.at(-1)).toBe(installCommand('win32'));
    expect(win.args).toContain('-NonInteractive');
    expect(installerProcess('darwin')).toEqual({ file: '/bin/bash', args: ['-c', installCommand('darwin')] });
  });

  it('finds a fresh native install without a restart, even before PATH is updated', () => {
    const exe = join('C:\\Users\\lewis', '.local', 'bin', 'claude.exe');
    const fresh = lookup([exe], { platform: 'win32', home: 'C:\\Users\\lewis', env: { Path: 'C:\\Windows' } });
    expect(findClaude(fresh)).toBe(exe);
  });
});

describe('Electron fuses', () => {
  // Turned off so the shipped app cannot be used to run other code: as plain Node (ELECTRON_RUN_AS_NODE),
  // with code injected through NODE_OPTIONS, or under a debugger. Only the app's own app.asar is loaded, and
  // its integrity is checked. GrantFileProtocolExtraPrivileges stays on: the game loads its assets from file://.
  it('are set for the packaged app', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.build.electronFuses).toEqual({
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    });
  });
});
