import type { Furnishings } from './furnish';
import type { Todo } from './board';
import type { SceneId } from './scenes';
import type { MiniState } from './mini';
// Types shared by the main and renderer processes.
import type { GrowthId, WorkIcon } from './growth';
import type { TemplateId } from './templates';

/** Scene anchors: characters only move between these points. */
export type AnchorId = 'door' | 'counter' | 'table' | 'board' | 'window' | 'shelf' | 'corner';

export type ActorId = 'adeng' | 'xiaoju' | 'laoshi' | 'qingdai' | 'cat';
/** Neighbours who drop in now and then: Auntie Gui from the bakery, Axin the postman, and those the work brings (game/guests.ts). */
export type GuestId = 'baker' | 'postman' | 'mechanic' | 'granny' | 'student';
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
  /**
   * The installed Claude Code's version, and how it compares with the one the shop was tried with
   * (app/main/claude-version.ts): `old` is worth an update, anything else is fine to use.
   */
  claudeVersion?: string; claudeCompat?: 'ok' | 'old' | 'newer' | 'unknown'; claudeTested?: string;
  /** The Microsoft Store build: the app does not run the remote installer itself, it only shows the steps. */
  store?: boolean;
  /** The official install command for this OS, shown when Claude Code is missing. */
  installCommand: string; platform: string;
};

/** What a letter to us is about: a problem with the app, or something the staff (the AI) made. */
export type Letter = { about: 'problem' | 'content'; diagnostics?: boolean; title?: string };

/** "Write to us": whether the mail program opened, the diagnostics file exported for it, or that the user cancelled the save. */
export type WriteResult = { opened: boolean; file?: string; cancelled?: boolean };

/** Saving a pasted key: `verified` is false when Anthropic could not be reached to check it. */
export type KeySaveResult = { ok: true; verified: boolean; hint: string } | { ok: false; reason: 'format' | 'invalid' | 'storage' };

/**
 * What the user set up: how to address them, where commissions are saved, sound, and whether
 * the scene also shows what is really happening underneath (detailed mode).
 */
/** volume is 0-100 and covers both effects and music. budgetUsd caps what one run may spend (0 = no cap). */
export type Settings = { name: string; /** The player's look in the shop, 1..AVATAR_COUNT (shared/avatars.ts). */ avatar: number; workRoot: string; onboarded: boolean; muted: boolean; detailed: boolean; volume: number; captions: boolean; reducedMotion: boolean; notify: boolean; closeToTray: boolean; /** A small window in the corner of the desktop while the shop is out of sight. */ mini: boolean; /** Where the shop is (shared/scenes.ts). */ scene: SceneId; /** How each scene is furnished (shared/furnish.ts). */ furnish: Furnishings; budgetUsd: number; language: LanguageChoice };

/** The app's language: one of the locales, or whatever the system uses. Takes effect on restart. */
export type LanguageChoice = 'system' | 'zh-CN' | 'en';

/** The per-run caps offered in settings, in US dollars; 0 means no cap. */
export const BUDGET_CHOICES = [1, 3, 5, 10, 0] as const;

/** Pages the renderer may open in the browser (install guides and credits). */
export type ExternalLink = 'claudeSetup' | 'apiKeys' | 'billing' | 'limezu' | 'music';

/** costUsd is Claude Code's estimate of what the session has cost so far; spentThisRun is this run's share of it. */
export type RunResult = { ok: boolean; recordingPath: string; workDir: string; error?: string; costUsd?: number; spentThisRun?: number; /** The agent's last reply on success. */ summary?: string; /** The technical reason, for the log. */ detail?: string };

/** Whitelisted API exposed to the renderer by the preload script. */
export type DataDamage = { notebook: 'restored' | 'lost' | 'missing' | null; settings: boolean; ledger: boolean };

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
  /**
   * Open the user's mail program with a letter to us. `diagnostics` exports the zip first; `about: 'content'`
   * reports something the staff (the AI) made, naming the commission.
   */
  writeToUs(letter: Letter): Promise<WriteResult>;
  /** Put the Claude Code install command on the clipboard. */
  copyInstallCommand(): Promise<void>;
  /** Run the official Claude Code installer; true once Claude Code can be found. */
  installClaude(): Promise<boolean>;
  /** Estimated spend on commissions this calendar month, in US dollars. */
  spendThisMonth(): Promise<number>;
  /** Every month that cost anything, newest first. */
  spendMonths(): Promise<{ month: string; usd: number; commissions: number }[]>;
  runDebugTask(kind: 'hello' | 'subagents'): Promise<RunResult>;
  /** Pick the file to edit or the folder to tidy; null if cancelled. */
  chooseSource(template: CommissionTemplate): Promise<SourcePick | null>;
  /** Files dragged onto the counter or the form (paths from pathsOf), or picked in a dialog when none are given. */
  handOver(paths: string[] | null, already: Material[]): Promise<HandOver>;
  /** The paths of files dropped on the page (the preload reads them; the page can't). */
  pathsOf(files: File[]): string[];
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
  /** What Adeng may bring up as a round of changes starts (what was asked last time). */
  recallForRevision(id: string): Promise<Recall>;
  /** What Adeng may bring up as the shop opens; each past commission is brought up only once. */
  recallOnOpen(): Promise<Recall>;
  /** Add a note from a meeting to the running commission; false if none is running or it has wrapped up. */
  addNote(text: string): Promise<boolean>;
  /** Everything in Adeng's notebook, for the user to read. */
  getMemory(): Promise<Memory>;
  /** What could not be read when the shop opened. Asking takes it: it is said once. */
  dataDamage(): Promise<DataDamage>;
  /** False, with nothing changed, while a commission runs. */
  clearMemory(): Promise<boolean>;
  /** Forget how the rounds went (the ledger page), keeping every work. */
  clearStats(): Promise<void>;
  /** Open the folder of a commission in the notebook; false if it is gone. */
  openCommissionFolder(id: string): Promise<boolean>;
  /** The shop's days and the works shelf. */
  shopState(): Promise<ShopState>;
  /** Open the main thing a finished commission made (or its folder); false if it is gone. */
  openWork(id: string): Promise<boolean>;
  /** A one-off story has been told; it won't come up again. */
  markTold(id: string): Promise<void>;
  markMet(id: GuestId): Promise<void>;
  /** A work's folder was moved: ask where it is now. 'wrong' means its main file isn't in the folder picked; 'taken' that another work is there. */
  relinkWork(id: string): Promise<'found' | 'wrong' | 'broad' | 'taken' | 'cancelled'>;
  /** Change finished work in its own folder, continuing where the staff left off. */
  reviseCommission(req: ReviseRequest): Promise<RunResult>;
  /** Put back the work as it was before the last round of changes; false if there is no such copy. */
  restorePrevious(id: string): Promise<boolean>;
  onRawEvent(cb: (e: RawAgentEvent) => void): () => void;
  onAiEvent(cb: (e: AiEvent) => void): () => void;
  onDecision(cb: (r: DecisionRequest) => void): () => void;
  onResult(cb: (r: CommissionResult) => void): () => void;
  /** The corner window (plan.md R3): its current state, updates to it, and bringing the shop back. */
  miniState(): Promise<MiniState>;
  onMiniState(cb: (s: MiniState) => void): () => void;
  showShop(): Promise<void>;
  /** Move the shop to another scene: saves it and reloads the page; false while a commission runs. */
  moveScene(scene: SceneId): Promise<boolean>;
}

/** Ready-made kinds of commission on the form; each shapes the prompt and what the shop prepares (shared/templates.ts). */
export type CommissionTemplate = TemplateId;

/**
 * The commission form: what the user wants, any particulars, who it's for.
 * source: the file to edit or the folder to tidy, as picked in the main process's dialog.
 * materials: files the user handed over (dropped or picked); copies go into the commission folder.
 */
export type CommissionForm = { want: string; details?: string; audience?: string; demo?: boolean; template?: CommissionTemplate; source?: string; materials?: string[] };

/** A file handed over with a commission. */
export type Material = { path: string; name: string; size: number };
/** What could be handed over, and what not and why. */
export type HandOver = { items: Material[]; refused: { name: string; why: 'folder' | 'too-big' | 'too-many' | 'missing' }[] };

/** A file or folder the user picked for a commission; error when it can't be used. */
export type SourcePick = { path: string; name: string } | { error: 'too-big' };

/** Files produced by a finished commission. */
/** costUsd: what this commission cost in all, as estimated (absent when unknown). */
export type CommissionResult = {
  /** Why it stopped, when it did. */
  error?: string;
  ok: boolean; workDir: string; files: string[]; main?: string; costUsd?: number;
  /** What the staff say they made, in their own words. */
  summary?: string;
  /** The commission's entry in Adeng's notebook, for asking for changes afterwards. */
  id?: string;
  /** What the shop gathered with this commission (a new commission done together), if anything. */
  grew?: GrowthId[];
  /** Rounds of changes so far (0 for the first go). */
  round?: number;
  /** The work as it was before this round is kept and can be put back. */
  canRestore?: boolean;
  /** Scripts it made that delete files or skip the preview: worth reading before a double click. */
  scripts?: ScriptCheck[];
};

/** Why a script the shop made needs a look: it deletes files, or it changes them without a preview first. */
export type ScriptRisk = 'deletes' | 'noPreview';
export type ScriptCheck = { file: string; risks: ScriptRisk[] };

/** Asking for changes to finished work: the notebook entry (the last commission when absent) and what to change. */
export type ReviseRequest = { id?: string; ask: string };

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
  miniState: 'mini:get',
  miniPush: 'mini:state',
  showShop: 'mini:show-shop',
  envStatus: 'env:status',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  chooseWorkRoot: 'settings:choose-work-root',
  openWorkRoot: 'settings:open-work-root',
  openLink: 'app:open-link',
  appVersion: 'app:version',
  locale: 'app:locale',
  scene: 'app:scene',
  moveScene: 'app:move-scene',
  relaunch: 'app:relaunch',
  legalNotices: 'app:legal-notices',
  saveApiKey: 'key:save',
  clearApiKey: 'key:clear',
  spendThisMonth: 'spend:month',
  spendMonths: 'spend:months',
  copyInstallCommand: 'setup:copy-install',
  installClaude: 'setup:install-claude',
  exportDiagnostics: 'app:export-diagnostics',
  writeToUs: 'app:write-to-us',
  runDebugTask: 'debug:run-task',
  rawEvent: 'ai:raw-event',
  aiEvent: 'ai:event',
  chooseSource: 'commission:choose-source',
  handOver: 'commission:hand-over',
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
  recallForRevision: 'memory:recall-revision',
  getMemory: 'memory:get',
  dataDamage: 'data:damage',
  addNote: 'commission:add-note',
  clearMemory: 'memory:clear',
  clearStats: 'memory:clear-stats',
  openCommissionFolder: 'memory:open-folder',
  reviseCommission: 'commission:revise',
  shopState: 'shop:state',
  openWork: 'shop:open-work',
  relinkWork: 'shop:relink-work',
  markTold: 'shop:mark-told',
  markMet: 'shop:mark-met',
  restorePrevious: 'commission:restore-previous',
} as const;

// -- Translation layer --

export type Risk = 'safe' | 'ask' | 'serious' | 'blocked';

export type AiEventKind =
  | 'session_start' | 'plan' | 'progress' | 'thinking'
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
  /** For `plan` and `progress` events from Claude's own to-do list: the whole list as it stands. */
  todos?: Todo[];
  raw?: unknown;
};

/** Mood bubbles shown above a character; `heart` is only for the cat. */
export type Bubble = 'idea' | 'sweat' | 'question' | 'note' | 'tea' | 'alert' | 'dots' | 'zzz' | 'heart';

export type CharacterCommand = {
  actor: ActorId;
  state: string;
  moveTo?: AnchorId;
  anim?: string;
  /** Something held in the hand during the animation (game/props.ts). */
  prop?: string;
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
  /** Estimated spend in US dollars, when known (all rounds of changes included). */
  costUsd?: number;
  /** What was asked for, so the work can be picked up again ("change it a bit"). Absent on old entries. */
  form?: CommissionForm;
  /** The SDK session of the last round, resumed when the user asks for changes. */
  sessionId?: string;
  /** Entries in the folder before the shop started (the user's own); never overwritten or rolled back. */
  preexisting?: string[];
  /** What the staff said they made, last round. */
  summary?: string;
  /** Each round of changes the user asked for afterwards, oldest first. */
  asks?: { ask: string; date: string }[];
  /** The main thing made, by name inside the folder (opened from the works shelf). */
  main?: string;
  /** How each round went, oldest first; kept on this computer only. Absent on works from before 1.1. */
  rounds?: RoundStat[];
};

/** One round of a commission, for the notebook's ledger page. Never leaves the computer. */
export type RoundStat = {
  /** YYYY-MM-DD */
  date: string;
  seconds: number;
  /** Why the round did not finish; absent when it did. */
  failure?: string;
  /** Errands sent out, by helper. */
  helpers: Partial<Record<AiEvent['agent'], number>>;
  /** Errands that waited for a busy helper, and how long they waited in all. */
  waits: number;
  waitedSeconds: number;
};

/** The shop's days with this user: commissions finished together, what the shop gathered and when, stories told. */
export type ShopDays = {
  done: number;
  grown: { id: GrowthId; date: string }[];
  told: string[];
  /** Who has been to the shop, and the day they first came. Absent in shops from before 1.0. */
  met?: { id: GuestId; date: string }[];
};

/** A finished piece of work on the works shelf. */
export type Work = { id: string; title: string; date: string; icon: WorkIcon; rounds: number; hasMain: boolean; want?: string };

/** What the shop looks like for this user: its days, and the finished works (latest first). */
export type ShopState = ShopDays & { works: Work[] };
/** A place where a commission got stuck ("pits we fell into together"). */
export type StuckNote = { commission: string; note: string; date: string };
export type Memory = {
  commissions: CommissionMemo[];
  stuckNotes: StuckNote[];
  /** Absent until the first commission is finished. */
  shop?: ShopDays;
  /** Id of the last commission already brought up when the app opened. */
  greeted?: string;
};
/** What may be brought up in a line: `when` flags that hold, and values for the line's placeholders. */
export type Recall = { flags: string[]; vars: Record<string, string> };
