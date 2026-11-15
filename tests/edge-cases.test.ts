import { describe, expect, it } from 'vitest';
import { failureKind } from '../app/main/agent-runner';
import { continuePrompt } from '../app/main/commission';
import { EventNormalizer } from '../app/main/event-normalizer';

describe('why a run failed', () => {
  it('uses the API error the SDK reports', () => {
    expect(failureKind('billing_error', '')).toBe('billing');
    expect(failureKind('authentication_failed', '')).toBe('auth');
    expect(failureKind('rate_limit', '')).toBe('busy');
    expect(failureKind('overloaded', '')).toBe('busy');
  });

  it('falls back to the error text', () => {
    expect(failureKind(undefined, 'Your credit balance is too low')).toBe('billing');
    expect(failureKind(undefined, 'invalid x-api-key')).toBe('auth');
    expect(failureKind(undefined, 'Invalid API key · Fix external API key')).toBe('auth');
    expect(failureKind(undefined, 'API Error: 529 overloaded')).toBe('busy');
    expect(failureKind(undefined, 'getaddrinfo ENOTFOUND api.anthropic.com')).toBe('net');
    expect(failureKind(undefined, 'max turns reached')).toBe('failed');
  });
});

describe('normalizer: retries and cancelling', () => {
  const msg = (payload: object, t = 1) => ({ t, source: 'message' as const, name: 'system', payload });

  it('says "retrying" once per run of retries', () => {
    const n = new EventNormalizer();
    const kinds = [1, 2, 3].flatMap((attempt) => n.push(msg({ type: 'system', subtype: 'api_retry', attempt, max_retries: 10 })).map((e) => e.kind));
    expect(kinds).toEqual(['net_retry']);
  });

  it('turns a cancelled run into one event', () => {
    const n = new EventNormalizer();
    expect(n.push({ t: 1, source: 'runner', name: 'cancelled', payload: {} }).map((e) => e.kind)).toEqual(['cancelled']);
  });
});

describe('carrying on an unfinished commission', () => {
  it('continues the session when there is one, otherwise restarts from the folder', () => {
    expect(continuePrompt({ want: 'ledger' }, true)).toMatch(/Continue from where you left off/);
    const fresh = continuePrompt({ want: 'ledger' }, false);
    expect(fresh).toMatch(/ledger/);
    expect(fresh).toMatch(/already be in this folder/);
  });
});

describe('normalizer: waiting on the user', () => {
  it('no "long wait" or "thinking" while a permission card is open', () => {
    const n = new EventNormalizer({ longWaitMs: 1000, thinkingGapMs: 500 });
    const hook = (name: string, payload: object, t: number) => ({ t, source: 'hook' as const, name, payload: { hook_event_name: name, ...payload } });
    n.push({ t: 0, source: 'message', name: 'system', payload: { type: 'system', subtype: 'init' } });
    n.push(hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'b1', tool_input: { command: 'rm draft-1.html' } }, 10));
    n.push({ t: 20, source: 'permission', name: 'Bash', payload: { input: { command: 'rm draft-1.html' }, risk: 'serious' } });
    expect(n.tick(60_000)).toEqual([]);
    n.push({ t: 60_000, source: 'decision', name: 'Bash', payload: { choice: 'denied', risk: 'serious' } });
    expect(n.tick(120_000).map((e) => e.kind)).toContain('long_wait');
  });
});
