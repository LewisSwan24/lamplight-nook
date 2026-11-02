import { describe, expect, it } from 'vitest';
import { EventNormalizer } from '../app/main/event-normalizer';
import { boardWindow, plainTodo, stepCount, stepsOf, todosOf } from '../app/shared/board';
import { MINI_IDLE, type MiniEvent, nextMini } from '../app/shared/mini';
import type { RawAgentEvent } from '../app/shared/types';

const todo = (content: string, status: string) => ({ content, status, activeForm: content });
const list = (...statuses: string[]) => statuses.map((s, i) => todo(`Step ${i + 1}`, s));

describe('blackboard from Claude\'s to-do list', () => {
  it('reads the to-do list and leaves out anything malformed', () => {
    expect(todosOf({ todos: [todo('Write the page', 'in_progress'), { content: 3 }, null, todo('Check it', 'odd')] })).toEqual([
      { text: 'Write the page', status: 'in_progress' },
      { text: 'Check it', status: 'pending' },
    ]);
    expect(todosOf(undefined)).toEqual([]);
    expect(todosOf({ todos: 'no' })).toEqual([]);
  });

  it('puts each item in plain words: no folders, no Markdown, one short line', () => {
    expect(plainTodo('Write `C:\\Users\\sam\\work\\index.html`')).toBe('Write index.html');
    expect(plainTodo('**Check**   the\n page')).toBe('Check the page');
    const long = plainTodo('x'.repeat(80));
    expect(long.length).toBe(40);
    expect(long.endsWith('\u2026')).toBe(true);
  });

  it('marks done, under way and still to do', () => {
    expect(stepsOf(todosOf({ todos: list('completed', 'in_progress', 'pending') })).map((s) => s.status)).toEqual(['done', 'doing', 'todo']);
  });

  it('shows a short plan whole, and a long one around where the work is', () => {
    const short = stepsOf(todosOf({ todos: list('completed', 'pending') }));
    expect(boardWindow(short)).toEqual({ shown: short, more: 0 });
    const long = stepsOf(todosOf({ todos: list('completed', 'completed', 'completed', 'in_progress', 'pending', 'pending', 'pending', 'pending') }));
    const w = boardWindow(long);
    expect(w.shown.map((s) => s.label)).toEqual(['Step 3', 'Step 4', 'Step 5', 'Step 6']);
    expect(w.more).toBe(2);
    const start = boardWindow(stepsOf(todosOf({ todos: list('in_progress', 'pending', 'pending', 'pending', 'pending', 'pending') })));
    expect(start.shown[0].label).toBe('Step 1');
    expect(start.more).toBe(2);
    const end = boardWindow(stepsOf(todosOf({ todos: list('completed', 'completed', 'completed', 'completed', 'completed', 'in_progress') })));
    expect(end.shown.map((s) => s.label)).toEqual(['Step 3', 'Step 4', 'Step 5', 'Step 6']);
    expect(end.more).toBe(0);
  });

  it('counts "step n of total" from the item under way, or the next one', () => {
    expect(stepCount(todosOf({ todos: list('completed', 'in_progress', 'pending') }))).toEqual({ n: 2, total: 3 });
    expect(stepCount(todosOf({ todos: list('completed', 'pending', 'pending') }))).toEqual({ n: 2, total: 3 });
    expect(stepCount(todosOf({ todos: list('completed', 'completed') }))).toEqual({ n: 2, total: 2 });
    expect(stepCount([])).toBeUndefined();
  });
});

describe('normalizer: TodoWrite', () => {
  const hook = (t: number, todos: object[], agent?: string): RawAgentEvent => ({
    t, source: 'hook', name: 'PreToolUse',
    payload: { hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_use_id: `tw${t}`, tool_input: { todos }, ...(agent ? { agent_type: agent } : {}) },
  });

  it('turns the first list into a plan and later ones into progress, with the list attached', () => {
    const n = new EventNormalizer();
    const [first] = n.push(hook(1000, list('in_progress', 'pending')));
    expect(first.kind).toBe('plan');
    expect(first.todos?.map((t) => t.status)).toEqual(['in_progress', 'pending']);
    const [second] = n.push(hook(2000, list('completed', 'in_progress')));
    expect(second.kind).toBe('progress');
    expect(second.todos?.[0].status).toBe('completed');
  });

  it('keeps a subagent\'s own list off the board', () => {
    const n = new EventNormalizer();
    const out = n.push(hook(1000, list('pending'), 'researcher'));
    expect(out.every((e) => !e.todos)).toBe(true);
  });
});

describe('corner window: step n of total', () => {
  const ai = (kind: string, todos?: object[]): MiniEvent => ({ type: 'ai', event: { kind, agent: 'main', plain: '', todos: todos && todosOf({ todos }) } as never });

  it('follows the to-do list, keeps it while other work goes on, and forgets it on the next commission', () => {
    let s = [{ type: 'run', running: true } as MiniEvent, ai('plan', list('in_progress', 'pending', 'pending'))].reduce(nextMini, MINI_IDLE);
    expect(s.step).toEqual({ n: 1, total: 3 });
    s = nextMini(s, { type: 'ai', event: { kind: 'tool_start', agent: 'main', plain: 'writing' } });
    expect(s).toMatchObject({ what: 'writing', step: { n: 1, total: 3 } });
    s = nextMini(s, { type: 'ask', serious: false });
    s = nextMini(s, ai('progress', list('completed', 'in_progress', 'pending')));
    expect(s).toMatchObject({ status: 'waiting', step: { n: 2, total: 3 } });
    s = nextMini(s, { type: 'run', running: true });
    expect(s.step).toBeUndefined();
  });
});
