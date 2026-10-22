import { describe, expect, it } from 'vitest';
import { type MixState, musicVolume, sfxVolume } from '../app/renderer/audio/mix';

const base: MixState = { volume: 100, muted: false, serious: false, period: 'day' };

describe('sound mix', () => {
  it('mutes everything when muted', () => {
    const s = { ...base, muted: true };
    expect(musicVolume(s)).toBe(0);
    expect(sfxVolume('click', s, 0)).toBe(0);
    expect(sfxVolume('serious', s, 0)).toBe(0);
  });

  it('stops the music in serious mode and plays only the alert', () => {
    const s = { ...base, serious: true };
    expect(musicVolume(s)).toBe(0);
    expect(sfxVolume('serious', s, 0)).toBeGreaterThan(0);
    for (const name of ['click', 'open', 'ask', 'door', 'success'] as const) expect(sfxVolume(name, s, 0)).toBe(0);
  });

  it('plays music quieter at night than by day, and under the effects', () => {
    expect(musicVolume({ ...base, period: 'night' })).toBeLessThan(musicVolume(base));
    expect(musicVolume(base)).toBeLessThan(sfxVolume('click', base, 0));
  });

  it('follows the volume setting', () => {
    expect(sfxVolume('click', { ...base, volume: 50 }, 0)).toBeCloseTo(sfxVolume('click', base, 0) / 2);
    expect(musicVolume({ ...base, volume: 0 })).toBe(0);
  });

  it('does not stack shop sounds, but UI sounds always play', () => {
    expect(sfxVolume('mallet', base, 1000, 0)).toBe(0);
    expect(sfxVolume('mallet', base, 7000, 0)).toBeGreaterThan(0);
    expect(sfxVolume('click', base, 10, 0)).toBeGreaterThan(0);
  });
});
