import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore, StuckTracker } from '../app/main/memory';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-memory-')), 'memory.json');
const memo = (title: string, choices: Record<string, string> = {}, result: 'done' | 'failed' = 'done') => ({ title, choices, result, folder: `/work/${title}` });

describe('a work whose folder moved', () => {
  const madeIn = (file: string, folder: string) => new MemoryStore(file).remember({ ...memo('page'), folder, main: 'page.html', sessionId: 's1', preexisting: [join(folder, 'old.txt')] }, []);

  it('lives in the new folder from now on, its own file still belongs to the shop, and the rest counts as already being there', () => {
    const file = fresh();
    const work = madeIn(file, 'C:/gone');
    const moved = mkdtempSync(join(tmpdir(), 'lamplight-moved-'));
    writeFileSync(join(moved, 'page.html'), 'x');
    writeFileSync(join(moved, 'mine.txt'), 'x');
    new MemoryStore(file).relink(work.id, moved);
    const after = new MemoryStore(file).find(work.id)!;
    expect(after.folder).toBe(moved);
    expect(after.main).toBe('page.html');
    // A round in the new folder or putting one back must never clear away what was already in it.
    expect(after.preexisting).toEqual([join(moved, 'mine.txt')]);
    // The staff's session belongs to the old folder.
    expect(after.sessionId).toBeUndefined();
  });
});

describe('memory store', () => {
  it('remembers commissions, choices and stuck places across restarts', () => {
    const file = fresh();
    new MemoryStore(file).remember(memo('ledger', { 'Main color?': 'mint' }), ['node check.js'], new Date('2026-10-22T10:00:00Z'));
    const m = new MemoryStore(file).get();
    expect(m.commissions).toEqual([{ id: expect.any(String), title: 'ledger', date: '2026-10-22', result: 'done', choices: { 'Main color?': 'mint' }, folder: '/work/ledger' }]);
    expect(m.stuckNotes).toEqual([{ commission: 'ledger', note: 'node check.js', date: '2026-10-22' }]);
  });

  it('keeps one entry when a stopped commission is carried on in the same folder', () => {
    const store = new MemoryStore(fresh());
    store.remember({ ...memo('ledger', {}, 'failed'), folder: 'C:/works/ledger' }, []);
    store.remember({ ...memo('ledger'), folder: 'C:/works/ledger' }, []);
    expect(store.get().commissions.map((c) => c.result)).toEqual(['done']);
  });

  it('keeps what was answered before the stop when it is carried on', () => {
    const store = new MemoryStore(fresh());
    store.remember({ ...memo('ledger', { 'Main color?': 'mint', 'Font?': 'serif' }, 'failed'), folder: 'C:/works/ledger' }, []);
    store.remember({ ...memo('ledger', { 'Font?': 'sans' }), folder: 'C:/works/ledger' }, []);
    expect(store.get().commissions[0].choices).toEqual({ 'Main color?': 'mint', 'Font?': 'sans' });
  });

  it('keeps how each round went, through a stop carried on and a round of changes', () => {
    const file = fresh();
    const round = (seconds: number, failure?: string) => ({ date: '2026-11-14', seconds, ...(failure ? { failure } : {}), helpers: {}, waits: 0, waitedSeconds: 0 });
    const store = new MemoryStore(file);
    store.remember({ ...memo('ledger', {}, 'failed'), folder: 'C:/works/ledger', rounds: [round(40, 'net')] }, []);
    const done = store.remember({ ...memo('ledger'), folder: 'C:/works/ledger', rounds: [round(90)] }, []);
    store.revise(done.id, 'bigger title', { result: 'done', choices: {}, round: round(30) }, []);
    expect(new MemoryStore(file).find(done.id)!.rounds!.map((r) => r.seconds)).toEqual([40, 90, 30]);
  });

  it('forgets how the rounds went on its own, and keeps the works', () => {
    const file = fresh();
    const store = new MemoryStore(file);
    store.remember({ ...memo('ledger'), rounds: [{ date: '2026-11-14', seconds: 9, helpers: {}, waits: 0, waitedSeconds: 0 }] }, []);
    store.clearStats();
    const after = new MemoryStore(file).get().commissions;
    expect(after).toHaveLength(1);
    expect(after[0].rounds).toBeUndefined();
  });

  it('keeps a finished commission and a failed one that are in different folders', () => {
    const store = new MemoryStore(fresh());
    store.remember({ ...memo('ledger', {}, 'failed'), folder: 'C:/works/one' }, []);
    store.remember({ ...memo('ledger'), folder: 'C:/works/two' }, []);
    expect(store.get().commissions).toHaveLength(2);
  });

  it('starts empty and recalls nothing', () => {
    const store = new MemoryStore(fresh());
    expect(store.recallForCommission('ledger')).toEqual({ flags: [], vars: {} });
    expect(store.recallOnOpen()).toEqual({ flags: [], vars: {} });
    expect(store.promptNotes('ledger')).toBe('');
  });

  it('brings up the last choice, and a stuck place only for the same commission', () => {
    const store = new MemoryStore(fresh());
    store.remember(memo('ledger', { 'Main color?': 'mint' }), ['node check.js']);
    expect(store.recallForCommission('ledger')).toEqual({ flags: ['has_memory', 'has_stuck_note'], vars: { lastChoice: 'mint', stuckNote: 'node check.js' } });
    expect(store.recallForCommission('poster')).toEqual({ flags: ['has_memory'], vars: { lastChoice: 'mint' } });
  });

  it('mentions the last commission once when the app opens', () => {
    const file = fresh();
    new MemoryStore(file).remember(memo('ledger'), []);
    expect(new MemoryStore(file).recallOnOpen()).toEqual({ flags: ['has_memory'], vars: { lastCommission: 'ledger' } });
    expect(new MemoryStore(file).recallOnOpen().flags).toEqual([]);
  });

  it('does not bring up a commission that failed when the app opens', () => {
    const store = new MemoryStore(fresh());
    store.remember(memo('ledger', {}, 'failed'), ['node check.js']);
    expect(store.recallOnOpen().flags).toEqual([]);
  });

  it('keeps one note when the same commission gets stuck in the same place again', () => {
    const store = new MemoryStore(fresh());
    store.remember(memo('ledger'), ['node check.js'], new Date('2026-10-22T10:00:00Z'));
    store.remember(memo('ledger'), ['node check.js'], new Date('2026-10-29T10:00:00Z'));
    expect(store.get().stuckNotes).toEqual([{ commission: 'ledger', note: 'node check.js', date: '2026-10-29' }]);
    expect(store.promptNotes('ledger').match(/node check\.js/g)).toHaveLength(1);
  });

  it('keeps every work, however many there have been', () => {
    const store = new MemoryStore(fresh());
    for (let i = 0; i < 45; i++) store.remember(memo(`work ${i}`), []);
    expect(store.get().commissions).toHaveLength(45);
    expect(store.shopState().works).toHaveLength(45);
  });

  it('keeps the last ten stuck notes', () => {
    const store = new MemoryStore(fresh());
    for (let i = 0; i < 25; i++) store.remember(memo(`job ${i}`), [`step ${i}`], new Date(2026, 9, 1, 0, i));
    expect(store.get().stuckNotes).toHaveLength(10);
  });

  it('tells Claude only about recent choices, so a long history does not cost more on every commission', () => {
    const store = new MemoryStore(fresh());
    store.remember(memo('old', { 'Old question?': 'old answer' }), []);
    for (let i = 0; i < 25; i++) store.remember(memo(`work ${i}`, { [`Question ${i}?`]: 'yes' }), []);
    const notes = store.promptNotes('anything');
    expect(notes).not.toContain('Old question?');
    expect(notes).toContain('Question 24?');
    expect(notes.split('\n').length).toBeLessThanOrEqual(21);
  });

  it('remembers the first time a neighbour came, once', () => {
    const file = fresh();
    const store = new MemoryStore(file);
    store.markMet('baker', new Date('2026-03-01'));
    store.markMet('baker', new Date('2026-04-01'));
    expect(new MemoryStore(file).get().shop?.met).toEqual([{ id: 'baker', date: '2026-03-01' }]);
  });

  it('writes earlier choices and stuck places into the prompt notes', () => {
    const store = new MemoryStore(fresh());
    store.remember(memo('ledger', { 'Main color?': 'cream' }), []);
    store.remember(memo('ledger', { 'Main color?': 'mint' }), ['node check.js']);
    const notes = store.promptNotes('ledger');
    expect(notes).toContain('"Main color?" before, the user chose "mint"');
    expect(notes).not.toContain('cream');
    expect(notes).toContain('"node check.js" failed at first');
  });

  it('forgets everything when cleared, also after a restart', () => {
    const file = fresh();
    const store = new MemoryStore(file);
    store.remember(memo('ledger', { q: 'a' }), ['x']);
    store.clear();
    expect(store.get()).toEqual({ commissions: [], stuckNotes: [] });
    expect(new MemoryStore(file).get()).toEqual({ commissions: [], stuckNotes: [] });
  });

  it('treats a broken or odd file as an empty notebook', () => {
    const file = fresh();
    writeFileSync(file, '{oops');
    expect(new MemoryStore(file).get()).toEqual({ commissions: [], stuckNotes: [] });
    writeFileSync(file, JSON.stringify({ commissions: [{ title: 1 }, null], stuckNotes: 'x' }));
    expect(new MemoryStore(file).get()).toEqual({ commissions: [], stuckNotes: [] });
  });
});

describe('stuck tracker', () => {
  it('notes a step that failed and later worked', () => {
    const t = new StuckTracker();
    t.see({ kind: 'tool_fail', tool: 'Bash', target: 'node check.js' });
    t.see({ kind: 'tool_ok', tool: 'Write', target: 'index.html' });
    t.see({ kind: 'tool_ok', tool: 'Bash', target: 'node check.js' });
    expect(t.stuck).toEqual(['node check.js']);
    expect(t.unresolved).toEqual([]);
  });

  it('keeps steps that never worked apart', () => {
    const t = new StuckTracker();
    t.see({ kind: 'tool_fail', tool: 'Bash', target: 'npm test' });
    t.see({ kind: 'tool_ok', tool: 'Bash', target: 'node check.js' });
    expect(t.stuck).toEqual([]);
    expect(t.unresolved).toEqual(['npm test']);
  });
});
