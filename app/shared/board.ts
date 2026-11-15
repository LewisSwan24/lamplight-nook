import { withoutPathFolders } from './text';

/** One item of Claude's own to-do list (the TodoWrite tool), as it arrives in the tool input. */
export type Todo = { text: string; status: 'pending' | 'in_progress' | 'completed' };

/** A line on the blackboard. */
export type BoardStep = { key: string; label: string; status: 'todo' | 'doing' | 'done' };

/** How many lines fit on the blackboard. */
export const BOARD_LINES = 4;
/** Longest to-do text kept, in characters; the chalk is small and the board narrow. */
const MAX_TEXT = 40;

/** Read the to-do list out of a TodoWrite tool input; anything malformed is left out. */
export function todosOf(input: unknown): Todo[] {
  const list = (input as { todos?: unknown } | null)?.todos;
  if (!Array.isArray(list)) return [];
  const out: Todo[] = [];
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const { content, status } = t as { content?: unknown; status?: unknown };
    const text = typeof content === 'string' ? plainTodo(content) : '';
    if (!text) continue;
    out.push({ text, status: status === 'completed' || status === 'in_progress' ? status : 'pending' });
  }
  return out;
}

/** A to-do in plain words: no folders in paths, no Markdown marks, one short line. */
export function plainTodo(text: string): string {
  const plain = withoutPathFolders(text)
    .replace(/[`*_#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > MAX_TEXT ? `${plain.slice(0, MAX_TEXT - 1).trimEnd()}…` : plain;
}

/** The blackboard steps for a to-do list. */
export function stepsOf(todos: Todo[]): BoardStep[] {
  return todos.map((t, i) => ({
    key: `todo-${i}`,
    label: t.text,
    status: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : 'todo',
  }));
}

/**
 * What fits on the board: everything when it is short; otherwise the last thing done, what is under way
 * and what comes next, with one more line saying how many are left after those.
 * Returns the steps to chalk and how many further steps are not shown.
 */
export function boardWindow(steps: BoardStep[], lines = BOARD_LINES): { shown: BoardStep[]; more: number } {
  if (steps.length <= lines) return { shown: steps, more: 0 };
  const room = lines - 1;
  const current = steps.findIndex((s) => s.status !== 'done');
  if (current < 0) return { shown: steps.slice(-room), more: 0 };
  const start = Math.max(0, Math.min(current - 1, steps.length - room));
  const shown = steps.slice(start, start + room);
  return { shown, more: steps.length - start - shown.length };
}

/**
 * Two rounds at once (road-to-1.2.md B9): the board splits into two columns of two lines each. A column shows the step
 * under way (or the next) and the one after it; once all is done, the last two.
 */
export function boardPair(steps: BoardStep[]): BoardStep[] {
  const current = steps.findIndex((s) => s.status !== 'done');
  const start = current < 0 ? steps.length - 2 : Math.min(current, steps.length - 2);
  return steps.slice(Math.max(0, start), Math.max(0, start) + 2);
}

/** Where the work is, for "step 3 of 5": the step under way (or the next one), and the total. */
export function stepCount(todos: Todo[]): { n: number; total: number } | undefined {
  if (!todos.length) return undefined;
  const doing = todos.findIndex((t) => t.status === 'in_progress');
  const done = todos.filter((t) => t.status === 'completed').length;
  const n = doing >= 0 ? doing + 1 : Math.min(done + 1, todos.length);
  return { n, total: todos.length };
}
