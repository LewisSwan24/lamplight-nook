import type { Furnishings } from './furnish';
import type { Todo } from './board';
import type { SceneId } from './scenes';
import type { MiniState } from './mini';
// Types shared by the main and renderer processes.
import type { GrowthId, WorkIcon } from './growth';
import type { TemplateId } from './templates';

/** Scene anchors: characters only move between these points. */
export type AnchorId = 'door' | 'counter' | 'table' | 'board' | 'window' | 'shelf' | 'corner';

export type ActorId = 'adeng' | 'xiaoju' | 'laoshi' | 'qingdai' | 'xiaodou' | 'cat';
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

/** A new version of the shop, for the postman's letter: its number and what is new in it, line by line ("· " starts a list item). */
export type UpdateOffer = { version: string; notes: string[] };

/** The Store build's first open, when the installer build on the same computer has a shop: how many works it holds and what its ledger adds up to (road-to-1.1.md A2). */
export type MoveOffer = { works: number; spentUsd: number };

/** Saving a pasted key:`verified` is false when Anthropic could not be reached to check it. */
export type KeySaveResult = { ok: true; verified: boolean; hint: string } | { ok: false; reason: 'format' | 'invalid' | 'storage' };

/**
 * What the user set up: how to address them, where commissions are saved, sound, and whether
 * the scene also shows what is really happening underneath (detailed mode).
 */
/** volume is 0-100 and covers both effects and music. budgetUsd caps what one run may spend (0 = no cap). */
export type Settings = { name: string; /** The player's look in the shop, 1..AVATAR_COUNT (shared/avatars.ts). */ avatar: number; workRoot: string; onboarded: boolean; muted: boolean; detailed: boolean; volume: number; captions: boolean; reducedMotion: boolean; notify: boolean; closeToTray: boolean; /** Open in the tray when the computer starts (road-to-1.2.md B6); never in the Store build. */ openAtLogin: boolean; /** Scheduled commissions are paused, from the tray's menu (B6). */ schedulesPaused: boolean; /** Every connection is paused, from settings (road-to-1.3.md C6). */ connectionsPaused: boolean; /** A small window in the corner of the desktop while the shop is out of sight. */ mini: boolean; /** Look for new versions (never in the Store build); downloading still waits for the user. */ updates: boolean; /** Where the shop is (shared/scenes.ts). */ scene: SceneId; /** How each scene is furnished (shared/furnish.ts). */ furnish: Furnishings; budgetUsd: number; /** The most all rounds may spend in a calendar month (0 = no cap; road-to-1.2.md B8). */ monthCapUsd: number; language: LanguageChoice };

/** The app's language: one of the locales, or whatever the system uses. Takes effect on restart. */
export type LanguageChoice = 'system' | 'zh-CN' | 'en';

/** The per-run caps offered in settings, in US dollars; 0 means no cap. */
export const BUDGET_CHOICES = [1, 3, 5, 10, 0] as const;
/** The monthly caps offered in settings, smallest first; 0 means no cap. */
export const MONTH_CAP_CHOICES = [10, 20, 50, 100, 0] as const;
/** The caps a project may have, in US dollars; 0 means no cap, which is where every project starts. */
export const PROJECT_CAP_CHOICES = [0, 5, 10, 20, 50] as const;
/** What the staff remember about a project (B3): this many preferences at most, of so many characters; and how long "where the last round left off" may be. */
export const BRIEF_PREFS_MAX = 12;
export const BRIEF_PREF_CHARS = 120;
export const BRIEF_LAST_ROUND_CHARS = 500;
/** The most one talk with Adeng before a commission may cost, in US dollars, and the most the user may say in it (Q-B1). */
export const CONSULT_CAP_USD = 0.1;
export const CONSULT_MESSAGES = 10;

/** Pages the renderer may open in the browser (install guides and credits). */
export type ExternalLink = 'claudeSetup' | 'apiKeys' | 'billing' | 'limezu' | 'music';

/** costUsd is Claude Code's estimate of what the session has cost so far; spentThisRun is this run's share of it. */
/** A round left unfinished, as the card at opening lists it (road-to-1.2.md B7). */
export type PendingRound = { run: string; state: 'running' | 'queued' | 'stopped' | 'failed' | 'interrupted'; form: CommissionForm; title: string };

export type RunResult = { /** The round's run id (B5), for trying it again. */ run?: string; ok: boolean; recordingPath: string; workDir: string; error?: string; costUsd?: number; spentThisRun?: number; /** The agent's last reply on success. */ summary?: string; /** The technical reason, for the log. */ detail?: string;
  /** Input tokens the last result reported, cache reads and writes included. */ contextTokens?: number;
  /** A month or project cap stopped it (error monthCap or projectCap). */ cap?: BudgetNote;
  /** carryOn: stopped with work under way, so trying again carries it on once the cap allows. */ carryOn?: boolean;
  /** Caps this round took past eight tenths, said once each. */ budget?: BudgetNote[];
  /** What the stretch since Claude Code last reported cost, estimated from its tokens: it stopped before saying (B7). */ estimatedUsd?: number;
  /** The web addresses this round searched or fetched, for checking a write-up's sources (road-to-1.3.md C7). */ seenUrls?: string[] };

/** Where a month's or a project's cap stands (road-to-1.2.md B8), with the project's title for a project cap. */
export type BudgetNote = { cap: 'month' | 'project'; capUsd: number; spentUsd: number; leftUsd: number; project?: string };

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
  spendMonths(): Promise<{ month: string; usd: number; estimated?: number; commissions: number }[]>;
  /** This month's cap (0: none) and what has been spent under it. */
  monthBudget(): Promise<{ capUsd: number; spentUsd: number }>;
  /** The monthly cap, when it was set above the default on upgrading from what was spent before. Asking takes it: it is said once. */
  monthCapNews(): Promise<number | null>;
  /**
   * One line in a talk with Adeng before a commission (B4): a new talk when `id` is null. `files` are the files handed over
   * so far; only their names go to Claude.
   */
  consult(id: string | null, text: string, files: string[]): Promise<ConsultReply>;
  /** "Write it up as a slip": the slip from the talk, for the user to look over. */
  consultFinish(id: string): Promise<ConsultBrief>;
  /** What the talks with Adeng this month cost, and how many there were. */
  consultsThisMonth(): Promise<{ count: number; usd: number }>;
  /** The connections (road-to-1.3.md C4) and the kinds that can be added. */
  connections(): Promise<ConnectionsView>;
  /** "Connect" on a kind's authorisation card: the connection made, or null when the system cannot keep its secret safe. */
  /** Make a connection of this kind after its card said yes; `input` is what the card asked for (C5). */
  addConnection(kind: ConnectionKind, input?: { address?: string }): Promise<Connection | { error: SetupError } | null>;
  pauseConnection(id: string, on: boolean): Promise<boolean>;
  /** Disconnect: its secret and its settings are gone. */
  removeConnection(id: string): Promise<boolean>;
  /** The record of outside actions (road-to-1.3.md C6), oldest first. */
  actions(): Promise<ActionRecord[]>;
  /** Undo an outside action from its record: false when it cannot be (already undone, or not the shop's to remove). */
  undoAction(id: string): Promise<boolean>;
  /** Set the most a project may cost (one of PROJECT_CAP_CHOICES; 0 for none); false for a project or amount there isn't. */
  setProjectCap(id: string, usd: number): Promise<boolean>;
  runDebugTask(kind: 'hello' | 'subagents'): Promise<RunResult>;
  /** Pick the file to edit or the folder to tidy; null if cancelled. */
  chooseSource(template: CommissionTemplate): Promise<SourcePick | null>;
  /** Pick a folder of the user's own for the shop to work in; null if cancelled, an error if it can't be lent. */
  chooseLent(): Promise<SourcePick | null>;
  /** Files dragged onto the counter or the form (paths from pathsOf), or picked in a dialog when none are given. */
  handOver(paths: string[] | null, already: Material[]): Promise<HandOver>;
  /** The paths of files dropped on the page (the preload reads them; the page can't). */
  pathsOf(files: File[]): string[];
  startCommission(form: CommissionForm): Promise<RunResult>;
  /** Run a failed round again by its run id, continuing its session; null if there is none. */
  retryCommission(run?: string): Promise<RunResult | null>;
  /** Stop a round under way, or call one off that waits in the queue (B5), by its run id. */
  cancelCommission(run: string): Promise<void>;
  /** The rounds under way and waiting in the queue, whenever that changes (B5). */
  onRuns(cb: (runs: RunInfo[]) => void): () => void;
  /** Rounds left unfinished when the app last closed: crashed, stopped, failed or interrupted by a shutdown (B7). */
  pendingRounds(): Promise<PendingRound[]>;
  resumePending(run: string): Promise<RunResult | null>;
  dropPending(run: string): Promise<void>;
  answerDecision(answer: DecisionAnswer): Promise<boolean>;
  /**
   * Open a file or folder produced by the current commission (refused outside it). ok is false when refused; why says
   * an Office file was shown in its folder instead of opened, and why (road-to-1.3.md C1).
   */
  openOutput(path: string, how: 'open' | 'reveal'): Promise<{ ok: boolean; why?: NotOpened }>;
  /** Open source n of a round's research write-up in the browser (road-to-1.3.md C7); false when there is no such web address. */
  openSource(run: string, n: number): Promise<boolean>;
  /** What Adeng may bring up as this commission starts (from earlier commissions). */
  recallForCommission(form: CommissionForm): Promise<Recall>;
  /** What Adeng may bring up as a round of changes starts (what was asked last time). */
  recallForRevision(id: string): Promise<Recall>;
  /** What Adeng may bring up as the shop opens; each past commission is brought up only once. */
  recallOnOpen(): Promise<Recall>;
  /**
   * Add a note from a meeting to a round under way (B9: the one the meeting was called for), or to the first under way;
   * false if none is running or it has wrapped up.
   */
  addNote(text: string, run?: string): Promise<boolean>;
  /** Everything in Adeng's notebook, for the user to read. */
  getMemory(): Promise<Memory>;
  /** What could not be read when the shop opened. Asking takes it: it is said once. */
  dataDamage(): Promise<DataDamage>;
  /** The Store build's first open: the installer build's shop to bring over, or null. Asking takes it: it is offered once a start. */
  moveInOffer(): Promise<MoveOffer | null>;
  /** The answer to that. Yes copies it over (the original stays where it is); false when the copy failed. */
  moveIn(yes: boolean): Promise<boolean>;
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
  /**
   * Undo a commission done in the user's own folder: their files back as they were, the new ones gone. Resolves with
   * what could not be put back because a link leads out of the folder (empty when all went back); null if nothing to undo.
   */
  undoWork(id: string): Promise<string[] | null>;
  /** Save a finished work as a file where the user picks: its files in a zip, or its page as a PDF. Nothing is sent anywhere. */
  exportWork(id: string, as: 'zip' | 'pdf'): Promise<ExportResult>;
  /** The project board (B2): every project, latest touched first. */
  projectBoard(): Promise<ProjectRow[]>;
  /** A project's timeline, one row per round; null for a project there isn't. */
  projectTimeline(id: string): Promise<ProjectTimeline | null>;
  /** Open a round's version from a copy made for looking at; the project's folder is not touched. False if it is gone. */
  openVersion(id: string, round: number): Promise<boolean>;
  /** Go back to a round's version, keeping what is there now first: one more round on the timeline. False if it can't. */
  revertProject(id: string, round: number): Promise<boolean>;
  /** A new project in a new folder from a round's version; its id, or null (a lent folder, or the version is gone). */
  forkProject(id: string, round: number): Promise<string | null>;
  /** Put a project away on the board, or take it out again. */
  archiveProject(id: string, on: boolean): Promise<boolean>;
  /** Keep what the user changed in "what the staff remember" (B3). False for a project there isn't, or not a brief. */
  saveBrief(id: string, brief: ProjectBrief): Promise<boolean>;
  /** "Forget this project": the staff remember nothing of it, and pick up no earlier session. */
  forgetProject(id: string): Promise<boolean>;
  /** "Do it regularly" on a project (B6): the schedule kept, or null when a one-off's time has gone by. */
  saveSchedule(project: string, want: string, every: ScheduleEvery): Promise<Schedule | null>;
  removeSchedule(id: string): Promise<boolean>;
  /** How a scheduled round ended (B6): the page shows its card as for a round the user started. */
  onScheduled(cb: (r: RunResult & { title: string }) => void): () => void;
  /** A notice about a finished round was clicked: its result card, again if it was put away. */
  onOpenResult(cb: (run: string) => void): () => void;
  onRawEvent(cb: (e: RawAgentEvent) => void): () => void;
  onAiEvent(cb: (e: AiEvent) => void): () => void;
  onDecision(cb: (r: DecisionRequest) => void): () => void;
  onResult(cb: (r: CommissionResult) => void): () => void;
  /** A finished round's thumbnail, which comes a moment after its result card (road-to-1.3.md C1). */
  onResultPreview(cb: (p: { run: string; png: string }) => void): () => void;
  /** The corner window (plan.md R3): its current state, updates to it, and bringing the shop back. */
  miniState(): Promise<MiniState>;
  onMiniState(cb: (s: MiniState) => void): () => void;
  showShop(): Promise<void>;
  /** Move the shop to another scene: saves it and reloads the page; false while a commission runs. */
  moveScene(scene: SceneId): Promise<boolean>;
  /** A new version is out (road-to-1.1.md A1): the postman brings the letter. */
  onUpdate(cb: (offer: UpdateOffer) => void): () => void;
  /** The user said "update": fetch it, to go in when the shop closes. False if it could not be fetched. */
  downloadUpdate(): Promise<boolean>;
}

/** Ready-made kinds of commission on the form; each shapes the prompt and what the shop prepares (shared/templates.ts). */
export type CommissionTemplate = TemplateId;

/**
 * The commission form: what the user wants, any particulars, who it's for.
 * source: the file to edit or the folder to tidy, as picked in the main process's dialog.
 * materials: files the user handed over (dropped or picked); copies go into the commission folder.
 * inPlace: a folder of the user's own to work in instead of a new one (road-to-1.1.md A6), picked in the main process's dialog.
 */
/**
 * `consult`: the talk with Adeng the slip came out of (B4), to go on the project once it is handed in.
 * `connections`: the connections ticked under "this one may use" (road-to-1.3.md C4); none unless the user ticks one.
 */
export type CommissionForm = { want: string; details?: string; audience?: string; demo?: boolean; template?: CommissionTemplate; source?: string; materials?: string[]; inPlace?: string; consult?: string; connections?: string[] };

/**
 * What a tool of the shop's own (an in-process `nook-*` MCP server, road-to-1.3.md C4) may do, which sets how it is asked:
 * read only reads; make only makes new files in the commission folder; outside changes something outside it that can be
 * undone; final cannot be undone (none in 1.3).
 */
export type ToolKind = 'read' | 'make' | 'outside' | 'final';
/** The kinds of connection. `test` exists only in a development build, for the simulated runs. */
export type ConnectionKind = 'folder' | 'calendar' | 'maildraft' | 'test';
/** A connection the user made, as kept in connections.json: never its secret, which is in connections.bin. */
export type Connection = {
  /** k<time>, and only that shape: it names an MCP server. */
  id: string;
  kind: ConnectionKind;
  label: string;
  /** YYYY-MM-DD */
  added: string;
  lastUsed?: string;
  config: Record<string, string | number | boolean>;
  hasSecret?: boolean;
  paused?: boolean;
};
/** The authorisation card of a kind of connection: what it can read, what it can do (and whether that can be undone), what it never does, and how to end it. */
export type Grant = {
  reads: string[];
  does: { what: string; undo: 'yes' | 'no' }[];
  never: string[];
  disconnect: string;
};
/** A kind of connection the shop can make now, with its card. */
/** `asks`: what its card asks for besides "Connect" (C5): a folder picked next, or an address typed on it. */
export type ConnectionOffer = { kind: ConnectionKind; label: string; grant: Grant; asks?: 'folder' | 'address' };
/** Why a connection was not made (C5): the folder dialog was closed, the folder holds too much, the address will not do, or the secret cannot be kept safe. */
export type SetupError = 'cancelled' | 'broad' | 'address' | 'storage';
/** The connections page: the ones made, each with its card, and the kinds that can be added. */
export type ConnectionsView = { list: (Connection & { grant: Grant })[]; offers: ConnectionOffer[]; /** Every connection paused in settings (C6). */ allPaused?: boolean };
/**
 * One line of actions.jsonl (road-to-1.3.md C6): one call of a connection's tool, what was done and never what was read or
 * written. `decision`: given is a read the tick on the slip agreed to; allowed and denied are the user's answer on the card.
 * `undo`: an outside action's way back, and when it was taken. `undid`: this line is the undo of that one.
 */
export type ActionRecord = {
  id: string;
  t: string;
  run: string; project?: string;
  connection: string;
  tool: string;
  kind: ToolKind;
  said: string;
  decision: 'given' | 'allowed' | 'denied';
  ok: boolean; error?: string;
  undo?: { how: string; path?: string; done?: string };
  undid?: string;
};

/** One line of a talk with Adeng before a commission (road-to-1.2.md B4). */
export type ConsultLine = { who: 'you' | 'adeng'; text: string };
/**
 * The slip a talk with Adeng wrote, with the talk's id. `fromChat`: no slip could be read, so the talk itself went into the
 * details. `end`: the talk could go no further, because its cap (or the month's) was reached or Claude Code did not answer.
 */
export type ConsultBrief = { want: string; details?: string; audience?: string; template?: CommissionTemplate; consult: string; fromChat?: boolean; end?: 'cap' | 'trouble' };
/** What Adeng says to a line in a talk: a reply, or the talk is over and here is the slip. */
export type ConsultReply = { id: string; reply: string } | { id: string; brief: ConsultBrief };

/** A file handed over with a commission. */
export type Material = { path: string; name: string; size: number };
/** What could be handed over, and what not and why. */
export type HandOver = { items: Material[]; refused: { name: string; why: 'folder' | 'too-big' | 'too-many' | 'missing' | 'picture' }[] };

/** A file or folder the user picked for a commission; error when it can't be used. */
export type SourcePick = { path: string; name: string } | { error: 'too-big' | 'broad' | 'macros' };

/** Files produced by a finished commission. */
/** costUsd: what this commission cost in all, as estimated (absent when unknown). */
/**
 * A research write-up checked against its sources (road-to-1.3.md C7): each source with its site and whether this round
 * searched or fetched it; the conclusions the staff found no source for; the points with no number; numbers the sources
 * lack. `broken` when sources.json is missing or unreadable.
 */
export type Citations = {
  sources: { n: number; title: string; url: string; site: string; opened: boolean }[];
  unsourced: string[];
  unnumbered: string[];
  missing: number[];
  broken?: 'noSources' | 'unreadable';
};

export type CommissionResult = {
  /** The round (B5) and the project it was for, which the card names. */
  run?: string;
  project?: RunProject;
  /** Why it stopped, when it did. */
  error?: string;
  ok: boolean; workDir: string; files: string[]; main?: string; costUsd?: number;
  /** What the staff say they made, in their own words. */
  summary?: string;
  /** The commission's entry in Adeng's notebook, for asking for changes afterwards. */
  id?: string;
  /** What the shop gathered with this commission (a new commission done together), if anything. */
  grew?: GrowthId[];
  /** Caps this round took past eight tenths, said once each (B8). */
  budget?: BudgetNote[];
  /** Rounds of changes so far (0 for the first go). */
  round?: number;
  /** An edit that came back as another kind of file (road-to-1.3.md C3): a PDF as Word, a workbook as a list of changes. */
  converted?: 'pdfToWord' | 'sheetAsList';
  /** A research write-up's sources, checked (C7). */
  citations?: Citations;
  /** The work as it was before this round is kept and can be put back. */
  canRestore?: boolean;
  /** Done in the user's own folder: which of their files it changed and which it made (paths inside the folder). */
  lent?: { changed: string[]; added: string[] };
  /** The whole commission in the user's own folder can be undone. */
  canUndo?: boolean;
  /** Scripts it made that delete files or skip the preview: worth reading before a double click. */
  scripts?: ScriptCheck[];
  /** The main file's thumbnail, a PNG data: address, once the main process has taken it (road-to-1.3.md C1). */
  preview?: string;
};

/** Why a Word, Excel or PowerPoint file was shown in its folder rather than opened (office/safe.ts). */
export type NotOpened = 'macros' | 'embedded' | 'externalTemplate' | 'externalLink' | 'unreadable' | 'notPlain';

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
  /** How the step can be undone, or that it cannot (C6), on the serious card. */
  undo?: string;
  options: DecisionOption[];
  /** Option focused by default (and chosen by Esc on the serious card). */
  defaultId: string;
  /** The round asking (B5) and its project, whose name goes before the title. */
  run?: string;
  project?: RunProject;
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
  monthBudget: 'budget:month',
  monthCapNews: 'budget:month-cap-news',
  setProjectCap: 'budget:project-cap',
  consult: 'consult:say',
  consultFinish: 'consult:finish',
  consultsThisMonth: 'consult:month',
  connections: 'connections:list',
  addConnection: 'connections:add',
  pauseConnection: 'connections:pause',
  removeConnection: 'connections:remove',
  actions: 'actions:list',
  undoAction: 'actions:undo',
  copyInstallCommand: 'setup:copy-install',
  installClaude: 'setup:install-claude',
  exportDiagnostics: 'app:export-diagnostics',
  writeToUs: 'app:write-to-us',
  runDebugTask: 'debug:run-task',
  runs: 'commission:runs',
  rawEvent: 'ai:raw-event',
  aiEvent: 'ai:event',
  chooseSource: 'commission:choose-source',
  chooseLent: 'commission:choose-lent',
  undoWork: 'commission:undo',
  exportWork: 'shop:export-work',
  handOver: 'commission:hand-over',
  startCommission: 'commission:start',
  retryCommission: 'commission:retry',
  cancelCommission: 'commission:cancel',
  pendingRounds: 'commission:pending',
  resumePending: 'commission:resume-pending',
  dropPending: 'commission:drop-pending',
  result: 'commission:result',
  resultPreview: 'commission:result-preview',
  openOutput: 'commission:open-output',
  openSource: 'commission:open-source',
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
  projectBoard: 'project:board',
  projectTimeline: 'project:timeline',
  openVersion: 'project:open-version',
  revertProject: 'project:revert',
  forkProject: 'project:fork',
  archiveProject: 'project:archive',
  saveBrief: 'project:save-brief',
  forgetProject: 'project:forget',
  saveSchedule: 'schedule:save',
  removeSchedule: 'schedule:remove',
  scheduled: 'schedule:result',
  openResult: 'commission:open-result',
  updateOffer: 'update:offer',
  downloadUpdate: 'update:download',
  moveInOffer: 'data:move-in-offer',
  moveIn: 'data:move-in',
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
  /** The round it comes from (r<time>, road-to-1.2.md B5), and that round's project; absent in replays. */
  run?: string;
  project?: RunProject;
};

/**
 * A round under way or in the queue (road-to-1.2.md B5): at work, waiting for the user's answer, or queued, and then why
 * (no free place, its project at work, not enough money) and behind which rounds. `color` is its project's card colour, the
 * same as on the project board (ProjectRow.color): the flags over its crew and its column on the blackboard (B9).
 */
export type RunInfo = { run: string; project: RunProject; state: 'running' | 'waiting' | 'queued'; color: number; waits?: 'slot' | 'project' | 'money'; behind?: string[] };

/** The project a round works on, as the shop names it: its id once it has one (a new commission gets it as it ends), and its title. */
export type RunProject = { id?: string; title: string };

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
  /** The round it is for (B9): whose crew the actor is working in, and whose project name a line carries. */
  run?: string;
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
  /**
   * In a folder the user lent (A6): the files this commission changed or made there, by path inside it with "/".
   * Only these go in its zip (A8); the rest of the folder is the user's.
   */
  touched?: string[];
  /** The project it belongs to (1.2). Every commission has one once the notebook is open (projects.ts). */
  project?: string;
};

/**
 * One piece of work the shop goes on doing for weeks (road-to-1.2.md B1): a folder with all its commissions, every round
 * and every version. Fields marked with a later work package are written by that package.
 */
export type Project = {
  /** p<time>, the number of its first commission's c<time> unless another project has it. */
  id: string;
  /** Its first commission's title to begin with; the user can change it. */
  title: string;
  folder: string;
  /** In a folder the user lent (A6). */
  lent?: boolean;
  /** YYYY-MM-DD */
  created: string;
  /** Commission ids, oldest first. */
  commissions: string[];
  /** The timeline, oldest first, never cut short. */
  rounds: ProjectRound[];
  /** What the staff remember about it (B3). */
  brief?: ProjectBrief;
  /** The most it may cost in all, in US dollars (B8). */
  capUsd?: number;
  /** Talks with Adeng before a commission went in (B4), by consult number. */
  consults?: string[];
  /** The project and round it was branched off from (B2). */
  from?: { project: string; round: number };
  archived?: boolean;
};

/** One round on a project's timeline: a new commission's first round, or a round of changes to one. */
export type ProjectRound = {
  /** 1, 2, 3... along the timeline. */
  n: number;
  commission: string;
  /** YYYY-MM-DD */
  date: string;
  /** The change asked for; absent on a commission's first round, which is the commission itself. */
  ask?: string;
  /** What the staff said they made. */
  summary?: string;
  /** What this round cost, by the ledger; absent on rounds from before 1.2. */
  usd?: number;
  seconds?: number;
  /** Why the round did not finish; absent when it did. */
  failure?: string;
  /** The version kept after this round (B2). */
  version?: string;
  /** This round went back to the version of round n (B2). */
  restoredFrom?: number;
};

/** What the staff remember about a project between rounds (B3). */
export type ProjectBrief = {
  purpose: string;
  prefs: string[];
  lastRound?: string;
  /** YYYY-MM-DD, the last time the user changed it. */
  edited?: string;
  /** The user had the project forgotten after this many rounds: the changes asked for until then stay out of the prompt. */
  forgotAt?: number;
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
  /** Input tokens the round's result reported (B3): past 150k the next round starts a new session. */
  contextTokens?: number;
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
export type Work = {
  id: string; title: string; date: string; icon: WorkIcon; rounds: number; hasMain: boolean;
  /** Its main file is a web page, so it can also be taken away as a PDF. */
  page: boolean;
  want?: string;
  /** The project it belongs to, for going there from the shelf (B2). */
  project: string;
};

/** Where a project stands, on the project board (B2). Queued comes with B5. */
export type ProjectStatus = 'running' | 'queued' | 'waiting' | 'done' | 'stopped';

/** One project on the project board. */
export type ProjectRow = {
  id: string; title: string;
  /** YYYY-MM-DD of its latest round. */
  touched: string;
  rounds: number;
  /** What it cost in all, by the ledger, talks with Adeng included. */
  usd: number;
  status: ProjectStatus;
  /** Waiting in the queue (B5): the round, so it can be called off, why it waits and behind whom. */
  queue?: { run: string; waits: 'slot' | 'project' | 'money'; behind: string[] };
  /** A new commission under way or queued (B5): no project until its first round ends, so the row has no timeline yet. */
  fresh?: boolean;
  archived: boolean;
  lent: boolean;
  /** Its card colour, by its place among all the projects (shared/project-colors.ts). */
  color: number;
  /** Its scheduled commissions (B6). */
  schedules?: Schedule[];
};

/** How often a scheduled commission comes round (road-to-1.2.md B6). `time` is a local HH:MM, `at` a local YYYY-MM-DDTHH:MM. */
export type ScheduleEvery = { kind: 'weekly'; weekday: number; time: string } | { kind: 'daily'; time: string } | { kind: 'once'; at: string };

/**
 * A scheduled commission, kept in schedules.json (B6). `project`: carried on in that project each time, or a new project
 * each time without one. `next` is when it is due next; `last` how the latest time went; `missed` the latest due time it
 * skipped, said on the project board.
 */
export type Schedule = {
  id: string;
  project?: string;
  form: CommissionForm;
  every: ScheduleEvery;
  next: string;
  last?: { at: string; result: 'done' | 'failed' | 'skipped'; why?: string };
  missed?: string;
  enabled: boolean;
};

/** One round on a project's timeline, with whether its version can still be had. */
export type TimelineRow = ProjectRound & {
  /** What the round was for: the change asked for, or the commission itself on its first round. */
  what: string;
  /** Its version is kept, so it can be opened, gone back to or branched off. */
  kept: boolean;
  /** It had a version once, and it went to keep the project under its cap. */
  gone: boolean;
};

export type ProjectTimeline = {
  project: ProjectRow;
  rounds: TimelineRow[];
  /** Branched off another project: its title then, and the round. */
  from?: { title: string; round: number };
  /** What the staff remember about it (B3). */
  brief: ProjectBrief;
};

/** How taking a work away went: saved where the user chose, they cancelled, its folder is gone, or nothing is left to take. */
export type ExportResult = 'saved' | 'cancelled' | 'gone' | 'empty';

/** What the shop looks like for this user: its days, and the finished works (latest first). */
export type ShopState = ShopDays & { works: Work[] };
/** A place where a commission got stuck ("pits we fell into together"). */
export type StuckNote = { commission: string; note: string; date: string };
export type Memory = {
  commissions: CommissionMemo[];
  stuckNotes: StuckNote[];
  projects: Project[];
  /** Absent until the first commission is finished. */
  shop?: ShopDays;
  /** Id of the last commission already brought up when the app opened. */
  greeted?: string;
  /** Months (YYYY-MM) and projects whose cap Adeng has said is nearly reached (B8): each is said once. */
  budgetSaid?: string[];
};
/** What may be brought up in a line: `when` flags that hold, and values for the line's placeholders. */
export type Recall = { flags: string[]; vars: Record<string, string> };
