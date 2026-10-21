// Types shared by the main and renderer processes.

/** Scene anchors: characters only move between these points. */
export type AnchorId = 'door' | 'counter' | 'table' | 'board' | 'window' | 'shelf' | 'corner';

export type ActorId = 'adeng' | 'xiaoju' | 'laoshi' | 'cat';

/** A raw SDK message, hook call or permission callback, recorded as-is. */
export type RawAgentEvent = {
  t: number;
  source: 'message' | 'hook' | 'permission' | 'decision' | 'runner';
  name: string;
  payload: unknown;
};

export type EnvStatus = { hasApiKey: boolean };

export type RunResult = { ok: boolean; recordingPath: string; workDir: string; error?: string };

/** Whitelisted API exposed to the renderer by the preload script. */
export interface LamplightApi {
  envStatus(): Promise<EnvStatus>;
  runDebugTask(kind: 'hello' | 'subagents'): Promise<RunResult>;
  startCommission(form: CommissionForm): Promise<RunResult>;
  answerDecision(answer: DecisionAnswer): Promise<boolean>;
  /** Open a file or folder produced by the current commission (refused outside it). */
  openOutput(path: string, how: 'open' | 'reveal'): Promise<boolean>;
  onRawEvent(cb: (e: RawAgentEvent) => void): () => void;
  onAiEvent(cb: (e: AiEvent) => void): () => void;
  onDecision(cb: (r: DecisionRequest) => void): () => void;
  onResult(cb: (r: CommissionResult) => void): () => void;
}

/** The commission form: what the user wants, any particulars, who it's for. */
export type CommissionForm = { want: string; details?: string; audience?: string; demo?: boolean };

/** Files produced by a finished commission. */
export type CommissionResult = { ok: boolean; workDir: string; files: string[]; main?: string };

export type DecisionOption = { id: string; label: string; hint?: string };

/**
 * Something only the user can decide. `question` comes from the AI asking; `permission` is an ordinary
 * permission check; `serious` is a risky step shown on the plain (non-watercolor) confirmation card.
 */
export type DecisionRequest = {
  id: string;
  kind: 'question' | 'permission' | 'serious';
  agent: AiEvent['agent'];
  tool: string;
  /** The question, or what is about to happen in plain words. */
  title: string;
  /** Why confirmation is needed. */
  reason?: string;
  /** Full command or path, shown collapsed. */
  detail?: string;
  options: DecisionOption[];
  /** Option focused by default (and chosen by Esc on the serious card). */
  defaultId: string;
};

export type DecisionAnswer = { id: string; choice: string };

export const IPC = {
  envStatus: 'env:status',
  runDebugTask: 'debug:run-task',
  rawEvent: 'ai:raw-event',
  aiEvent: 'ai:event',
  startCommission: 'commission:start',
  result: 'commission:result',
  openOutput: 'commission:open-output',
  decision: 'decision:request',
  answer: 'decision:answer',
} as const;

// -- Translation layer --

export type Risk = 'safe' | 'ask' | 'serious' | 'blocked';

export type AiEventKind =
  | 'session_start' | 'plan' | 'thinking'
  | 'tool_start' | 'tool_ok' | 'tool_fail'
  | 'long_wait'
  | 'subagent_start' | 'subagent_stop'
  | 'ask_user' | 'permission' | 'decision'
  | 'done' | 'failed' | 'net_error';

/** How the user answered a decision. */
export type Choice = 'picked' | 'delegated' | 'allowed' | 'denied';

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
  /** For `decision` events: how the user answered. */
  choice?: Choice;
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
