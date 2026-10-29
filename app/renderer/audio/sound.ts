import type { Period } from '../game/daytime';
import { type MixState, SFX, type Sfx, musicVolume, sfxVolume } from './mix';

const effectUrls = import.meta.glob<string>('../../../assets/audio/*.ogg', { eager: true, query: '?url', import: 'default' });
/** Background music tracks, played in name order (credits in assets/audio/music/CREDITS.md). */
const musicUrls = Object.values(import.meta.glob<string>('../../../assets/audio/music/*.{ogg,mp3}', { eager: true, query: '?url', import: 'default' }));

/** Some sounds are a few hits in a row (seconds after the first). */
const HITS: Partial<Record<Sfx, number[]>> = { mallet: [0, 0.28, 0.52] };
/** A button click is dropped when the click also opened or closed a card, which has its own sound. */
const CLICK_DELAY_MS = 30;
const MUSIC_FADE_MS = 1500;

const ctx = new AudioContext();
const buffers = new Map<Sfx, AudioBuffer>();
const lastAt = new Map<Sfx, number>();
const state: MixState = { volume: 70, muted: false, serious: false, period: 'day' };
let lastCardSoundAt = -Infinity;

for (const name of SFX) {
  const url = Object.entries(effectUrls).find(([path]) => path.endsWith(`/${name}.ogg`))?.[1];
  if (url) void fetch(url).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data)).then((b) => buffers.set(name, b)).catch(() => {});
}

/** Play an effect; quietly does nothing if muted, not loaded yet, or skipped by the mix rules. */
export function sfx(name: Sfx) {
  const now = performance.now();
  if (name === 'open' || name === 'close' || name === 'ask' || name === 'serious') lastCardSoundAt = now;
  const volume = sfxVolume(name, state, now, lastAt.get(name));
  const buffer = buffers.get(name);
  if (!volume || !buffer) return;
  lastAt.set(name, now);
  if (ctx.state === 'suspended') void ctx.resume();
  for (const offset of HITS[name] ?? [0]) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + offset);
  }
}

/** Change what the mix depends on; the music fades to its new level. */
export function setMix(patch: Partial<MixState>) {
  Object.assign(state, patch);
  music.fadeTo(musicVolume(state));
}

export const setSerious = (serious: boolean) => setMix({ serious });
export const setPeriod = (period: Period) => { if (period !== state.period) setMix({ period }); };

/** Every button in the app clicks softly. */
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest?.('button')) return;
  const at = performance.now();
  setTimeout(() => { if (lastCardSoundAt < at) sfx('click'); }, CLICK_DELAY_MS);
}, true);

/** The music player: one track after another, fading rather than jumping. */
const music = (() => {
  const audio = new Audio();
  let index = 0;
  let target = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  audio.volume = 0;
  audio.addEventListener('ended', () => { index = (index + 1) % musicUrls.length; audio.src = musicUrls[index]; void audio.play().catch(() => {}); });
  const fadeTo = (volume: number) => {
    target = volume;
    if (!musicUrls.length) return;
    if (!audio.src) audio.src = musicUrls[0];
    if (target > 0 && audio.paused) void audio.play().catch(() => {});
    clearInterval(timer);
    const from = audio.volume;
    const start = performance.now();
    timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / MUSIC_FADE_MS);
      audio.volume = from + (target - from) * k;
      if (k < 1) return;
      clearInterval(timer);
      if (target === 0) audio.pause();
    }, 50);
  };
  return { fadeTo };
})();
