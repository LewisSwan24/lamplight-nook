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
    expect(w.shown.map((s) => s.label)).toEqual(['Step 3', 'Step 4', 'Step 5']);
    expect(w.more).toBe(3);
    const start = boardWindow(stepsOf(todosOf({ todos: list('in_progress', 'pending', 'pending', 'pending', 'pending', 'pending') })));
    expect(start.shown[0].label).toBe('Step 1');
    expect(start.more).toBe(3);
    const end = boardWindow(stepsOf(todosOf({ todos: list('completed', 'completed', 'completed', 'completed', 'completed', 'in_progress') })));
    expect(end.shown.map((s) => s.label)).toEqual(['Step 4', 'Step 5', 'Step 6']);
    expect(end.more).toBe(0);
  });

  it('never chalks more than four lines: five cannot be read on a slate this small', () => {
    const lines = (n: number) => {
      const w = boardWindow(stepsOf(todosOf({ todos: list(...Array(n).fill('pending')) })));
      return w.shown.length + (w.more ? 1 : 0);
    };
    expect(lines(4)).toBe(4);
    expect(lines(5)).toBe(4);
    expect(lines(12)).toBe(4);
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

describe('normalizer: TaskCreate and TaskUpdate (Claude Code 2.1.3xx)', () => {
  let t = 0;
  const pre = (tool: string, input: object, id: string, agent?: string): RawAgentEvent => ({
    t: ++t * 1000, source: 'hook', name: 'PreToolUse',
    payload: { hook_event_name: 'PreToolUse', tool_name: tool, tool_use_id: id, tool_input: input, ...(agent ? { agent_type: agent } : {}) },
  });
  const post = (tool: string, response: object, id: string): RawAgentEvent => ({
    t: ++t * 1000, source: 'hook', name: 'PostToolUse',
    payload: { hook_event_name: 'PostToolUse', tool_name: tool, tool_use_id: id, tool_input: {}, tool_response: response },
  });

  it('builds the plan item by item and ticks items off by id', () => {
    const n = new EventNormalizer();
    const [first] = n.push(pre('TaskCreate', { subject: 'Write the page', description: 'index.html' }, 'c1'));
    expect(first.kind).toBe('plan');
    expect(first.todos).toEqual([{ text: 'Write the page', status: 'pending' }]);
    expect(n.push(post('TaskCreate', { task: { id: '7', subject: 'Write the page' } }, 'c1'))).toEqual([]);
    const [second] = n.push(pre('TaskCreate', { subject: 'Check it' }, 'c2'));
    expect(second.kind).toBe('progress');
    expect(second.todos?.map((x) => x.text)).toEqual(['Write the page', 'Check it']);
    const [doing] = n.push(pre('TaskUpdate', { taskId: '7', status: 'in_progress' }, 'u1'));
    expect(doing.todos?.map((x) => x.status)).toEqual(['in_progress', 'pending']);
    expect(n.push(post('TaskUpdate', { success: true, taskId: '7' }, 'u1'))).toEqual([]);
    // The create result for the second item was not seen: Claude Code's numbering stands in.
    const [done] = n.push(pre('TaskUpdate', { taskId: '2', status: 'completed' }, 'u2'));
    expect(done.todos?.map((x) => x.status)).toEqual(['in_progress', 'completed']);
    const [gone] = n.push(pre('TaskUpdate', { taskId: '7', status: 'deleted' }, 'u3'));
    expect(gone.todos).toEqual([{ text: 'Check it', status: 'completed' }]);
  });

  it('says nothing for lookups, unknown ids, or a helper\'s own list', () => {
    const n = new EventNormalizer();
    expect(n.push(pre('TaskList', {}, 'l1'))).toEqual([]);
    expect(n.push(post('TaskList', { tasks: [] }, 'l1'))).toEqual([]);
    expect(n.push(pre('TaskUpdate', { taskId: '3', status: 'completed' }, 'u1'))).toEqual([]);
    expect(n.push(pre('TaskCreate', { subject: 'Look things up' }, 'c1', 'researcher'))).toEqual([]);
  });
});

describe('normalizer: helpers sent off in the background', () => {
  const base = { t: 0 };
  const ev = (source: 'hook' | 'message', name: string, payload: object, t: number): RawAgentEvent => ({ ...base, t, source, name, payload });

  it('keeps a helper out until its notification, and waits for the last result', () => {
    const n = new EventNormalizer();
    const kinds = (e: RawAgentEvent) => n.push(e).map((x) => `${x.kind}:${x.agent}`);
    kinds(ev('hook', 'PreToolUse', { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'a1', tool_input: { subagent_type: 'designer', description: 'Pick colours' } }, 1000));
    expect(kinds(ev('hook', 'SubagentStart', { hook_event_name: 'SubagentStart', agent_type: 'designer', agent_id: 'x' }, 1100))).toEqual(['subagent_start:designer']);
    expect(kinds(ev('hook', 'PostToolUse', { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'a1', tool_response: { isAsync: true, status: 'async_launched' } }, 1200))).toEqual([]);
    expect(kinds(ev('message', 'result', { type: 'result', subtype: 'success', is_error: false }, 2000))).toEqual([]);
    expect(kinds(ev('message', 'system', { type: 'system', subtype: 'task_notification', tool_use_id: 'a1', summary: 'Mint it is' }, 3000))).toEqual(['subagent_stop:designer']);
    expect(kinds(ev('message', 'result', { type: 'result', subtype: 'success', is_error: false }, 4000))).toEqual(['done:main']);
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
