import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EventNormalizer, normalizeAll, targetOf } from '../app/main/event-normalizer';
import { fill, strings } from '../app/shared/i18n';
import type { RawAgentEvent } from '../app/shared/types';

const E = strings.events;
const V = strings.verbs;

// A real run (two subagents), anonymized. Its text content is Chinese because the agents reply in Chinese.
const recording: RawAgentEvent[] = readFileSync(join(__dirname, '..', 'demo', 'subagents.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const t0 = recording[0].t;
const hook = (name: string, payload: object, t = 0): RawAgentEvent => ({ t: t0 + t, source: 'hook', name, payload: { hook_event_name: name, ...payload } });
const msg = (payload: object, t = 0): RawAgentEvent => ({ t: t0 + t, source: 'message', name: String((payload as { type: string }).type), payload });

describe('normalizer: real recording', () => {
  const events = normalizeAll(recording);
  const seq = events.map((e) => `${e.kind}:${e.agent}`);

  it('follows the storyboard: open, researcher out and back, write, reviewer checks, think, revise, done', () => {
    expect(seq).toEqual([
      'session_start:main',
      'subagent_start:researcher',
      'tool_start:researcher',
      'tool_ok:researcher',
      'subagent_stop:researcher',
      'tool_start:main',
      'tool_ok:main',
      'subagent_start:reviewer',
      'tool_start:reviewer',
      'tool_ok:reviewer',
      'subagent_stop:reviewer',
      'thinking:main',
      'tool_start:main',
      'tool_ok:main',
      'thinking:main', // 5.9 s of silence between the revision and the wrap-up is inferred as thinking
      'done:main',
    ]);
  });

  it('plain text and targets never include full paths', () => {
    const write = events.find((e) => e.kind === 'tool_start' && e.tool === 'Write')!;
    expect(write.target).toBe('notes.md');
    expect(write.plain).toBe(fill(E.tool_target, { verb: V.Write, target: 'notes.md' }));
    const search = events.find((e) => e.tool === 'WebSearch')!;
    expect(search.plain).toBe(fill(E.searching_target, { target: search.target! }));
    for (const e of events) expect(`${e.target ?? ''}${e.plain}`).not.toMatch(/Users\\|Documents/);
  });

  it('a returning subagent carries its conclusion', () => {
    const back = events.find((e) => e.kind === 'subagent_stop' && e.agent === 'reviewer')!;
    expect(back.target).toContain('基本通过'); // "mostly passes", from the reviewer's real summary
  });

  it('merges three consecutive thinking_tokens messages into one', () => {
    expect(events.filter((e) => e.kind === 'thinking')).toHaveLength(2);
  });

  it('does not infer thinking for the main agent while a subagent is out', () => {
    const researcherBack = events.findIndex((e) => e.kind === 'subagent_stop' && e.agent === 'researcher');
    const firstThink = events.findIndex((e) => e.kind === 'thinking');
    expect(firstThink).toBeGreaterThan(researcherBack);
  });
});

describe('normalizer: cases not in the recording', () => {
  it('counts consecutive failures, resets on success, and never double-counts hook + tool_result', () => {
    const n = new EventNormalizer();
    const pre = (id: string) => hook('PreToolUse', { tool_name: 'Bash', tool_use_id: id, tool_input: { command: 'node check.js' } });
    const fail = (id: string) => hook('PostToolUseFailure', { tool_name: 'Bash', tool_use_id: id, tool_input: { command: 'node check.js' } });
    const errResult = (id: string) => msg({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true }] } });
    n.push(pre('a'));
    expect(n.push(fail('a'))[0]).toMatchObject({ kind: 'tool_fail', failStreak: 1, target: 'node check.js' });
    expect(n.push(errResult('a'))).toEqual([]);
    n.push(pre('b'));
    expect(n.push(errResult('b'))[0]).toMatchObject({ kind: 'tool_fail', failStreak: 2 });
    n.push(pre('c'));
    expect(n.push(hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'c' }))[0]).toMatchObject({ kind: 'tool_ok', failStreak: 0 });
  });

  it('emits long_wait once when a shell command runs past 30 s', () => {
    const n = new EventNormalizer();
    n.push(hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'x', tool_input: { command: 'npm install' } }, 0));
    expect(n.tick(t0 + 29_000).map((e) => e.kind)).toEqual([]);
    expect(n.tick(t0 + 31_000).map((e) => e.kind)).toEqual(['long_wait']);
    expect(n.tick(t0 + 40_000).map((e) => e.kind)).toEqual([]);
  });

  it('questions become ask_user; safe permissions are silent; serious ones carry their risk', () => {
    const n = new EventNormalizer();
    const perm = (name: string, payload: object): RawAgentEvent => ({ t: t0, source: 'permission', name, payload });
    expect(n.push(perm('AskUserQuestion', { input: { questions: [{ question: 'Which accent color?' }] } }))[0])
      .toMatchObject({ kind: 'ask_user', target: 'Which accent color?' });
    expect(n.push(perm('Write', { input: { file_path: 'a.html' }, risk: 'safe' }))).toEqual([]);
    expect(n.push(perm('Bash', { input: { command: 'rm draft.html' }, risk: 'serious' }))[0])
      .toMatchObject({ kind: 'permission', risk: 'serious', plain: fill(E.permission_target, { verb: V.Bash, target: 'rm draft.html' }) });
  });

  it('attributes a subagent permission request by agent_id', () => {
    const n = new EventNormalizer();
    n.push(hook('SubagentStart', { agent_type: 'reviewer', agent_id: 'r1' }));
    const out = n.push({ t: t0, source: 'permission', name: 'Bash', payload: { input: { command: 'rm a' }, risk: 'serious', agent_id: 'r1' } });
    expect(out[0]).toMatchObject({ kind: 'permission', agent: 'reviewer' });
  });

  it('separates network errors from other failures', () => {
    expect(new EventNormalizer().push(msg({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['fetch failed: ECONNRESET'] }))[0].kind).toBe('net_error');
    expect(new EventNormalizer().push(msg({ type: 'result', subtype: 'error_max_turns', is_error: true }))[0].kind).toBe('failed');
  });

  it('a text-only reply that lists steps becomes a plan', () => {
    const n = new EventNormalizer();
    const out = n.push(msg({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'Plan:\n1. research\n2. write the page\n3. check' }] } }));
    expect(out[0]).toMatchObject({ kind: 'plan', target: fill(E.planSteps, { n: 3 }) });
  });

  it('extracts readable targets', () => {
    expect(targetOf('WebFetch', { url: 'https://dribbble.com/shots/1' })).toBe('dribbble.com');
    expect(targetOf('Edit', { file_path: 'C:\\Users\\x\\a\\style.css' })).toBe('style.css');
  });
});

describe('normalizer: connection tools by their kind (road-to-1.3.md C8)', () => {
  it('names a connection\'s tool by the kind of connection, so the shop can play it whatever its number', () => {
    const n = new EventNormalizer({ toolName: (name) => name.replace('mcp__nook-k17__', 'mcp__nook-calendar__') });
    n.push(hook('PreToolUse', { tool_name: 'Read', tool_use_id: 'r', tool_input: { file_path: 'a.md' } }));
    const start = n.push(hook('PreToolUse', { tool_name: 'mcp__nook-k17__events', tool_use_id: 'e', tool_input: { from: '2026-11-20', to: '2026-11-21' } }));
    expect(start.find((e) => e.kind === 'tool_start')).toMatchObject({ tool: 'mcp__nook-calendar__events' });
    expect(n.push(hook('PostToolUse', { tool_name: 'mcp__nook-k17__events', tool_use_id: 'e' }))[0]).toMatchObject({ kind: 'tool_ok', tool: 'mcp__nook-calendar__events' });
  });
});
