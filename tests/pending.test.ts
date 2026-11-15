import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Job, PendingStore } from '../app/main/pending';

/** A data folder of its own: the store keeps pending/<run>.json there, and an older version's pending.json beside it. */
function place() {
  const data = mkdtempSync(join(tmpdir(), 'lamplight-pending-'));
  return { data, dir: join(data, 'pending'), old: join(data, 'pending.json') };
}
const job = (run: string, over: Partial<Job> = {}): Job =>
  ({ run, state: 'running', form: { want: `work ${run}` }, workDir: `/work/${run}`, preexisting: [], startedAt: Number(run.slice(1)), ...over });

describe('unfinished rounds, one file each (road-to-1.2.md B7)', () => {
  it('keeps several rounds, each in pending/<run>.json, until each is cleared', () => {
    const { dir, old } = place();
    const store = new PendingStore(dir, old);
    expect(store.load()).toEqual([]);
    store.save(job('r2'));
    store.save(job('r1', { sessionId: 's1' }));
    store.save(job('r2', { sessionId: 's2' }));
    expect(readdirSync(dir).sort()).toEqual(['r1.json', 'r2.json']);
    expect(new PendingStore(dir, old).load()).toEqual([job('r1', { sessionId: 's1' }), job('r2', { sessionId: 's2' })]);
    store.clear('r1');
    expect(new PendingStore(dir, old).load()).toEqual([job('r2', { sessionId: 's2' })]);
    store.clear('r2');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('keeps all five states, with why a round failed and when', () => {
    const { dir, old } = place();
    const store = new PendingStore(dir, old);
    const five = [
      job('r1', { state: 'running' }),
      job('r2', { state: 'queued' }),
      job('r3', { state: 'stopped' }),
      job('r4', { state: 'failed', why: 'net', at: 40 }),
      job('r5', { state: 'interrupted', schedule: 's7' }),
    ];
    for (const j of five) store.save(j);
    expect(new PendingStore(dir, old).load()).toEqual(five);
  });

  it('converts the list B5 kept in pending.json, and the single job of 1.1, and removes the old file', () => {
    const { dir, old, data } = place();
    const b5 = [{ run: 'r10', form: { want: 'ledger' }, workDir: '/work/x', preexisting: [], sessionId: 's1', startedAt: 10 }];
    writeFileSync(old, JSON.stringify(b5));
    expect(new PendingStore(dir, old).load()).toEqual([{ ...b5[0], state: 'running' }]);
    expect(existsSync(old)).toBe(false);
    expect(readdirSync(dir)).toEqual(['r10.json']);

    const other = place();
    const v11 = { form: { want: 'notes' }, workDir: '/work/y', preexisting: [], startedAt: 7 };
    writeFileSync(other.old, JSON.stringify(v11));
    expect(new PendingStore(other.dir, other.old).load()).toEqual([{ ...v11, run: 'r7', state: 'running' }]);
    expect(existsSync(other.old)).toBe(false);
    expect(existsSync(data)).toBe(true);
  });

  it('reads no file whose name is not a run id, and puts no other name into a path', () => {
    const { dir, old } = place();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'evil.json'), JSON.stringify(job('r1')));
    writeFileSync(join(dir, 'r2.json'), '{"half');
    expect(new PendingStore(dir, old).load()).toEqual([]);
    expect(() => new PendingStore(dir, old).save(job('../r3'))).toThrow();
    expect(() => new PendingStore(dir, old).save(job('r3/..'))).toThrow();
  });

  it('hands a round over to be carried on once: stopped, failed or interrupted ones, and any left from before', () => {
    const { dir, old } = place();
    const before = new PendingStore(dir, old);
    before.save(job('r1', { state: 'running' }));
    const store = new PendingStore(dir, old);
    store.load();
    // Under way in this session: not to be carried on beside itself.
    store.save(job('r2', { state: 'running' }));
    store.save(job('r3', { state: 'failed', why: 'busy' }));
    expect(store.take('r2')).toBeUndefined();
    expect(store.take('r3')?.why).toBe('busy');
    expect(store.take('r3')).toBeUndefined();
    // Left over from a crash: offered, once.
    expect(store.left().map((j) => j.run)).toEqual(['r1']);
    expect(store.take('r1')?.run).toBe('r1');
    expect(store.left()).toEqual([]);
    expect(store.take('r1')).toBeUndefined();
    expect(new PendingStore(dir, old).load().map((j) => j.run)).toEqual(['r2']);
  });

  it('marks every round under way or waiting as interrupted when the computer shuts down, and keeps them', () => {
    const { dir, old } = place();
    const store = new PendingStore(dir, old);
    store.save(job('r1', { state: 'running' }));
    store.save(job('r2', { state: 'queued' }));
    store.save(job('r3', { state: 'failed', why: 'net' }));
    expect(store.interrupt(99).map((j) => j.run)).toEqual(['r1', 'r2']);
    expect(new PendingStore(dir, old).load().map((j) => [j.run, j.state])).toEqual([['r1', 'interrupted'], ['r2', 'interrupted'], ['r3', 'failed']]);
  });
});
