import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findClaude } from '../app/main/claude-locator';

const home = join('/home', 'lewis');
const nativeBin = join(home, '.local', 'bin', 'claude');
const lookup = (found: string[], extra: Partial<Parameters<typeof findClaude>[0]> = {}) => ({
  platform: 'linux' as NodeJS.Platform,
  env: { PATH: ['/usr/bin', '/opt/tools'].join(':') },
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
    expect(findClaude(lookup(['/opt/tools/claude']))).toBe('/opt/tools/claude');
  });

  it('honors an explicit path even when the SDK binary is present', () => {
    expect(findClaude(lookup(['/custom/claude'], { sdkBinary: true, env: { LAMPLIGHT_CLAUDE_PATH: '/custom/claude' } }))).toBe('/custom/claude');
  });

  it('reports a missing install', () => {
    expect(findClaude(lookup([]))).toBeNull();
  });
});
