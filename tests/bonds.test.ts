import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { BOND_AT, HOME_PAIRS, bondOf, bonds, pairOf, type Staffer } from '../app/shared/crew';
import { LOCALES } from '../app/shared/i18n';
import { Chatter, CHAT_GAP_MS } from '../app/renderer/stage/chatter';
import { bondPair, lintChats, parseChats, type Chat } from '../app/renderer/translator/lines';
import type { CommissionMemo } from '../app/shared/types';

// Friendships at home (plan-1.9.md I4): each two of the five go from strangers to friends with the works they were on
// together, and some chats wait until they are close enough.

describe('how close each two are', () => {
  it('goes in three steps, at 8 and 25 works together', () => {
    expect(BOND_AT).toEqual([8, 25]);
    expect([0, 7, 8, 24, 25, 100].map(bondOf)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('is given for all ten pairs', () => {
    const memos: CommissionMemo[] = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, title: 't', date: '2026-11-27', result: 'done', choices: {}, folder: '',
      rounds: [{ date: '2026-11-27', seconds: 1, helpers: { reviewer: 1 }, waits: 0, waitedSeconds: 0 }] }));
    const b = bonds(memos);
    expect(Object.keys(b).sort()).toEqual([...HOME_PAIRS].sort());
    expect(b[pairOf('adeng', 'laoshi')]).toBe(2);
    expect(b[pairOf('adeng', 'xiaoju')]).toBe(1);
  });

  it('reaches the page with the shop’s state', () => {
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-bonds-')), 'memory.json'));
    expect(store.shopState().bonds[pairOf('adeng', 'qingdai')]).toBe(1);
  });
});

const bondChat = (id: string, a: Staffer, b: Staffer, bond: 2 | 3): Chat =>
  ({ id, when: 'idle', bond, turns: [{ speaker: a, text: '一' }, { speaker: b, text: '二' }] });

describe('a chat between friends', () => {
  it('belongs to the two who speak in it', () => {
    expect(bondPair(bondChat('x', 'laoshi', 'adeng', 2))).toBe(pairOf('adeng', 'laoshi'));
  });

  it('is read from the lines file', () => {
    const [chat] = parseChats('- id: x\n  when: idle\n  bond: 3\n  turns:\n    - adeng: 一\n    - laoshi: 二\n    - adeng: 三\n');
    expect(chat.bond).toBe(3);
  });

  it('must be between exactly two of the five at home', () => {
    const three: Chat = { ...bondChat('three', 'adeng', 'laoshi', 2), turns: [{ speaker: 'adeng', text: '一' }, { speaker: 'laoshi', text: '二' }, { speaker: 'xiaoju', text: '三' }] };
    const shop = bondChat('shop', 'adeng', 'aqian', 2);
    const odd = { ...bondChat('odd', 'adeng', 'laoshi', 2), bond: 4 } as unknown as Chat;
    expect(lintChats([bondChat('ok', 'adeng', 'laoshi', 2), three, shop, odd], LOCALES['zh-CN'])).toHaveLength(3);
  });

  it('only comes up once the two are close enough, and before the everyday chats when it is new', () => {
    const everyday: Chat = { id: 'plain', when: 'idle', turns: [{ speaker: 'adeng', text: '一' }, { speaker: 'xiaoju', text: '二' }] };
    const close = bondChat('close', 'adeng', 'laoshi', 2);
    const friends = bondChat('friends', 'adeng', 'laoshi', 3);
    const shop = (tier: 1 | 2 | 3) => ({ done: 50, told: new Set<string>(), made: {}, bonds: { [pairOf('adeng', 'laoshi')]: tier } });
    const said = (tier: 1 | 2 | 3) => {
      const c = new Chatter([everyday, close, friends], [], 0, () => 0);
      return [1, 2, 3].map((k) => c.next('idle', k * CHAT_GAP_MS, 'day', undefined, shop(tier))?.id);
    };
    expect(said(1)).toEqual(['plain', 'plain', 'plain']);
    expect(said(2)[0]).toBe('close');
    expect(said(2)).not.toContain('friends');
    expect(said(3).slice(0, 2).sort()).toEqual(['close', 'friends']);
  });
});

describe('the friends’ chats themselves', () => {
  for (const [file, S] of [['lines/chats.yaml', LOCALES['zh-CN']], ['lines/en/chats.yaml', LOCALES.en]] as const) {
    it(`${file}: two close chats and two friends’ chats for each of the ten pairs`, () => {
      const chats = parseChats(readFileSync(file, 'utf8')).filter((c) => c.bond);
      for (const pair of HOME_PAIRS) {
        for (const tier of [2, 3]) expect(chats.filter((c) => bondPair(c) === pair && c.bond === tier).length, `${file} ${pair} ${tier}`).toBe(2);
      }
      expect(lintChats(chats, S)).toEqual([]);
    });
  }

  it('has the same chats in both languages', () => {
    const ids = (f: string) => parseChats(readFileSync(f, 'utf8')).filter((c) => c.bond).map((c) => `${c.id}:${c.bond}:${bondPair(c)}`).sort();
    expect(ids('lines/en/chats.yaml')).toEqual(ids('lines/chats.yaml'));
  });
});
