// Types shared by the main and renderer processes.

/** Scene anchors: characters only move between these points. */
export type AnchorId = 'door' | 'counter' | 'table' | 'board' | 'window' | 'shelf' | 'corner';

export type ActorId = 'adeng' | 'xiaoju' | 'laoshi' | 'cat';

/** A raw SDK message, hook call or permission callback, recorded as-is. */
export type RawAgentEvent = {
  t: number;
  source: 'message' | 'hook' | 'permission' | 'runner';
  name: string;
  payload: unknown;
};

export type EnvStatus = { hasApiKey: boolean };

export type RunResult = { ok: boolean; recordingPath: string; workDir: string; error?: string };

/** Whitelisted API exposed to the renderer by the preload script. */
export interface LamplightApi {
  envStatus(): Promise<EnvStatus>;
  runDebugTask(kind: 'hello' | 'subagents'): Promise<RunResult>;
  onRawEvent(cb: (e: RawAgentEvent) => void): () => void;
  onAiEvent(cb: (e: AiEvent) => void): () => void;
}

export const IPC = {
  envStatus: 'env:status',
  runDebugTask: 'debug:run-task',
  rawEvent: 'ai:raw-event',
  aiEvent: 'ai:event',
} as const;

// -- Translation layer --

export type Risk = 'safe' | 'ask' | 'serious' | 'blocked';

export type AiEventKind =
  | 'session_start' | 'plan' | 'thinking'
  | 'tool_start' | 'tool_ok' | 'tool_fail'
  | 'long_wait'
  | 'subagent_start' | 'subagent_stop'
  | 'ask_user' | 'permission'
  | 'done' | 'failed' | 'net_error';

export type AiEvent = {
  id: string;
  t: number;
  kind: AiEventKind;
  agent: 'main' | 'researcher' | 'reviewer' | 'unknown';
  tool?: string;
  /** Human-readable target: file name, search query, host. Never a full path. */
  target?: string;
  /** Short plain-language description shown on character cards. */
  plain: string;
  risk?: Risk;
  /** Consecutive failures for this agent so far. */
  failStreak?: number;
  raw?: unknown;
};

export type Bubble = 'idea' | 'sweat' | 'question' | 'note' | 'tea' | 'alert' | 'dots' | 'zzz';

export type CharacterCommand = {
  actor: ActorId;
  state: string;
  moveTo?: AnchorId;
  anim?: string;
  /**
   * flags: `when` conditions that currently hold (has_issues, has_memory, ...).
   * speaker: only pick lines spoken by this actor (for groups that mix speakers).
   */
  line?: { group: string; vars: Record<string, string>; flags?: string[]; speaker?: ActorId };
  bubble?: Bubble;
  priority: number;
};
