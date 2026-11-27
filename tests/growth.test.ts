import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyTown, TOWN_MOVE } from '../app/shared/town';
import { MemoryStore } from '../app/main/memory';
import { GROWTH, grownBy, madeOf, shortWork, workIcon } from '../app/shared/growth';
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
    expect(grownBy(20)).toEqual(['painting', 'plant', 'lights', 'fruit', 'guitar', 'bonsai', 'easel', 'trophy']);
  });

  it('keeps growing long after the twentieth', () => {
    expect(grownBy(25)).toContain('portrait');
    expect(grownBy(35)).toContain('sunset');
    expect(grownBy(50)).toContain('star');
    expect(grownBy(49)).not.toContain('star');
  });

  it('goes on to the hundredth, with a big piece at sixty, seventy-five and a hundred', () => {
    const counted = GROWTH.filter((g) => !('work' in g)).map((g) => [g.id, g.at]);
    expect(counted.slice(-8)).toEqual([
      ['chime', 55], ['aquarium', 60], ['scroll', 65], ['teapot', 70], ['gramophone', 75], ['cushion', 80], ['hat', 90], ['plaque', 100],
    ]);
    expect(grownBy(59)).not.toContain('aquarium');
    expect(grownBy(60)).toContain('aquarium');
    expect(grownBy(75)).toContain('gramophone');
    expect(grownBy(99)).not.toContain('plaque');
    expect(grownBy(100)).toEqual(expect.arrayContaining(counted.map(([id]) => id)));
  });

  it('gathers what fits the kind of work done', () => {
    expect(grownBy(0, { album: 1 })).toEqual(['album']);
    expect(grownBy(0, { research: 1 })).toEqual([]);
    expect(grownBy(0, { research: 2 })).toEqual(['books']);
    expect(grownBy(0, { page: 3, plan: 1, letter: 2, sheet: 2 }).sort()).toEqual(['calendar', 'ledger', 'letters', 'monitor']);
    const store = fresh();
    store.remember(memo('photos', { form: { want: 'x', template: 'album' } }), []);
    expect(store.finished()).toEqual(['painting', 'album']);
  });

  it('counts only finished work of each kind', () => {
    const store = fresh();
    store.remember(memo('a', { form: { want: 'x', template: 'research' } }), []);
    store.remember({ ...memo('b', { form: { want: 'x', template: 'research' } }), result: 'failed' }, []);
    store.remember(memo('c', { form: { want: 'x', template: 'album' } }), []);
    expect(madeOf(store.shopState().works)).toEqual({ research: 1, album: 1 });
  });

  it('does not grow from another round on the same work', () => {
    const store = fresh();
    const a = store.remember(memo('a', { form: { want: 'x', template: 'research' } }), []);
    store.revise(a.id, 'shorter', { result: 'done', choices: {} }, []);
    store.revise(a.id, 'longer', { result: 'done', choices: {} }, []);
    expect(madeOf(store.shopState().works)).toEqual({ research: 1 });
  });

  it('shows a different shop after thirty commissions of different kinds', () => {
    const shopAfter = (kinds: string[]) => {
      const store = fresh();
      for (let i = 0; i < 30; i++) {
        store.remember(memo(`w${i}`, { form: { want: 'x', template: kinds[i % kinds.length] } }), []);
        store.finished(new Date('2026-11-01T10:00:00Z'));
      }
      return store.shopState().grown.map((g) => g.id);
    };
    const albums = shopAfter(['album']);
    const reports = shopAfter(['research', 'sheet']);
    expect(albums).toContain('album');
    expect(albums).not.toContain('books');
    expect(reports).toEqual(expect.arrayContaining(['books', 'ledger']));
    expect(reports).not.toContain('album');
    for (const shop of [albums, reports]) expect(shop).toEqual(expect.arrayContaining(['trophy', 'portrait']));
  }, 20_000);

  it('shortens a title to fit a bubble', () => {
    expect(shortWork('记账页')).toBe('记账页');
    expect(shortWork('一二三四五六七八九十一二三四五')).toBe('一二三四五六七八九十…');
  });

  it('puts finished works on the shelf, latest first, with their icons and rounds', () => {
    const store = fresh();
    const a = store.remember(memo('page', { form: { want: 'x', template: 'page' }, main: 'index.html' }), []);
    store.remember(memo('notes', { form: { want: 'y', template: 'research' } }), []);
    store.remember({ ...memo('broken'), result: 'failed' }, []);
    store.revise(a.id, 'lighter', { result: 'done', choices: {} }, []);
    expect(store.shopState().works.map((w) => [w.title, w.icon, w.rounds, w.hasMain])).toEqual([['page', 'page', 1, true], ['notes', 'research', 0, false]]);
    // The shop that made it, for the shelf's shop row (plan-1.8 H7): a free-form order stays at home.
    store.remember(memo('free', { form: { want: 'z' } }), []);
    expect(store.shopState().works.map((w) => [w.title, w.icon, w.shop])).toEqual([['free', 'page', 'home'], ['page', 'page', 'workshop'], ['notes', 'research', 'home']]);
    expect(workIcon({ demo: true })).toBe('demo');
    expect(workIcon(undefined)).toBe('page');
  });

  it('remembers stories told, and forgetting everything puts the shop back to its first day', () => {
    const store = fresh();
    store.finished();
    store.markTold('story_chestnut');
    store.markTold('story_chestnut');
    expect(store.shopState().told).toEqual([TOWN_MOVE, 'story_chestnut']);
    store.clear();
    // Back to a shop opened since 1.4: in the town, with no move to show.
    expect(store.shopState()).toEqual({ done: 0, grown: [], told: [TOWN_MOVE], town: emptyTown(), works: [], today: expect.any(String),
      crew: { adeng: 0, xiaoju: 0, laoshi: 0, qingdai: 0, xiaodou: 0, aqian: 0, xiaozhe: 0, xiaoding: 0, guiyi: 0, axin: 0 }, bonds: expect.any(Object) });
  });

  it('has a line for every new piece, in both languages', () => {
    for (const file of ['lines/cafe.yaml', 'lines/en/cafe.yaml']) {
      const grow = parseLines(readFileSync(file, 'utf8')).grow;
      for (const g of GROWTH) expect(pickLine(grow, [`grow_${g.id}`], {})?.length, `${file} ${g.id}`).toBeGreaterThan(0);
    }
  });
});

describe('chats for regulars', () => {
  it('has more to say after the tenth, in both languages', () => {
    for (const file of ['lines/chats.yaml', 'lines/en/chats.yaml']) {
      const later = parseChats(readFileSync(file, 'utf8')).filter((c) => !c.guest && (c.after ?? 0) > 10);
      expect(later.map((c) => c.after).sort((a, b) => a! - b!), file).toEqual([15, 20, 25, 30, 40, 50]);
    }
  });

  it('talks about the kinds of work done, and neighbours ask about them, in both languages', () => {
    for (const file of ['lines/chats.yaml', 'lines/en/chats.yaml']) {
      const all = parseChats(readFileSync(file, 'utf8'));
      for (const work of ['page', 'album', 'letter', 'sheet', 'research', 'plan']) {
        expect(all.some((c) => c.made === work && !c.guest), `${file} staff on ${work}`).toBe(true);
      }
      for (const work of ['page', 'album', 'letter', 'sheet']) {
        expect(all.some((c) => c.made === work && c.guest), `${file} neighbour on ${work}`).toBe(true);
      }
      const asks = all.filter((c) => c.mentions);
      expect(asks.length, file).toBeGreaterThanOrEqual(2);
      for (const c of asks) expect(c.turns.some((t) => t.text.includes('{lastWork}')), c.id).toBe(true);
    }
  });

  it('only brings up a kind of work the shop has done', () => {
    const made = { id: 'album_talk', when: 'idle' as const, made: 'album' as const, turns: [{ speaker: 'adeng' as const, text: 'x' }, { speaker: 'xiaoju' as const, text: 'y' }] };
    const talk = (shop: { done: number; told: Set<string>; made: Record<string, number> }) => new Chatter([made], [], 0, () => 0.5).next('idle', CHAT_GAP_MS, 'day', { sky: 'clear', holiday: null }, shop);
    expect(talk({ done: 5, told: new Set(), made: {} })).toBeNull();
    expect(talk({ done: 5, told: new Set(), made: { album: 1 } })?.id).toBe('album_talk');
  });

  const chats = chatsForScene(parseChats(readFileSync('lines/chats.yaml', 'utf8')), 'cafe');
  const heard = (seen: { done: number; told: Set<string> }, rounds = 60) => {
    const shop = { ...seen, made: {} };
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
