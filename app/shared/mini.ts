import type { AiEvent, Bubble } from './types';

/** What the small corner window shows: Adeng at the counter, a mood bubble, and one line of status. */
export type MiniStatus = 'idle' | 'working' | 'waiting' | 'serious' | 'done' | 'failed';
export type MiniPose = 'idle' | 'read';
export type MiniState = { status: MiniStatus; pose: MiniPose; bubble?: Bubble; what?: string };

/** What the main process tells the corner window about. */
export type MiniEvent =
  | { type: 'run'; running: boolean }
  | { type: 'ai'; event: Pick<AiEvent, 'kind' | 'agent' | 'plain'> }
  | { type: 'ask'; serious: boolean }
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
      return { ...s, status: ev.serious ? 'serious' : 'waiting', pose: 'idle', bubble: 'alert' };
    case 'answered':
      return { ...s, status: 'working', bubble: undefined };
    case 'seen':
      return s.status === 'done' || s.status === 'failed' ? MINI_IDLE : s;
    case 'ai': {
      const e = ev.event;
      if (e.kind === 'done') return { status: 'done', pose: 'idle', bubble: 'heart' };
      if (e.kind === 'failed') return { status: 'failed', pose: 'idle', bubble: 'sweat' };
      if (e.kind === 'cancelled') return MINI_IDLE;
      // A card is waiting for the user: keep saying so until it is answered.
      if (busy) return s;
      if (e.kind === 'session_start' || e.kind === 'plan' || e.kind === 'thinking') return { ...s, status: 'working', pose: 'idle', bubble: 'dots' };
      if (e.kind === 'tool_start') return { status: 'working', pose: e.agent === 'main' ? 'read' : s.pose, bubble: undefined, what: e.plain || s.what };
      if (e.kind === 'subagent_start') return { ...s, status: 'working', bubble: 'idea', what: e.plain || s.what };
      if (e.kind === 'long_wait') return { ...s, status: 'working', pose: 'idle', bubble: 'tea' };
      if (e.kind === 'tool_fail' || e.kind === 'net_error' || e.kind === 'net_retry') return { ...s, status: 'working', bubble: 'sweat' };
      return s;
    }
  }
}
