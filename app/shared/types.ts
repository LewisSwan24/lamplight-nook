// Types shared by the main and renderer processes.

/** Scene anchors: characters only move between these points. */
export type AnchorId = 'door' | 'counter' | 'table' | 'board' | 'window' | 'shelf' | 'corner';

export type ActorId = 'adeng' | 'xiaoju' | 'laoshi' | 'qingdai' | 'cat';
/** Neighbours who drop in now and then: Auntie Gui from the bakery and Axin the postman. */
export type GuestId = 'baker' | 'postman';
/** Anyone who can say something in the shop. */
export type Speaker = ActorId | GuestId;

/** A raw SDK message, hook call or permission callback, recorded as-is. */
export type RawAgentEvent = {
  t: number;
  source: 'message' | 'hook' | 'permission' | 'decision' | 'runner';
  name: string;
  payload: unknown;
};

/** Where the API key comes from: saved in the app, the ANTHROPIC_API_KEY variable, or a dev-only subscription. */
export type KeySource = 'stored' | 'env' | 'subscription' | null;

/**
 * `debug` is true in development or with LAMPLIGHT_DEBUG=1; the debug panel and debug tasks need it.
 * `keyHint` shows the saved key masked (sk-ant-...abcd); the key itself never leaves the main process.
 */
export type EnvStatus = {
  hasApiKey: boolean; hasClaude: boolean; debug: boolean; keySource: KeySource; keyHint?: string;
  /** The official install command for this OS, shown when Claude Code is missing. */
  installCommand: string; platform: string;
};

/** Saving a pasted key: `verified` is false when Anthropic could not be reached to check it. */
export type KeySaveResult = { ok: true; verified: boolean; hint: string } | { ok: false; reason: 'format' | 'invalid' | 'storage' };

/**
 * What the user set up: how to address them, where commissions are saved, sound, and whether
 * the scene also shows what is really happening underneath (detailed mode).
 */
/** volume is 0-100 and covers both effects and music. budgetUsd caps what one run may spend (0 = no cap). */
export type Settings = { name: string; workRoot: string; onboarded: boolean; muted: boolean; detailed: boolean; volume: number; captions: boolean; reducedMotion: boolean; notify: boolean; closeToTray: boolean; budgetUsd: number; language: LanguageChoice };

/** The app's language: one of the locales, or whatever the system uses. Takes effect on restart. */
export type LanguageChoice = 'system' | 'zh-CN' | 'en';

/** The per-run caps offered in settings, in US dollars; 0 means no cap. */
export const BUDGET_CHOICES = [1, 3, 5, 10, 0] as const;

/** Pages the renderer may open in the browser (install guides and credits). */
export type ExternalLink = 'claudeSetup' | 'apiKeys' | 'billing' | 'limezu' | 'music';

/** costUsd is Claude Code's estimate of what the session has cost so far. */
export type RunResult = { ok: boolean; recordingPath: string; workDir: string; error?: string; costUsd?: number; /** The technical reason, for the log. */ detail?: string };

/** Whitelisted API exposed to the renderer by the preload script. */
export interface LamplightApi {
  envStatus(): Promise<EnvStatus>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Let the user pick the folder commissions are saved in; resolves with the new settings, or null if cancelled. */
  chooseWorkRoot(): Promise<Settings | null>;
  openWorkRoot(): Promise<void>;
  openLink(link: ExternalLink): Promise<void>;
  appVersion(): Promise<string>;
  /** The third-party license list built with the app; null if it is missing. */
  legalNotices(): Promise<string | null>;
  /** Restart the app (to switch language); false while a commission is running. */
  relaunch(): Promise<boolean>;
  /** Check and save the user's API key (encrypted on this computer). */
  saveApiKey(key: string): Promise<KeySaveResult>;
  /** Forget the saved API key. */
  clearApiKey(): Promise<void>;
  /** Save a diagnostics zip where the user chooses; resolves with its path, or null if cancelled. */
  exportDiagnostics(): Promise<string | null>;
  /** Put the Claude Code install command on the clipboard. */
  copyInstallCommand(): Promise<void>;
  /** Estimated spend on commissions this calendar month, in US dollars. */
  spendThisMonth(): Promise<number>;
  runDebugTask(kind: 'hello' | 'subagents'): Promise<RunResult>;
  /** Pick the file to edit or the folder to tidy; null if cancelled. */
  chooseSource(kind: 'edit' | 'tidy'): Promise<SourcePick | null>;
  startCommission(form: CommissionForm): Promise<RunResult>;
  /** Run the last failed commission again, continuing its session; null if there is none. */
  retryCommission(): Promise<RunResult | null>;
  cancelCommission(): Promise<void>;
  /** A commission left unfinished when the app last closed, if any. */
  pendingCommission(): Promise<CommissionForm | null>;
  resumePending(): Promise<RunResult | null>;
  dropPending(): Promise<void>;
  answerDecision(answer: DecisionAnswer): Promise<boolean>;
  /** Open a file or folder produced by the current commission (refused outside it). */
  openOutput(path: string, how: 'open' | 'reveal'): Promise<boolean>;
  /** What Adeng may bring up as this commission starts (from earlier commissions). */
  recallForCommission(form: CommissionForm): Promise<Recall>;
  /** What Adeng may bring up as the shop opens; each past commission is brought up only once. */
  recallOnOpen(): Promise<Recall>;
  /** Add a note from a meeting to the running commission; false if none is running or it has wrapped up. */
  addNote(text: string): Promise<boolean>;
  /** Everything in Adeng's notebook, for the user to read. */
  getMemory(): Promise<Memory>;
  /** Forget everything in the notebook. */
  clearMemory(): Promise<void>;
  onRawEvent(cb: (e: RawAgentEvent) => void): () => void;
  onAiEvent(cb: (e: AiEvent) => void): () => void;
  onDecision(cb: (r: DecisionRequest) => void): () => void;
  onResult(cb: (r: CommissionResult) => void): () => void;
}

/** Ready-made kinds of commission on the form; each shapes the prompt and what the shop prepares. */
export type CommissionTemplate = 'page' | 'research' | 'edit' | 'tidy';

/**
 * The commission form: what the user wants, any particulars, who it's for.
 * source: the file to edit or the folder to tidy, as picked in the main process's dialog.
 */
export type CommissionForm = { want: string; details?: string; audience?: string; demo?: boolean; template?: CommissionTemplate; source?: string };

/** A file or folder the user picked for a commission; error when it can't be used. */
export type SourcePick = { path: string; name: string } | { error: 'too-big' };

/** Files produced by a finished commission. */
/** costUsd: what this commission cost in all, as estimated (absent when unknown). */
export type CommissionResult = { ok: boolean; workDir: string; files: string[]; main?: string; costUsd?: number };

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
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  chooseWorkRoot: 'settings:choose-work-root',
  openWorkRoot: 'settings:open-work-root',
  openLink: 'app:open-link',
  appVersion: 'app:version',
  locale: 'app:locale',
  relaunch: 'app:relaunch',
  legalNotices: 'app:legal-notices',
  saveApiKey: 'key:save',
  clearApiKey: 'key:clear',
  spendThisMonth: 'spend:month',
  copyInstallCommand: 'setup:copy-install',
  exportDiagnostics: 'app:export-diagnostics',
  runDebugTask: 'debug:run-task',
  rawEvent: 'ai:raw-event',
  aiEvent: 'ai:event',
  chooseSource: 'commission:choose-source',
  startCommission: 'commission:start',
  retryCommission: 'commission:retry',
  cancelCommission: 'commission:cancel',
  pendingCommission: 'commission:pending',
  resumePending: 'commission:resume-pending',
  dropPending: 'commission:drop-pending',
  result: 'commission:result',
  openOutput: 'commission:open-output',
  decision: 'decision:request',
  answer: 'decision:answer',
  recallForCommission: 'memory:recall-commission',
  recallOnOpen: 'memory:recall-open',
  getMemory: 'memory:get',
  addNote: 'commission:add-note',
  clearMemory: 'memory:clear',
} as const;

// -- Translation layer --

export type Risk = 'safe' | 'ask' | 'serious' | 'blocked';

export type AiEventKind =
  | 'session_start' | 'plan' | 'thinking'
  | 'tool_start' | 'tool_ok' | 'tool_fail'
  | 'long_wait'
  | 'subagent_start' | 'subagent_stop'
  | 'ask_user' | 'permission' | 'decision'
  | 'done' | 'failed' | 'net_error' | 'net_retry' | 'cancelled';

/** How the user answered a decision. */
export type Choice = 'picked' | 'delegated' | 'allowed' | 'denied';

export type AiEvent = {
  id: string;
  t: number;
  kind: AiEventKind;
  agent: 'main' | 'researcher' | 'designer' | 'reviewer' | 'unknown';
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

/** Mood bubbles shown above a character; `heart` is only for the cat. */
export type Bubble = 'idea' | 'sweat' | 'question' | 'note' | 'tea' | 'alert' | 'dots' | 'zzz' | 'heart';

export type CharacterCommand = {
  actor: ActorId;
  state: string;
  moveTo?: AnchorId;
  anim?: string;
  /** What the rule asked for before the sprite fallback (write, hammer, ...); sounds follow this, not the sprite. */
  action?: string;
  /**
   * flags: `when` conditions that currently hold (has_issues, has_memory, ...).
   * speaker: only pick lines spoken by this actor (for groups that mix speakers).
   */
  line?: { group: string; vars: Record<string, string>; flags?: string[]; speaker?: ActorId };
  bubble?: Bubble;
  priority: number;
};

/** One commission in Adeng's notebook (summaries only, never the conversation). */
export type CommissionMemo = {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  result: 'done' | 'failed';
  /** Question -> the option the user picked. */
  choices: Record<string, string>;
  folder: string;
  /** Estimated spend in US dollars, when known. */
  costUsd?: number;
};
/** A place where a commission got stuck ("pits we fell into together"). */
export type StuckNote = { commission: string; note: string; date: string };
export type Memory = {
  commissions: CommissionMemo[];
  stuckNotes: StuckNote[];
  /** Id of the last commission already brought up when the app opened. */
  greeted?: string;
};
/** What may be brought up in a line: `when` flags that hold, and values for the line's placeholders. */
export type Recall = { flags: string[]; vars: Record<string, string> };
