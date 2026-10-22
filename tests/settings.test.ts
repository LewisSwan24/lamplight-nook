import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore, defaultWorkRoot } from '../app/main/settings';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-settings-')), 'settings.json');

describe('settings store', () => {
  it('starts with the default work folder and no name', () => {
    const s = new SettingsStore(fresh(), '/docs').get();
    expect(s).toEqual({ name: '', workRoot: defaultWorkRoot('/docs'), onboarded: false, muted: false, detailed: false });
  });

  it('saves and reloads changes', () => {
    const file = fresh();
    new SettingsStore(file, '/docs').update({ name: '  Lin  ', onboarded: true, workRoot: '/work', muted: true, detailed: true });
    expect(new SettingsStore(file, '/docs').get()).toEqual({ name: 'Lin', workRoot: '/work', onboarded: true, muted: true, detailed: true });
  });

  it('ignores empty folders and unknown fields', () => {
    const file = fresh();
    const s = new SettingsStore(file, '/docs').update({ workRoot: '  ', evil: 1 } as never);
    expect(s.workRoot).toBe(defaultWorkRoot('/docs'));
    expect(JSON.parse(readFileSync(file, 'utf8'))).not.toHaveProperty('evil');
  });

  it('only takes true or false for switches', () => {
    const s = new SettingsStore(fresh(), '/docs').update({ muted: 'yes', detailed: 1 } as never);
    expect(s.muted).toBe(false);
    expect(s.detailed).toBe(false);
  });

  it('falls back to defaults when the file is broken', () => {
    const file = fresh();
    writeFileSync(file, '{not json');
    expect(new SettingsStore(file, '/docs').get().onboarded).toBe(false);
  });
});
