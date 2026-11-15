import { stepCount } from './board';
import { fill, type strings } from './i18n';
import type { AiEvent, Bubble } from './types';

/** The one line under the picture. What is happening already says it is busy, so the word is only the fallback. */
export function miniLine(s: MiniState, M: typeof strings.ui.mini): string {
  if (s.status !== 'working') return s.project ? `${s.project} · ${M[s.status]}` : M[s.status];
  const what = s.project ? `${s.project} · ${s.what || M.working}` : s.what || M.working;
  return s.step ? `${fill(M.step, { n: String(s.step.n), total: String(s.step.total) })} · ${what}` : what;
}

/** What the small corner window shows: Adeng at the counter, a mood bubble, and one line of status. */
export type MiniStatus = 'idle' | 'working' | 'waiting' | 'serious' | 'done' | 'failed';
export type MiniPose = 'idle' | 'read';
/**
 * step: where Claude's own to-do list is (item n of total), when it keeps one. project: with two rounds at once (B5), the
 * project the line is about.
 */
export type MiniState = { status: MiniStatus; pose: MiniPose; bubble?: Bubble; what?: string; step?: { n: number; total: number }; project?: string };

/**
 * What the main process tells the corner window about. Events from a round carry its run id, and its project's title when
 * two rounds are under way at once (B5); `running` is whether any round is.
 */
export type MiniEvent =
  | { type: 'run'; running: boolean }
  | { type: 'ai'; run?: string; project?: string; event: Pick<AiEvent, 'kind' | 'agent' | 'plain' | 'todos'> }
  | { type: 'ask'; serious: boolean; run?: string; project?: string }
  | { type: 'answered' }
  /** The user came back to the shop: what was finished has been seen. */
  | { type: 'seen' };

/** Nothing to do: Adeng stands at the counter with a cup of tea. */
export const MINI_IDLE: MiniState = { status: 'idle', pose: 'idle', bubble: 'tea' };

/**
 * The corner window's state, from the same real events the shop acts out (principle 2: nothing faked).
 * Pure, so it can be tested; the main process keeps the current state and sends it to the window.
 */
export function nextMini(s: MiniState, ev: MiniEvent): MiniState {
  const busy = s.status === 'waiting' || s.status === 'serious';
  switch (ev.type) {
    case 'run':
      if (ev.running) return { status: 'working', pose: 'idle', bubble: 'dots' };
      return s.status === 'done' || s.status === 'failed' ? s : MINI_IDLE;
    case 'ask':
      return { ...s, status: ev.serious ? 'serious' : 'waiting', pose: 'idle', bubble: 'alert', project: ev.project };
    case 'answered':
      return { ...s, status: 'working', bubble: undefined };
    case 'seen':
      return s.status === 'done' || s.status === 'failed' ? MINI_IDLE : s;
    case 'ai': {
      const e = ev.event;
      if (e.kind === 'done') return { status: 'done', pose: 'idle', bubble: 'heart', project: ev.project };
      if (e.kind === 'failed') return { status: 'failed', pose: 'idle', bubble: 'sweat', project: ev.project };
      if (e.kind === 'cancelled') return MINI_IDLE;
      // The to-do list moved on: remember where it is, whatever else is showing.
      const step = (e.kind === 'plan' || e.kind === 'progress') && e.agent === 'main' && e.todos ? stepCount(e.todos) : undefined;
      if (step) s = { ...s, step };
      // A card is waiting for the user: keep saying so until it is answered.
      if (busy) return s;
      s = { ...s, project: ev.project };
      if (e.kind === 'progress') return { ...s, status: 'working' };
      if (e.kind === 'session_start') return { status: 'working', pose: 'idle', bubble: 'dots', project: ev.project };
      if (e.kind === 'plan' || e.kind === 'thinking') return { ...s, status: 'working', pose: 'idle', bubble: 'dots' };
      if (e.kind === 'tool_start') return { ...s, status: 'working', pose: e.agent === 'main' ? 'read' : s.pose, bubble: undefined, what: e.plain || s.what };
      if (e.kind === 'subagent_start') return { ...s, status: 'working', bubble: 'idea', what: e.plain || s.what };
      if (e.kind === 'long_wait') return { ...s, status: 'working', pose: 'idle', bubble: 'tea' };
      if (e.kind === 'tool_fail' || e.kind === 'net_error' || e.kind === 'net_retry') return { ...s, status: 'working', bubble: 'sweat' };
      return s;
    }
  }
}
