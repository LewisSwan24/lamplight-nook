import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { BACKGROUND_MAX, afterRound, briefOf, editedBrief, newSession, projectBackground } from '../app/main/project-brief';
import type { ProjectBrief, ProjectRound, RoundStat } from '../app/shared/types';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-brief-')), 'memory.json');
const stat = (seconds: number, date = '2026-11-15'): RoundStat => ({ date, seconds, helpers: {}, waits: 0, waitedSeconds: 0 });
const DAY = new Date('2026-11-15T10:00:00');
const round = (n: number, ask?: string): ProjectRound => ({ n, commission: 'c1', date: '2026-11-15', ...(ask ? { ask } : {}) });
const long = (mark: string, n: number) => mark + 'x'.repeat(n - mark.length);

/** A project of one commission with two rounds of changes, as the notebook has it. */
function project() {
  const store = new MemoryStore(fresh());
  const c = store.remember({
    title: 'tea shop page', result: 'done', folder: 'C:/works/tea', choices: { 'Main colour?': 'mint' }, summary: 'Made the page.',
    form: { want: 'A page for my tea shop', details: 'Opening hours at the top' }, rounds: [stat(60)],
  }, [], DAY);
  store.revise(c.id, 'bigger title', { result: 'done', choices: {}, summary: 'The title is bigger.', round: stat(20) }, [], DAY);
  return { store, c, id: c.project! };
}

describe('what the staff remember about a project', () => {
  it('starts from the first commission, the questions answered in the project and the last round', () => {
    const { store, id } = project();
    expect(briefOf(store.get().projects[0], store.get().commissions)).toEqual({
      purpose: 'A page for my tea shop\nOpening hours at the top', prefs: ['Main colour? mint'], lastRound: 'The title is bigger.',
    });
    expect(store.projectBrief(id)).toEqual(briefOf(store.get().projects[0], store.get().commissions));
  });

  it('is put together with the last three changes asked for, oldest first, and nothing else to call', () => {
    const brief: ProjectBrief = { purpose: 'A page for my tea shop', prefs: ['Main colour? mint', 'no photos'], lastRound: 'The title is bigger.' };
    const text = projectBackground(brief, [round(1), round(2, 'ask one'), round(3, 'ask two'), round(4, 'ask three'), round(5, 'ask four')]);
    for (const part of ['A page for my tea shop', 'Main colour? mint', 'no photos', 'The title is bigger.', 'ask two', 'ask three', 'ask four']) expect(text).toContain(part);
    expect(text).not.toContain('ask one');
    expect(text.indexOf('ask two')).toBeLessThan(text.indexOf('ask four'));
  });

  it('says nothing about a project it knows nothing of', () => {
    expect(projectBackground({ purpose: '', prefs: [] }, [round(1)])).toBe('');
  });

  it('drops the oldest change asked for first when it runs over 2,000 characters', () => {
    const brief: ProjectBrief = { purpose: 'PURPOSE', prefs: ['p1', 'p2'], lastRound: 'LAST' };
    const text = projectBackground(brief, [round(1), round(2, long('ASK-A', 800)), round(3, long('ASK-B', 800)), round(4, long('ASK-C', 800))]);
    expect(text.length).toBeLessThanOrEqual(BACKGROUND_MAX);
    expect(text).not.toContain('ASK-A');
    expect(text).toContain('ASK-B');
    expect(text).toContain('ASK-C');
    expect(text).toContain('p1');
    expect(text).toContain('PURPOSE');
  });

  it('then keeps only the latest 8 preferences', () => {
    const prefs = Array.from({ length: 12 }, (_, i) => long(`PREF-${String(i + 1).padStart(2, '0')}`, 120));
    const brief: ProjectBrief = { purpose: long('PURPOSE', 400), prefs, lastRound: 'LAST' };
    const text = projectBackground(brief, [round(1), round(2, long('ASK-A', 300))]);
    expect(text.length).toBeLessThanOrEqual(BACKGROUND_MAX);
    expect(text).not.toContain('ASK-A');
    for (const p of prefs.slice(0, 4)) expect(text).not.toContain(p);
    for (const p of prefs.slice(4)) expect(text).toContain(p);
    expect(text).toContain(long('PURPOSE', 400));
  });

  it('and only last cuts what the project is for short', () => {
    const prefs = Array.from({ length: 12 }, (_, i) => long(`PREF-${i}`, 120));
    const brief: ProjectBrief = { purpose: long('PURPOSE', 3000), prefs, lastRound: long('LAST', 500) };
    const text = projectBackground(brief, [round(1), round(2, 'ASK-A')]);
    expect(text.length).toBeLessThanOrEqual(BACKGROUND_MAX);
    expect(text).toContain('PURPOSE');
    expect(text).toContain('…');
    expect(text).toContain(long('LAST', 500));
    for (const p of prefs.slice(4)) expect(text).toContain(p);
  });
});

describe('after each round', () => {
  it('takes the questions answered into the preferences, a question answered again only once', () => {
    const b = afterRound({ purpose: 'P', prefs: ['Main colour? mint'] }, { 'Main colour?': 'cream', 'Font': 'round' }, 'New summary.');
    expect(b).toEqual({ purpose: 'P', prefs: ['Main colour? cream', 'Font: round'], lastRound: 'New summary.' });
  });

  it('keeps 12 preferences at most, of 120 characters at most', () => {
    const prefs = Array.from({ length: 12 }, (_, i) => `old ${i}`);
    const b = afterRound({ purpose: 'P', prefs }, { [long('Q', 200)]: 'A' }, undefined);
    expect(b.prefs).toHaveLength(12);
    expect(b.prefs[0]).toBe('old 1');
    expect(b.prefs.at(-1)!.length).toBe(120);
  });

  it('keeps where the last round left off when a round says nothing', () => {
    expect(afterRound({ purpose: 'P', prefs: [], lastRound: 'before' }, {}, undefined).lastRound).toBe('before');
  });

  it('never writes over what the user changed, or brings back what they took out', () => {
    const { store, c, id } = project();
    expect(store.editBrief(id, { purpose: 'My own words', prefs: ['no photos', 'large print'], lastRound: 'The title is bigger.' }, DAY)).toBe(true);
    store.revise(c.id, 'add a map', { result: 'done', choices: { 'Map style?': 'drawn' }, summary: 'Added a map.', round: stat(30) }, [], DAY);
    expect(store.projectBrief(id)).toEqual({ purpose: 'My own words', prefs: ['no photos', 'large print', 'Map style? drawn'], lastRound: 'Added a map.', edited: '2026-11-15' });
  });

  it('takes only what a user may write', () => {
    expect(editedBrief({ purpose: 'P', prefs: ['  a  ', '', long('b', 200), ...Array.from({ length: 14 }, (_, i) => `x${i}`)], lastRound: long('L', 900) }, '2026-11-15')).toEqual({
      purpose: 'P', prefs: ['a', long('b', 120), ...Array.from({ length: 10 }, (_, i) => `x${i}`)], lastRound: long('L', 500), edited: '2026-11-15',
    });
    expect(editedBrief({ purpose: 3, prefs: [] }, '2026-11-15')).toBeNull();
    expect(editedBrief({ purpose: 'P', prefs: 'a' }, '2026-11-15')).toBeNull();
  });
});

describe('forgetting', () => {
  it('this project: nothing of it goes into the next round, and its session is not picked up again', () => {
    const { store, c, id } = project();
    store.revise(c.id, 'add a map', { result: 'done', choices: {}, summary: 'Added a map.', sessionId: 'abc', round: stat(30) }, [], DAY);
    expect(store.forgetProject(id, DAY)).toBe(true);
    const p = store.get().projects[0];
    expect(store.projectBrief(id)).toEqual({ purpose: '', prefs: [], edited: '2026-11-15', forgotAt: 3 });
    expect(projectBackground(store.projectBrief(id)!, p.rounds)).toBe('');
    expect(store.find(c.id)!.sessionId).toBeUndefined();
    store.revise(c.id, 'a footer', { result: 'done', choices: {}, summary: 'Added a footer.', round: stat(30) }, [], DAY);
    const text = projectBackground(store.projectBrief(id)!, store.get().projects[0].rounds);
    expect(text).toContain('Added a footer.');
    expect(text).toContain('a footer');
    expect(text).not.toContain('add a map');
    expect(store.forgetProject('p0', DAY)).toBe(false);
  });

  it('everything: the projects go with it', () => {
    const { store, id } = project();
    store.editBrief(id, { purpose: 'mine', prefs: [] }, DAY);
    store.clear();
    expect(store.projectBrief(id)).toBeUndefined();
  });
});

describe('the notes for a round inside a project', () => {
  it('leave out the questions answered on the rest of the shop’s work', () => {
    const { store } = project();
    store.remember({ title: 'other', result: 'done', folder: 'C:/works/other', choices: { 'Paper size?': 'A4' } }, [], DAY);
    expect(store.promptNotes('tea shop page')).toContain('Paper size?');
    expect(store.promptNotes('tea shop page', true)).not.toContain('Paper size?');
  });
});

describe('a new session', () => {
  it('when the last round read more than 150k tokens', () => {
    expect(newSession({ date: '2026-11-15', contextTokens: 150_001 }, '2026-11-15')).toBe(true);
    expect(newSession({ date: '2026-11-15', contextTokens: 150_000 }, '2026-11-15')).toBe(false);
  });

  it('when the session was last used more than 7 days ago', () => {
    expect(newSession({ date: '2026-11-07' }, '2026-11-15')).toBe(true);
    expect(newSession({ date: '2026-11-08' }, '2026-11-15')).toBe(false);
    expect(newSession({ date: '2026-10-30', contextTokens: 10 }, '2026-11-02')).toBe(false);
  });
});
