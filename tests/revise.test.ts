import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REVISE_SUMMARY_RULE, continuePrompt, revisePrompt } from '../app/main/commission';
import { MemoryStore } from '../app/main/memory';
import { sessionExists } from '../app/main/sessions';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-revise-')), 'memory.json');
const form = { want: 'a sign-in page for the family party', template: 'page' as const };

describe('asking for changes', () => {
  it('a resumed session gets just the change and the rules for a round', () => {
    const p = revisePrompt({ ask: 'lighter colours', form }, true);
    expect(p).toContain('"lighter colours"');
    expect(p).toContain(REVISE_SUMMARY_RULE);
    expect(p).not.toContain('sign-in page');
  });

  it('without the session, the agent is told what the work was and where to find it', () => {
    const p = revisePrompt({ ask: 'lighter colours', form, summary: 'A page with a list of names.' }, false);
    expect(p).toContain('sign-in page');
    expect(p).toContain('A page with a list of names.');
    expect(p).toContain('index.html');
    expect(p).toContain('look at them first');
  });

  it('says so when the user went back to the previous version', () => {
    expect(revisePrompt({ ask: 'x', form, restored: true }, true)).toContain('went back to the previous version');
  });

  it('an interrupted round continues as a round, not as the original commission', () => {
    expect(continuePrompt(form, false, '', { ask: 'bigger buttons', form })).toContain('"bigger buttons"');
  });

  it('remembers each round on the same notebook entry and brings up the last ask', () => {
    const store = new MemoryStore(fresh());
    const first = store.remember({ title: 'sign-in', result: 'done', choices: { 'Colour?': 'mint' }, folder: '/w/a', form, sessionId: 's1' }, []);
    store.remember({ title: 'other', result: 'done', choices: {}, folder: '/w/b' }, []);
    expect(store.recallForRevision(first.id)).toEqual({ flags: ['revise'], vars: {} });
    store.revise(first.id, 'lighter colours', { result: 'done', choices: {}, sessionId: 's2' }, [], new Date('2026-11-01T10:00:00Z'));
    // Trying the same round again is not a second round.
    store.revise(first.id, 'lighter colours', { result: 'done', choices: {} }, []);
    const m = store.get();
    expect(m.commissions.map((c) => c.title)).toEqual(['other', 'sign-in']);
    expect(store.latest()).toMatchObject({ id: first.id, sessionId: 's2', choices: { 'Colour?': 'mint' }, asks: [{ ask: 'lighter colours', date: '2026-11-01' }] });
    expect(store.recallForRevision(first.id)).toEqual({ flags: ['revise', 'revise_again'], vars: { lastAsk: 'lighter colours' } });
  });

  it('a round that fails does not turn finished work into a failure', () => {
    const store = new MemoryStore(fresh());
    const first = store.remember({ title: 'sign-in', result: 'done', choices: {}, folder: '/w/a' }, []);
    expect(store.revise(first.id, 'x', { result: 'failed', choices: {} }, [])?.result).toBe('done');
    expect(store.revise('c0', 'x', { result: 'done', choices: {} }, [])).toBeNull();
  });

  it('finds a Claude Code session on disk only if it is still there', () => {
    const root = mkdtempSync(join(tmpdir(), 'lamplight-sessions-'));
    mkdirSync(join(root, '-home-me-work'));
    writeFileSync(join(root, '-home-me-work', 'abc-123.jsonl'), '');
    expect(sessionExists('abc-123', root)).toBe(true);
    expect(sessionExists('gone-456', root)).toBe(false);
    expect(sessionExists('../abc-123', root)).toBe(false);
    expect(sessionExists('abc-123', join(root, 'missing'))).toBe(false);
  });
});
