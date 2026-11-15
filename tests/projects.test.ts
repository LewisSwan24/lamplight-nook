import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { addProjects, projectIdFor, projectSettled } from '../app/main/projects';
import type { CommissionMemo, Memory, RoundStat } from '../app/shared/types';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'lamplight-projects-')), 'memory.json');
const memo = (title: string, result: 'done' | 'failed' = 'done', folder = `C:/works/${title}`) => ({ title, choices: {}, result, folder });
const stat = (seconds: number, failure?: string, date = '2026-11-14'): RoundStat => ({ date, seconds, ...(failure ? { failure } : {}), helpers: {}, waits: 0, waitedSeconds: 0 });
const DAY = new Date('2026-11-15T10:00:00');

describe('a new commission', () => {
  it('starts a project of its own, with its title, folder and first round', () => {
    const store = new MemoryStore(fresh());
    const c = store.remember({ ...memo('tea shop page'), summary: 'made the page', rounds: [stat(90)], usd: 0.42 }, [], DAY);
    const [p] = store.get().projects;
    expect(c.project).toBe(p.id);
    expect(p).toEqual({
      id: projectIdFor(c.id), title: 'tea shop page', folder: 'C:/works/tea shop page', created: '2026-11-15', commissions: [c.id],
      rounds: [{ n: 1, commission: c.id, date: '2026-11-15', summary: 'made the page', usd: 0.42, seconds: 90 }],
    });
  });

  it('remembers a folder the user lent', () => {
    const store = new MemoryStore(fresh());
    store.remember({ ...memo('tidy'), form: { want: 'tidy it', inPlace: 'C:/mine' }, folder: 'C:/mine' }, [], DAY);
    expect(store.get().projects[0].lent).toBe(true);
  });

  it('gets a project number no other project has, even one left by a commission that is gone', () => {
    const file = fresh();
    const at = new Date('2026-11-15T10:00:00.000');
    const taken = { commissions: [], stuckNotes: [], projects: [{ id: `p${at.getTime()}`, title: 'old', folder: 'C:/old', created: '2026-11-01', commissions: ['c1'], rounds: [] }] };
    writeFileSync(file, JSON.stringify(taken));
    const store = new MemoryStore(file);
    const c = store.remember(memo('new'), [], at);
    const ids = store.get().projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
    expect(c.project).not.toBe(`p${at.getTime()}`);
  });
});

describe('carrying on in a project', () => {
  it('a round of changes is one more round on the timeline of the same project', () => {
    const store = new MemoryStore(fresh());
    const c = store.remember({ ...memo('page'), rounds: [stat(90)] }, [], DAY);
    store.revise(c.id, 'bigger title', { result: 'done', choices: {}, summary: 'title is bigger', round: stat(30), usd: 0.1 }, [], DAY);
    const [p] = store.get().projects;
    expect(store.get().projects).toHaveLength(1);
    expect(p.rounds.map((r) => [r.n, r.commission, r.ask, r.seconds, r.usd])).toEqual([[1, c.id, undefined, 90, undefined], [2, c.id, 'bigger title', 30, 0.1]]);
    expect(p.rounds[1].summary).toBe('title is bigger');
  });

  it('a new commission in the project joins it and works in its folder', () => {
    const store = new MemoryStore(fresh());
    const first = store.remember(memo('site'), [], DAY);
    const blog = store.remember({ ...memo('one more blog page', 'done', 'C:/works/site'), project: first.project }, [], DAY);
    const projects = store.get().projects;
    expect(projects).toHaveLength(1);
    expect(projects[0].commissions).toEqual([first.id, blog.id]);
    expect(projects[0].rounds.map((r) => [r.n, r.commission])).toEqual([[1, first.id], [2, blog.id]]);
    expect(projects[0].title).toBe('site');
    expect(store.find(blog.id)!.project).toBe(first.project);
  });

  it('carrying on after a stop is the same round of the same project, not a second one', () => {
    const store = new MemoryStore(fresh());
    const stopped = store.remember({ ...memo('page', 'failed'), rounds: [stat(40, 'network')], usd: 0.2 }, [], DAY);
    const done = store.remember({ ...memo('page'), summary: 'done now', rounds: [stat(60)], usd: 0.3 }, [], DAY);
    const projects = store.get().projects;
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(stopped.project);
    expect(done.project).toBe(stopped.project);
    expect(projects[0].commissions).toEqual([done.id]);
    expect(projects[0].rounds).toEqual([{ n: 1, commission: done.id, date: '2026-11-15', summary: 'done now', seconds: 100, usd: 0.5 }]);
  });

  it('trying the same round of changes again is still one round', () => {
    const store = new MemoryStore(fresh());
    const c = store.remember(memo('page'), [], DAY);
    store.revise(c.id, 'bigger title', { result: 'failed', choices: {}, round: stat(20, 'network') }, [], DAY);
    store.revise(c.id, 'bigger title', { result: 'done', choices: {}, round: stat(30) }, [], DAY);
    const rounds = store.get().projects[0].rounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[1]).toMatchObject({ n: 2, ask: 'bigger title', seconds: 50 });
    expect(rounds[1].failure).toBeUndefined();
  });

  it('keeps every round of a long project, past the ten changes the commission itself remembers', () => {
    const store = new MemoryStore(fresh());
    const c = store.remember(memo('site'), [], DAY);
    for (let i = 1; i <= 14; i++) store.revise(c.id, `change ${i}`, { result: 'done', choices: {}, round: stat(i) }, [], DAY);
    expect(store.get().projects[0].rounds).toHaveLength(15);
    expect(store.find(c.id)!.asks).toHaveLength(10);
  });

  it('follows its work to a folder the user moved', () => {
    const store = new MemoryStore(fresh());
    const c = store.remember(memo('page'), [], DAY);
    const moved = mkdtempSync(join(tmpdir(), 'lamplight-moved-'));
    store.relink(c.id, moved);
    expect(store.get().projects[0].folder).toBe(moved);
  });
});

describe('done or stopped', () => {
  it('is what the project\'s latest commission came to', () => {
    const store = new MemoryStore(fresh());
    store.remember(memo('stopped', 'failed'), [], DAY);
    const done = store.remember(memo('done'), [], DAY);
    store.revise(done.id, 'more', { result: 'failed', choices: {}, round: stat(5, 'network') }, [], DAY);
    const { projects, commissions } = store.get();
    expect(projects.map((p) => projectSettled(p, commissions))).toEqual(['stopped', 'done']);
  });
});

describe('commissions without a project', () => {
  const old = (id: string, extra: Partial<CommissionMemo> = {}): CommissionMemo => ({ id, title: `work ${id}`, date: '2026-10-20', result: 'done', choices: {}, folder: `C:/works/${id}`, ...extra });

  it('each get a project of one, numbered after the commission', () => {
    const m: Memory = { commissions: [old('c100'), old('c200', { result: 'failed' })], stuckNotes: [], projects: [] };
    expect(addProjects(m)).toEqual(['p100', 'p200']);
    expect(m.projects.map((p) => [p.id, p.title, p.folder, p.commissions])).toEqual([['p100', 'work c100', 'C:/works/c100', ['c100']], ['p200', 'work c200', 'C:/works/c200', ['c200']]]);
    expect(m.commissions.map((c) => c.project)).toEqual(['p100', 'p200']);
    expect(addProjects(m)).toEqual([]);
  });

  it('come back together when only their project was lost, the way an older version saving the notebook loses it', () => {
    const m: Memory = { commissions: [old('c100', { project: 'p100' }), old('c300'), old('c200', { project: 'p100', folder: 'C:/works/c100' })], stuckNotes: [], projects: [] };
    addProjects(m);
    expect(m.projects.map((p) => [p.id, p.commissions])).toEqual([['p100', ['c100', 'c200']], ['p300', ['c300']]]);
    expect(m.projects[0].rounds.map((r) => [r.n, r.commission])).toEqual([[1, 'c100'], [2, 'c200']]);
  });

  it('do not take the number of a project that is still there', () => {
    const m: Memory = {
      commissions: [old('c9', { project: 'p5' }), old('c5')], stuckNotes: [],
      projects: [{ id: 'p5', title: 'work c9', folder: 'C:/works/c9', created: '2026-10-20', commissions: ['c9'], rounds: [] }],
    };
    expect(addProjects(m)).toEqual(['p6']);
    expect(m.commissions[1].project).toBe('p6');
  });

  it('are given their project when the shop opens, and it is written down once', () => {
    const file = fresh();
    writeFileSync(file, JSON.stringify({ commissions: [old('c100'), old('c200')], stuckNotes: [] }));
    expect(new MemoryStore(file).get().projects.map((p) => p.id)).toEqual(['p100', 'p200']);
    const saved = readFileSync(file, 'utf8');
    expect(JSON.parse(saved).projects).toHaveLength(2);
    new MemoryStore(file);
    expect(readFileSync(file, 'utf8')).toBe(saved);
  });
});
