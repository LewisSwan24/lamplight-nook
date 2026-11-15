import { describe, expect, it } from 'vitest';
import { RoundTally } from '../app/main/tally';
import type { AiEvent } from '../app/shared/types';

const at = (kind: AiEvent['kind'], agent: AiEvent['agent'], seconds: number): AiEvent => ({ id: `${kind}-${seconds}`, t: seconds * 1000, kind, agent, plain: '' });

describe('what one round is tallied as', () => {
  it('counts the errands each helper took', () => {
    const tally = new RoundTally(0);
    for (const e of [at('subagent_start', 'researcher', 1), at('subagent_stop', 'researcher', 5), at('subagent_start', 'reviewer', 6), at('subagent_stop', 'reviewer', 9), at('subagent_start', 'researcher', 10), at('subagent_stop', 'researcher', 12)]) tally.see(e);
    expect(tally.result(20_000, true).helpers).toEqual({ researcher: 2, reviewer: 1 });
  });

  it('counts an errand that waited for a busy helper, and how long it waited', () => {
    const tally = new RoundTally(0);
    // Xiaoju takes researcher errands one at a time; Qingdai's errand runs alongside and waits for no one.
    for (const e of [at('subagent_start', 'researcher', 2), at('subagent_start', 'researcher', 3), at('subagent_start', 'designer', 4), at('subagent_stop', 'researcher', 10), at('subagent_stop', 'designer', 11), at('subagent_stop', 'researcher', 15)]) tally.see(e);
    const r = tally.result(30_000, true);
    expect(r.waits).toBe(1);
    expect(r.waitedSeconds).toBe(7);
  });

  it('plays an unknown helper as Xiaoju, so it waits behind a researcher', () => {
    const tally = new RoundTally(0);
    for (const e of [at('subagent_start', 'researcher', 1), at('subagent_start', 'unknown', 2), at('subagent_stop', 'researcher', 4)]) tally.see(e);
    expect(tally.result(10_000, true).waits).toBe(1);
  });

  it('keeps how long the round took and why it did not finish', () => {
    const tally = new RoundTally(1_000);
    const r = tally.result(91_400, false, 'net', new Date(2026, 10, 14));
    expect(r).toEqual({ date: '2026-11-14', seconds: 90, failure: 'net', helpers: {}, waits: 0, waitedSeconds: 0 });
    expect(tally.result(91_400, true).failure).toBeUndefined();
  });

  it('starts afresh when Claude Code starts a new session within the round', () => {
    const tally = new RoundTally(0);
    tally.see(at('subagent_start', 'researcher', 1));
    tally.see(at('session_start', 'main', 2));
    tally.see(at('subagent_start', 'researcher', 3));
    expect(tally.result(10_000, true).waits).toBe(0);
  });
});
