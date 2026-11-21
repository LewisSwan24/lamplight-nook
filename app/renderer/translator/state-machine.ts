import type { ActorId } from '../../shared/types';

/** Character states. */
export type ActorState =
  | 'idle' | 'ready'
  | 'working' | 'thinking' | 'stuck' | 'waiting'
  | 'asking' | 'reacting' | 'serious'
  | 'out' | 'returning' | 'checking'
  | 'wrapping' | 'low'
  | 'comfort';

export const ACTOR_STATES: ActorState[] = [
  'idle', 'ready', 'working', 'thinking', 'stuck', 'waiting', 'asking', 'reacting', 'serious',
  'out', 'returning', 'checking', 'wrapping', 'low', 'comfort',
];

const BUSY: ActorState[] = ['working', 'thinking', 'stuck', 'waiting', 'asking', 'checking'];

/** States reachable from anywhere: serious mode, wrap-up, failed wrap-up, idle. */
const FROM_ANY: ActorState[] = ['serious', 'wrapping', 'low', 'idle'];
const TRANSITIONS: Record<ActorState, ActorState[]> = {
  idle: ['ready', 'comfort'],
  ready: ['ready', 'out', ...BUSY],
  // Qingdai finishing a design goes straight back to ready, like Laoshi after a check.
  working: [...BUSY, 'ready'],
  thinking: BUSY,
  stuck: BUSY,
  waiting: BUSY,
  checking: [...BUSY, 'ready'],
  asking: ['reacting', ...BUSY],
  serious: ['reacting', ...BUSY],
  reacting: ['ready', ...BUSY],
  out: ['out', 'returning'],
  returning: ['ready', 'out'],
  wrapping: [],
  low: [],
  comfort: ['comfort'],
};

/** Where a transitional state lands once its action has finished playing. */
const SETTLE: Partial<Record<ActorState, ActorState>> = {
  returning: 'ready',
  reacting: 'working',
  wrapping: 'idle',
  low: 'idle',
  comfort: 'idle',
};

export function canMove(from: ActorState, to: ActorState): boolean {
  return FROM_ANY.includes(to) || TRANSITIONS[from].includes(to);
}

/**
 * One state per character, changed only along legal transitions.
 * Illegal transitions are dropped (e.g. Xiaoju can't be called back to write while she's out).
 */
export class StateMachine {
  private states = new Map<ActorId, ActorState>();

  get(actor: ActorId): ActorState {
    return this.states.get(actor) ?? 'idle';
  }

  /** Try to move to `to`; returns true on success. */
  move(actor: ActorId, to: ActorState): boolean {
    if (!canMove(this.get(actor), to)) return false;
    this.states.set(actor, to);
    return true;
  }

  /** Set a state outside the usual order: an errand to another shop (road-to-1.4.md D3) can start in the middle of work. */
  put(actor: ActorId, state: ActorState) {
    this.states.set(actor, state);
  }

  /** The current action finished: transitional states land on their next state. Returns the new state, or null if unchanged. */
  settle(actor: ActorId): ActorState | null {
    const next = SETTLE[this.get(actor)];
    if (!next) return null;
    this.states.set(actor, next);
    return next;
  }

  reset() {
    this.states.clear();
  }
}
