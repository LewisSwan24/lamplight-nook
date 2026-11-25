import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAT_GAP_MS, Chatter, type ShopMood, type Talk } from '../app/renderer/stage/chatter';
import { chatsForScene, lintChats, parseChats, parseLines } from '../app/renderer/translator/lines';

const allChats = parseChats(readFileSync('lines/chats.yaml', 'utf8'));
// The cafe's chats, as the app has them there (study-only chats drop out).
const chats = chatsForScene(allChats, 'cafe');
const mutters = parseLines(readFileSync('lines/cafe.yaml', 'utf8')).idle_mutter;

/** Seeded random, so runs are repeatable. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

/** Ask every 5 seconds for `minutes`, as the app does; returns what was said and when. */
function run(minutes: number, mood: (t: number) => ShopMood = () => 'idle', seed = 1) {
  const c = new Chatter(chats, mutters, 0, seeded(seed));
  const said: (Talk & { at: number })[] = [];
  for (let t = 0; t <= minutes * 60_000; t += 5000) {
    const talk = c.next(mood(t), t, 'day');
    if (talk) said.push({ ...talk, at: t });
  }
  return said;
}

describe('small talk', () => {
  it('passes the writing rules', () => {
    expect(lintChats(allChats)).toEqual([]);
    expect(chats.filter((c) => c.when === 'idle').length).toBeGreaterThanOrEqual(10);
  });

  it('idles for 10 minutes without repeating or crowding', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const said = run(10, () => 'idle', seed);
      const ids = said.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const chatTimes = said.filter((s) => s.kind === 'chat').map((s) => s.at);
      expect(chatTimes.length).toBeLessThanOrEqual(5);
      expect(chatTimes[0]).toBeGreaterThanOrEqual(CHAT_GAP_MS);
      for (let i = 1; i < chatTimes.length; i++) expect(chatTimes[i] - chatTimes[i - 1]).toBeGreaterThanOrEqual(CHAT_GAP_MS);
      const mutterTimes = said.filter((s) => s.kind === 'mutter').map((s) => s.at);
      for (let i = 1; i < mutterTimes.length; i++) expect(mutterTimes[i] - mutterTimes[i - 1]).toBeGreaterThanOrEqual(180_000);
    }
  });

  it('stays quiet while working or when a card is open', () => {
    expect(run(10, () => 'working')).toEqual([]);
    expect(run(10, () => 'blocked')).toEqual([]);
  });

  it('only uses waiting chats while waiting, and never mutters then', () => {
    const said = run(10, () => 'waiting');
    expect(said.length).toBeGreaterThan(0);
    for (const s of said) {
      expect(s.kind).toBe('chat');
      expect(chats.find((c) => c.id === s.id)?.when).toBe('waiting');
    }
  });

  it('keeps time-of-day chats to their time', () => {
    const c = new Chatter(chats.filter((x) => x.period === 'dusk'), [], 0, seeded(1));
    expect(c.next('idle', CHAT_GAP_MS, 'day')).toBeNull();
    expect(c.next('idle', CHAT_GAP_MS, 'dusk')?.id).toBe('sunset');
  });

  it('keeps weather and holiday chats to their days, and brings them up first', () => {
    const quiet = run(30).map((t) => t.id);
    for (const id of ['rain_umbrella', 'snow_sill', 'halloween_pumpkin']) expect(quiet).not.toContain(id);
    const c = new Chatter(chats, [], 0, seeded(3));
    const rainy = { sky: 'rain' as const, holiday: 'halloween' as const };
    // Every chat for the rain or for Halloween that a new shop can hear in the day, before anything else.
    const special = chats.filter((x) => !x.guest && x.when === 'idle' && (x.sky === 'rain' || x.holiday === 'halloween') && (!x.period || x.period === 'day')
      && x.after === undefined && !x.made && !x.once).map((x) => x.id);
    expect(special).toEqual(expect.arrayContaining(['rain_umbrella', 'rain_fix', 'halloween_pumpkin']));
    const first = special.map((_, i) => c.next('idle', (i + 1) * CHAT_GAP_MS, 'day', rainy)?.id);
    expect(new Set(first)).toEqual(new Set(special));
    // Then the everyday chats carry on as before.
    expect(special).not.toContain(c.next('idle', (special.length + 1) * CHAT_GAP_MS, 'day', rainy)?.id);
  });
});
