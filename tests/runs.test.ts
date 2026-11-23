import { describe, expect, it } from 'vitest';
import { MAX_RUNS, RunQueue, runId, type Active, type Ticket } from '../app/main/runs';

/** Two folders are the same work when one is inside the other, as overlapping lent folders are. */
const same = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const rich = () => true;
const ticket = (id: string, over: Partial<Ticket> = {}): Ticket => ({ id, by: 'user', ...over });
const ids = (ts: Ticket[]) => ts.map((t) => t.id);

describe('the queue of rounds (road-to-1.2.md B5)', () => {
  it('two at once at most, the rest wait for a free place', () => {
    expect(MAX_RUNS).toBe(2);
    const q = new RunQueue();
    for (const id of ['r1', 'r2', 'r3']) q.add(ticket(id, { folder: `/w/${id}` }));
    expect(ids(q.take([], same, rich))).toEqual(['r1', 'r2']);
    expect(q.queued.map((t) => [t.id, t.waits])).toEqual([['r3', 'slot']]);
    // One of the two ends: the third starts by itself.
    expect(ids(q.take([{ id: 'r2', folder: '/w/r2' }], same, rich))).toEqual(['r3']);
    expect(q.queued).toEqual([]);
  });

  it('rule 1: one round per project at a time, and overlapping lent folders count as the same', () => {
    const q = new RunQueue();
    q.add(ticket('r2', { folder: '/w/site', project: 'p1' }));
    q.add(ticket('r3', { folder: '/home/u/docs/sub' }));
    q.add(ticket('r4', { folder: '/w/other' }));
    const active: Active[] = [{ id: 'r1', folder: '/w/site', project: 'p1' }];
    expect(ids(q.take(active, same, rich))).toEqual(['r3']);
    expect(q.queued.map((t) => [t.id, t.waits])).toEqual([['r2', 'project'], ['r4', 'slot']]);
    // A lent folder inside another one at work is the same work.
    const q2 = new RunQueue();
    q2.add(ticket('r3', { folder: '/home/u/docs/sub' }));
    expect(q2.take([{ id: 'r0', folder: '/home/u/docs' }], same, rich)).toEqual([]);
    expect(q2.queued[0].waits).toBe('project');
    // A new commission has no folder yet, so it is never the same as anything.
    const q3 = new RunQueue();
    q3.add(ticket('r5'));
    q3.add(ticket('r6'));
    expect(ids(q3.take([], same, rich))).toEqual(['r5', 'r6']);
  });

  it('rule 1: a later round of the same project does not get ahead of one already waiting', () => {
    const q = new RunQueue();
    q.add(ticket('r2', { folder: '/w/a', project: 'p1' }));
    q.add(ticket('r3', { folder: '/w/a', project: 'p1' }));
    // r2 waits for money; r3 of the same project waits behind it rather than starting first.
    expect(q.take([], same, (t) => t.id !== 'r2')).toEqual([]);
    expect(q.queued.map((t) => [t.id, t.waits])).toEqual([['r2', 'money'], ['r3', 'project']]);
  });

  it('rule 2: first come first served, and what the user started goes before scheduled work', () => {
    const q = new RunQueue();
    q.add(ticket('r1', { by: 'schedule', folder: '/w/1' }));
    q.add(ticket('r2', { folder: '/w/2' }));
    q.add(ticket('r3', { by: 'schedule', folder: '/w/3' }));
    q.add(ticket('r4', { folder: '/w/4' }));
    expect(ids(q.queued as Ticket[])).toEqual(['r2', 'r4', 'r1', 'r3']);
    expect(ids(q.take([{ id: 'r0', folder: '/w/0' }], same, rich))).toEqual(['r2']);
  });

  it('rule 3: a round waiting in the queue can be called off, and nothing was held for it', () => {
    const q = new RunQueue();
    const held: string[] = [];
    q.add(ticket('r1', { folder: '/w/1' }));
    q.add(ticket('r2', { folder: '/w/2' }));
    q.add(ticket('r3', { folder: '/w/3' }));
    q.take([{ id: 'a', folder: '/w/a' }, { id: 'b', folder: '/w/b' }], same, (t) => { held.push(t.id); return true; });
    expect(held).toEqual([]);
    expect(q.cancel('r2')?.id).toBe('r2');
    expect(q.cancel('r2')).toBeUndefined();
    expect(ids(q.queued as Ticket[])).toEqual(['r1', 'r3']);
  });

  it('rule 4: a round stopped by its budget or the network holds no place; one waiting for an answer does', () => {
    const q = new RunQueue();
    q.add(ticket('r3', { folder: '/w/3' }));
    const answering: Active = { id: 'r1', folder: '/w/1' };
    const stopped: Active = { id: 'r2', folder: '/w/2', stopped: true };
    expect(ids(q.take([answering, stopped], same, rich))).toEqual(['r3']);
    q.add(ticket('r4', { folder: '/w/4' }));
    expect(q.take([answering, { id: 'r3', folder: '/w/3' }], same, rich)).toEqual([]);
    expect(q.queued[0].waits).toBe('slot');
    // A stopped round's folder is free for another round of the same work, too.
    const q2 = new RunQueue();
    q2.add(ticket('r5', { folder: '/w/2' }));
    expect(ids(q2.take([stopped], same, rich))).toEqual(['r5']);
  });

  it('rule 5: short of money it stays in the queue, marked as waiting for money, and later ones may go ahead', () => {
    const q = new RunQueue();
    q.add(ticket('r2', { folder: '/w/2', project: 'p2' }));
    q.add(ticket('r3', { folder: '/w/3', project: 'p3' }));
    // Project p2 is over its cap; p3 is not.
    expect(ids(q.take([], same, (t) => t.project !== 'p2'))).toEqual(['r3']);
    expect(q.queued.map((t) => [t.id, t.waits])).toEqual([['r2', 'money']]);
    // Asked again each time the queue moves: once the money is there, it starts.
    expect(q.take([{ id: 'r3', folder: '/w/3' }], same, () => false)).toEqual([]);
    expect(ids(q.take([], same, rich))).toEqual(['r2']);
  });
});

describe('run ids', () => {
  it('are r and the time, and never the same twice even within one millisecond', () => {
    expect(runId(1700000000000)).toBe('r1700000000000');
    expect(runId(1700000000000)).toBe('r1700000000001');
    expect(runId(1600000000000)).toBe('r1700000000002');
  });
});

// E7: a device removed while what it handed in still waits; that is called off at once, as if pressed at the desk.
describe('a removed device', () => {
  it('has what it left in the queue called off, and nothing else', () => {
    const q = new RunQueue();
    q.add(ticket('a', { person: 'd1' }));
    q.add(ticket('b'));
    q.add(ticket('c', { person: 'd1' }));
    q.add(ticket('d', { person: 'd2' }));
    expect(ids(q.cancelFrom('d1'))).toEqual(['a', 'c']);
    expect(ids([...q.queued])).toEqual(['b', 'd']);
    expect(q.cancelFrom('d1')).toEqual([]);
  });
});
