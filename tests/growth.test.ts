import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { GROWTH, grownBy, workIcon } from '../app/shared/growth';
import { Chatter, CHAT_GAP_MS } from '../app/renderer/stage/chatter';
import { chatsForScene, parseChats, parseLines, pickLine } from '../app/renderer/translator/lines';

const fresh = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-growth-')), 'memory.json'));
const memo = (title: string, extra = {}) => ({ title, result: 'done' as const, choices: {}, folder: `/w/${title}`, ...extra });

describe('the shop grows with the commissions done together', () => {
  it('gathers each piece once, at its count, and keeps it', () => {
    const store = fresh();
    const got: string[][] = [];
    for (let i = 0; i < 5; i++) got.push(store.finished(new Date('2026-11-01T10:00:00Z')));
    expect(got).toEqual([['painting'], ['plant'], ['lights'], [], ['fruit']]);
    const state = store.shopState();
    expect(state.done).toBe(5);
    expect(state.grown).toEqual(['painting', 'plant', 'lights', 'fruit'].map((id) => ({ id, date: '2026-11-01' })));
    expect(grownBy(20)).toEqual(GROWTH.map((g) => g.id));
  });

  it('puts finished works on the shelf, latest first, with their icons and rounds', () => {
    const store = fresh();
    const a = store.remember(memo('page', { form: { want: 'x', template: 'page' }, main: 'index.html' }), []);
    store.remember(memo('notes', { form: { want: 'y', template: 'research' } }), []);
    store.remember({ ...memo('broken'), result: 'failed' }, []);
    store.revise(a.id, 'lighter', { result: 'done', choices: {} }, []);
    expect(store.shopState().works.map((w) => [w.title, w.icon, w.rounds, w.hasMain])).toEqual([['page', 'page', 1, true], ['notes', 'research', 0, false]]);
    expect(workIcon({ demo: true })).toBe('demo');
    expect(workIcon(undefined)).toBe('page');
  });

  it('remembers stories told, and forgetting everything puts the shop back to its first day', () => {
    const store = fresh();
    store.finished();
    store.markTold('story_chestnut');
    store.markTold('story_chestnut');
    expect(store.shopState().told).toEqual(['story_chestnut']);
    store.clear();
    expect(store.shopState()).toEqual({ done: 0, grown: [], told: [], works: [] });
  });

  it('has a line for every new piece, in both languages', () => {
    for (const file of ['lines/cafe.yaml', 'lines/en/cafe.yaml']) {
      const grow = parseLines(readFileSync(file, 'utf8')).grow;
      for (const g of GROWTH) expect(pickLine(grow, [`grow_${g.id}`], {})?.length, `${file} ${g.id}`).toBeGreaterThan(0);
    }
  });
});

describe('chats for regulars', () => {
  const chats = chatsForScene(parseChats(readFileSync('lines/chats.yaml', 'utf8')), 'cafe');
  const heard = (shop: { done: number; told: Set<string> }, rounds = 60) => {
    const c = new Chatter(chats, [], 0, () => 0.5);
    const ids: string[] = [];
    for (let i = 1; i <= rounds; i++) {
      const t = c.next('idle', i * CHAT_GAP_MS, 'day', { sky: 'clear', holiday: null }, shop);
      if (t?.kind === 'chat') ids.push(t.id);
    }
    return ids;
  };

  it('keeps regulars\' chats and stories back until enough is done together', () => {
    const ids = heard({ done: 0, told: new Set() });
    expect(ids.some((id) => id.startsWith('regular_') || id.startsWith('story_'))).toBe(false);
  });

  it('tells a newly unlocked story first, and never one already told', () => {
    expect(heard({ done: 4, told: new Set() }, 1)).toEqual(['story_chestnut']);
    expect(heard({ done: 4, told: new Set(['story_chestnut']) })).not.toContain('story_chestnut');
  });
});
