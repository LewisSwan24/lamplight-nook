import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Job, PendingStore } from '../app/main/pending';
import { estimateUsd } from '../app/main/prices';
import { AFTER_WAKE_MS, Sleep, resumeOnWake } from '../app/main/resume';
import { due } from '../app/main/schedule';
import type { Schedule } from '../app/shared/types';

const MIN = 60_000;
const job = (over: Partial<Job> = {}): Job => ({ run: 'r1', state: 'running', form: { want: 'notes' }, workDir: '/work/x', preexisting: [], startedAt: 1, ...over });

describe('carrying on after the computer slept (road-to-1.2.md B7)', () => {
  it('a network failure while asleep, or soon after waking, came from the sleep', () => {
    const sleep = new Sleep();
    expect(sleep.around(10 * MIN)).toBe(false);
    sleep.suspend(10 * MIN);
    expect(sleep.around(9 * MIN)).toBe(false);
    expect(sleep.around(11 * MIN)).toBe(true);
    sleep.resume(60 * MIN);
    expect(sleep.around(60 * MIN + AFTER_WAKE_MS)).toBe(true);
    expect(sleep.around(60 * MIN + AFTER_WAKE_MS + 1)).toBe(false);
  });

  it('carries on by itself once: only a network failure, and not one that was already carried on after waking', () => {
    const sleep = new Sleep();
    sleep.suspend(0);
    sleep.resume(5 * MIN);
    expect(resumeOnWake(job(), 'net', sleep, 5 * MIN)).toBe(true);
    expect(resumeOnWake(job({ autoResumed: true }), 'net', sleep, 5 * MIN)).toBe(false);
    expect(resumeOnWake(job(), 'busy', sleep, 5 * MIN)).toBe(false);
    expect(resumeOnWake(job(), 'cancelled', sleep, 5 * MIN)).toBe(false);
    expect(resumeOnWake(job(), 'net', new Sleep(), 5 * MIN)).toBe(false);
  });

  it('never carries the same round on twice: whoever asks second, the wake or the user, gets nothing', () => {
    const store = new PendingStore(join(mkdtempSync(join(tmpdir(), 'lamplight-resume-')), 'pending'), join(tmpdir(), 'none.json'));
    store.save(job({ state: 'failed', why: 'net' }));
    const first = store.take('r1');
    const second = store.take('r1');
    expect(first?.run).toBe('r1');
    expect(second).toBeUndefined();
  });
});

describe('a scheduled round that was interrupted (road-to-1.2.md B7)', () => {
  const daily: Schedule = { id: 's1', project: 'p1', form: { want: 'A daily note' }, every: { kind: 'daily', time: '09:00' }, next: new Date(2026, 10, 16, 9).toISOString(), enabled: true };

  it('is not run again at its next time, and that time does not count as missed', () => {
    const at = new Date(2026, 10, 16, 9, 30);
    expect(due(daily, at).run).toBe(true);
    const held = due(daily, at, true);
    expect(held.run).toBe(false);
    expect(held.missed).toEqual([]);
    expect(held.next).toBe(new Date(2026, 10, 17, 9).toISOString());
    // Days later, still waiting to be carried on: nothing missed either.
    expect(due(daily, new Date(2026, 10, 19, 10), true)).toMatchObject({ run: false, missed: [] });
  });
});

describe('what a stopped stretch cost, when Claude Code never said (road-to-1.2.md B7)', () => {
  it('estimates it from each message\'s tokens at the price per million', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 2_000_000 };
    // Sonnet-class: $3 in, $15 out, $0.30 cache read.
    expect(estimateUsd([usage], 'claude-sonnet-4-5')).toBeCloseTo(3 + 1.5 + 0.6, 6);
    expect(estimateUsd([usage], 'claude-opus-4-5')).toBeCloseTo(5 + 2.5 + 1, 6);
    // A model it does not know is priced as the default.
    expect(estimateUsd([usage], 'sim')).toBeCloseTo(estimateUsd([usage], 'claude-sonnet-4-5'), 6);
    expect(estimateUsd([], 'sim')).toBe(0);
  });
});
