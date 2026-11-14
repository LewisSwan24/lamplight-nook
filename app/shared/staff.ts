import type { ActorId, AiEvent } from './types';

/** Who performs an agent's events. Unrecognized subagents are played by Xiaoju. */
export const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'xiaoju' };
