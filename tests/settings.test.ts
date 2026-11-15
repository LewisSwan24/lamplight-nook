import { cleanFurnishings } from '../app/shared/furnish';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore, defaultWorkRoot } from '../app/main/settings';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-settings-')), 'settings.json');

describe('settings store', () => {
  it('starts with the default work folder and no name', () => {
    const s = new SettingsStore(fresh(), '/docs').get();
    expect(s).toEqual({ name: '', avatar: 1, workRoot: defaultWorkRoot('/docs'), onboarded: false, muted: false, detailed: false, volume: 70, captions: false, reducedMotion: false, notify: true, closeToTray: false, mini: true, updates: true, scene: 'cafe', furnish: cleanFurnishings(undefined), budgetUsd: 3, monthCapUsd: 20, language: 'system' });
  });

  it('saves and reloads changes', () => {
    const file = fresh();
    new SettingsStore(file, '/docs').update({ name: '  Lin  ', avatar: 5, onboarded: true, workRoot: '/work', muted: true, detailed: true, volume: 40, captions: true, reducedMotion: true, notify: false, closeToTray: true, mini: false, updates: false, scene: 'study', budgetUsd: 5, monthCapUsd: 100, language: 'en' });
    expect(new SettingsStore(file, '/docs').get()).toEqual({ name: 'Lin', avatar: 5, workRoot: '/work', onboarded: true, muted: true, detailed: true, volume: 40, captions: true, reducedMotion: true, notify: false, closeToTray: true, mini: false, updates: false, scene: 'study', furnish: cleanFurnishings(undefined), budgetUsd: 5, monthCapUsd: 100, language: 'en' });
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

  it('only takes a look the shop has, and a broken one in the file means the first look', () => {
    const file = fresh();
    for (const bad of [0, 9, 2.5, '3', null]) expect(new SettingsStore(file, '/docs').update({ avatar: bad } as never).avatar).toBe(1);
    expect(new SettingsStore(file, '/docs').update({ avatar: 8 }).avatar).toBe(8);
    writeFileSync(file, JSON.stringify({ avatar: 'pink' }));
    expect(new SettingsStore(file, '/docs').get().avatar).toBe(1);
  });

  it('only takes a known language, and a broken one in the file means the system language', () => {
    const file = fresh();
    expect(new SettingsStore(file, '/docs').update({ language: 'fr' } as never).language).toBe('system');
    expect(new SettingsStore(file, '/docs').update({ language: 'zh-CN' }).language).toBe('zh-CN');
    writeFileSync(file, JSON.stringify({ language: 42 }));
    expect(new SettingsStore(file, '/docs').get().language).toBe('system');
  });

  it('keeps the volume a whole number from 0 to 100', () => {
    const store = new SettingsStore(fresh(), '/docs');
    expect(store.update({ volume: 140 }).volume).toBe(100);
    expect(store.update({ volume: -3 }).volume).toBe(0);
    expect(store.update({ volume: 33.6 }).volume).toBe(34);
    expect(store.update({ volume: 'loud' } as never).volume).toBe(34);
  });

  it('repairs a bad volume in the file', () => {
    const file = fresh();
    writeFileSync(file, JSON.stringify({ volume: 'max' }));
    expect(new SettingsStore(file, '/docs').get().volume).toBe(70);
  });

  it('falls back to defaults when the file is broken', () => {
    const file = fresh();
    writeFileSync(file, '{not json');
    expect(new SettingsStore(file, '/docs').get().onboarded).toBe(false);
  });
});

describe('furnishing', () => {
  it('keeps each scene\'s own choices and drops unknown ones', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'furnish-')), 'settings.json');
    const store = new SettingsStore(file, '/docs');
    store.update({ furnish: { cafe: { wall: 'sage', curtain: 'nope', rug: 'plum' }, study: { wall: 'rose', curtain: 'blue', rug: 'default' } } as never });
    store.update({ furnish: { cafe: { wall: 'sky', curtain: 'green', rug: 'blue' } } as never });
    expect(new SettingsStore(file, '/docs').get().furnish).toEqual({
      cafe: { wall: 'sky', curtain: 'green', rug: 'blue' },
      study: { wall: 'rose', curtain: 'blue', rug: 'default' },
    });
    expect(cleanFurnishings('junk').cafe).toEqual({ wall: 'default', curtain: 'default', rug: 'default' });
  });
});
