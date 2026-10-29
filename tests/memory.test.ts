import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore, StuckTracker } from '../app/main/memory';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-memory-')), 'memory.json');
const memo = (title: string, choices: Record<string, string> = {}, result: 'done' | 'failed' = 'done') => ({ title, choices, result, folder: `/work/${title}` });

describe('memory store', () => {
  it('remembers commissions, choices and stuck places across restarts', () => {
    const file = fresh();
    new MemoryStore(file).remember(memo('ledger', { 'Main color?': 'mint' }), ['node check.js'], new Date('2026-10-22T10:00:00Z'));
    const m = new MemoryStore(file).get();
    expect(m.commissions).toEqual([{ id: expect.any(String), title: 'ledger', date: '2026-10-22', result: 'done', choices: { 'Main color?': 'mint' }, folder: '/work/ledger' }]);
    expect(m.stuckNotes).toEqual([{ commission: 'ledger', note: 'node check.js', date: '2026-10-22' }]);
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

  it('keeps only recent work', () => {
    const store = new MemoryStore(fresh());
    for (let i = 0; i < 25; i++) store.remember(memo(`job ${i}`), [`step ${i}`], new Date(2026, 9, 1, 0, i));
    const m = store.get();
    expect(m.commissions).toHaveLength(20);
    expect(m.commissions[0].title).toBe('job 5');
    expect(m.stuckNotes).toHaveLength(10);
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
