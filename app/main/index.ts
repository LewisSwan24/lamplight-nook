import { oldInstallerData } from './store-home';
import './locale-boot';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { arch, homedir, release, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, crashReporter, dialog, ipcMain, Menu, net, safeStorage, session, shell } from 'electron';
import electronUpdater, { type BaseUpdater } from 'electron-updater';
import { fill, locale, shorten, strings } from '../shared/i18n';
import { template } from '../shared/templates';
import { IPC, type GuestId, type AiEvent, type CommissionForm, type CommissionMemo, type ExportResult, type DataDamage, type DecisionAnswer, type EnvStatus, type ExternalLink, type KeySaveResult, type Memory, type Project, type BudgetNote, type Recall, type ReviseRequest, type RunResult, type ShopState, type Settings, type SourcePick, type CommissionTemplate, type HandOver, type Material, type WriteResult, type Letter, type MoveOffer, type ConsultBrief, type ConsultLine, type ConsultReply, type ProjectRow, type ProjectStatus, type ProjectTimeline } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, runAgent } from './agent-runner';
import { KeyStore, agentEnv, keyHint, pickCredentials, saveKey } from './api-key';
import { CONSULT_CAP_USD, CONSULT_MESSAGES, FINISH_PROMPT, briefFrom, briefFromChat, consultFolder, consultOptions, consultTurn, userMessage } from './consult';
import { installCommand, locateClaude, runInstaller } from './claude-locator';
import { type Revision, collectOutputs, commissionPrompt, commissionTitle, continuePrompt, demoPrompt, lentOutputs, meetingNote, prepareDemoFolder, prepareSource, revisePrompt, snapshot, folderName } from './commission';
import { sessionExists } from './sessions';
import { VersionStore, entriesIn, tooBigToLend } from './versions';
import { backUp, migrate } from './migrate';
import { moveIn, moveInOffer } from './move-in';
import { Updates } from './updates';
import { claudeVersion } from './claude-version';
import { feedbackMail, mailtoUrl, osName } from './feedback';
import { MemoryStore, StuckTracker } from './memory';
import { type Job, PendingStore } from './pending';
import { DecisionBroker } from './decision-broker';
import { isInside } from './paths';
import { diagnosticsEntries } from './diagnostics';
import { Log } from './log';
import { SettingsStore, defaultWorkRoot } from './settings';
import { pruneRecordings } from './recorder';
import { SpendLedger } from './spend';
import { type Caps, type CapKind, type Refusal, type Spent, Reservations, startingMonthCap, warnings } from './budget';
import { now, setClock } from './clock';
import { localMonth } from '../shared/localday';
import { RoundTally } from './tally';
import { zip } from './zip';
import { exportName, workEntries } from './export';
import { pageToPdf } from './print';
import { ShopTray } from './tray';
import { MiniWindow } from './mini';
import { copyMaterials, sortHandOver } from './materials';
import { stepCount } from '../shared/board';
import { boardRow, projectFolders, projectSettled, timelineRows } from './projects';
import { ProjectVersions, type Scope } from './project-versions';
import { cleanScene } from '../shared/scenes';

const here = dirname(fileURLToPath(import.meta.url));

// Crash dumps stay on this computer (userData/Crashpad); nothing is ever uploaded.
crashReporter.start({ uploadToServer: false });
let log: Log | undefined;
process.on('uncaughtException', (err) => log?.error('uncaught exception', err));
process.on('unhandledRejection', (reason) => log?.error('unhandled rejection', reason));
let win: BrowserWindow | null = null;

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);
const broker = new DecisionBroker((req) => {
  send(IPC.decision, req);
  mini.feed({ type: 'ask', serious: req.kind === 'serious' });
  tray.attention(req, settings.get().notify);
});
const iconDir = () => join(app.getAppPath(), 'assets', 'ui');
/** The lamp in the tray. Quitting from its menu closes for real, even with "close to tray" on. */
const tray = new ShopTray(iconDir(), () => win, () => { leaving = true; win?.close(); });
/** The commission currently running (one at a time), and the folder of the last one. */
let current: { workDir: string; abort: AbortController; note?: (text: string) => boolean } | null = null;
let lastWorkDir: string | null = null;
/** The corner window shown while the shop is out of sight (plan.md R3). */
const mini = new MiniWindow(join(here, '../preload/index.cjs'), (w) => {
  if (process.env.ELECTRON_RENDERER_URL) w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/mini.html`);
  else w.loadFile(join(here, '../renderer/mini.html'));
});
/** Show the corner window exactly when the shop is out of sight and the user wants it. */
function updateMini() {
  const away = Boolean(win && !win.isDestroyed() && (!win.isVisible() || win.isMinimized()));
  mini.setVisible(away && !leaving && !quitting && settings.get().mini);
  if (!away) mini.feed({ type: 'seen' });
}
let settings: SettingsStore;
let pending: PendingStore;
let memory: MemoryStore;
let versions: VersionStore;
/** Every round's version of every project (B2), in the same folder as the lent folders' originals. */
let projectVersions: ProjectVersions;
let keys: KeyStore;
let spend: SpendLedger;
/** The last commission that failed (offered as "try again"), and one left over from a crash. */
let lastFailed: Job | null = null;
/** What the rounds under way may still spend (road-to-1.2.md B8). */
const reservations = new Reservations();
let leftover: Job | null = null;
/** Set once the user chose to stop and close, so the close prompt doesn't come back. */
let quitting = false;
/** Set when the user quits from the tray, so closing doesn't just hide the window. */
let leaving = false;

/** The only pages the renderer can open in a browser. */
const LINKS: Record<ExternalLink, string> = {
  claudeSetup: 'https://code.claude.com/docs/en/setup',
  apiKeys: 'https://console.anthropic.com/settings/keys',
  billing: 'https://console.anthropic.com/settings/billing',
  limezu: 'https://limezu.itch.io/',
  music: 'https://freemusicarchive.org/music/alex-morgan',
};

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    title: strings.app.title,
    backgroundColor: '#1b1712',
    useContentSize: true,
    icon: join(iconDir(), 'icon.png'),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The shop's sounds and music start without waiting for a click.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // Closing mid-commission asks first; stopping is the second, deliberate choice.
  win.on('close', (e) => {
    // With "close to tray" on, the shop keeps running out of sight (a commission carries on too).
    if (!leaving && !quitting && settings.get().closeToTray && tray.available) {
      e.preventDefault();
      win?.hide();
      return;
    }
    if (!current || quitting || !win) return;
    const R = strings.ui.run;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', title: R.closeTitle, message: R.closeTitle, detail: R.closeText,
      buttons: [R.keepGoing, R.stopAndClose], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice === 0) {
      // The quit is off, and this is what would have ended it.
      leaving = false;
      e.preventDefault();
      return;
    }
    // Kept, because the question promised it: the shop offers to carry on when it next opens.
    quitting = true;
  });
  win.on('hide', updateMini);
  win.on('show', updateMini);
  win.on('minimize', updateMini);
  win.on('restore', updateMini);
  win.on('closed', () => mini.destroy());
  win.webContents.on('render-process-gone', (_e, details) => log?.error('renderer gone', details));
  win.webContents.on('console-message', (e) => {
    // Electron passes the details on the event; only errors are worth keeping.
    const { level, message } = e as unknown as { level?: string; message?: string };
    if (level === 'error') log?.warn('renderer error', message);
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(here, '../renderer/index.html'));
}

const recordingFor = (kind: string) => join(app.getPath('userData'), 'recordings', `${Date.now()}-${kind}.jsonl`);
const emitters = {
  emit: (event: unknown) => send(IPC.rawEvent, event),
  emitAi: (event: AiEvent) => {
    send(IPC.aiEvent, { ...event, raw: undefined });
    mini.feed({ type: 'ai', event: { kind: event.kind, agent: event.agent, plain: event.plain, todos: event.todos } });
    if (event.agent === 'main' && event.todos) tray.setStep(stepCount(event.todos));
    if (event.kind === 'done' || event.kind === 'failed' || event.kind === 'cancelled' || event.kind === 'session_start') tray.setStep(undefined);
  },
};

// The key is only read in the main process; the renderer just gets a boolean.
// Debug tools are for development; a packaged build hides them unless LAMPLIGHT_DEBUG=1.
/**
 * The Microsoft Store build (an MSIX package). Store policy 10.2.2/10.2.3 rules out running a downloaded
 * installer script from the app, so there the app only shows the official steps. LAMPLIGHT_STORE=1 plays
 * the Store build in development.
 */
const storeBuild = () => process.windowsStore === true || (!app.isPackaged && process.env.LAMPLIGHT_STORE === '1');
/** The last Claude Code version written to the log as unusual, so it is noted once rather than on every check. */
let lastNotedVersion: string | undefined;
const debugEnabled = () => !app.isPackaged || process.env.LAMPLIGHT_DEBUG === '1';
// The simulations move the shop to another day (clock.ts); a packaged build always keeps the computer's.
if (!app.isPackaged && process.env.LAMPLIGHT_CLOCK) setClock(process.env.LAMPLIGHT_CLOCK);
/** The key saved in the app wins over ANTHROPIC_API_KEY; a dev subscription only counts unpackaged. */
const credentials = () => pickCredentials(keys.get(), process.env, app.isPackaged);
ipcMain.handle(IPC.envStatus, async (): Promise<EnvStatus> => {
  const creds = credentials();
  const claude = locateClaude();
  const found = claude === null ? null : await claudeVersion(claude);
  if (found && found.compat !== 'ok' && found.version !== lastNotedVersion) {
    lastNotedVersion = found.version;
    log?.info('claude code version', found);
  }
  return {
    hasApiKey: creds !== null,
    hasClaude: claude !== null,
    claudeVersion: found?.version,
    claudeCompat: found?.compat,
    claudeTested: found?.tested,
    store: storeBuild(),
    debug: debugEnabled(),
    keySource: creds?.source ?? null,
    keyHint: creds?.apiKey ? keyHint(creds.apiKey) : undefined,
    installCommand: installCommand(process.platform),
    platform: process.platform,
  };
});
/** Write the diagnostics zip where the user picks (the desktop by default) and show it; null if they cancel. */
async function exportDiagnostics(): Promise<string | null> {
  if (!win || !log) return null;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const r = await dialog.showSaveDialog(win, { defaultPath: join(app.getPath('desktop'), `lamplight-diagnostics-${stamp}.zip`), filters: [{ name: 'Zip', extensions: ['zip'] }] });
  if (r.canceled || !r.filePath) return null;
  const creds = credentials();
  const claude = locateClaude();
  writeFileSync(r.filePath, zip(diagnosticsEntries({
    app: { version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, locale: app.getLocale() },
    os: { platform: process.platform, release: release(), arch: arch() },
    hasClaude: claude !== null,
    claude: claude === null ? null : await claudeVersion(claude).catch(() => null),
    keySource: creds?.source ?? null,
    settings: settings.get(),
    defaultWorkRoot: defaultWorkRoot(app.getPath('documents')),
    logDir: log.dir,
    crashDir: app.getPath('crashDumps'),
    home: homedir(),
  })));
  log.info('diagnostics exported');
  shell.showItemInFolder(r.filePath);
  return r.filePath;
}
ipcMain.handle(IPC.exportDiagnostics, (): Promise<string | null> => exportDiagnostics());
/**
 * "Write to us": opens the user's own mail program with our address, a subject and a short footer filled in.
 * Nothing is sent from here. With `diagnostics`, the zip is exported first (they attach it themselves);
 * cancelling that save cancels the letter too.
 */
ipcMain.handle(IPC.writeToUs, async (_e, letter: Partial<Letter> | undefined): Promise<WriteResult> => {
  const about = letter?.about === 'content' ? 'content' : 'problem';
  const title = typeof letter?.title === 'string' ? letter.title.slice(0, 80) : undefined;
  let file: string | null = null;
  if (letter?.diagnostics === true) {
    file = await exportDiagnostics();
    if (!file) return { opened: false, cancelled: true };
  }
  const mail = feedbackMail({ version: app.getVersion(), os: osName(process.platform, release()), diagnostics: file ?? undefined, about, title });
  try {
    await shell.openExternal(mailtoUrl(mail));
    log?.info('feedback mail opened', { about, diagnostics: Boolean(file) });
    return { opened: true, file: file ?? undefined };
  } catch (err) {
    log?.warn('feedback mail not opened', { error: String(err) });
    return { opened: false, file: file ?? undefined };
  }
});
ipcMain.handle(IPC.copyInstallCommand, () => clipboard.writeText(installCommand(process.platform)));
// "Install it for me": the official installer, run once at a time; the setup card notices when Claude Code lands.
let installing: Promise<boolean> | null = null;
ipcMain.handle(IPC.installClaude, (): Promise<boolean> => {
  if (storeBuild()) return Promise.resolve(false);
  installing ??= runInstaller().then(({ ok, output }) => {
    log?.info('claude install', { ok, found: locateClaude() !== null, output });
    installing = null;
    return ok && locateClaude() !== null;
  });
  return installing;
});
ipcMain.handle(IPC.saveApiKey, (_e, key: unknown): Promise<KeySaveResult> =>
  saveKey(typeof key === 'string' ? key : '', keys, (url, init) => net.fetch(url, init)));
ipcMain.handle(IPC.clearApiKey, () => keys.clear());
ipcMain.handle(IPC.spendThisMonth, (): number => spend.thisMonth(now()));
ipcMain.handle(IPC.spendMonths, () => spend.months());
ipcMain.handle(IPC.monthBudget, () => ({ capUsd: settings.get().monthCapUsd, spentUsd: spend.thisMonth(now()) }));
ipcMain.handle(IPC.monthCapNews, (): number | null => {
  const raised = settings.raisedMonthCap ? settings.get().monthCapUsd : null;
  settings.raisedMonthCap = false;
  return raised;
});
ipcMain.handle(IPC.setProjectCap, (_e, id: unknown, usd: unknown): boolean => typeof id === 'string' && typeof usd === 'number' && memory.setProjectCap(id, usd));

/**
 * The talk with Adeng before a commission (road-to-1.2.md B4), one at a time: a slip opened afresh starts a new one. `said`
 * counts what the user said, `told` the files Adeng has heard the names of.
 */
type Talk = { id: string; sessionId?: string; said: number; lines: ConsultLine[]; told: string[] };
let talk: Talk | null = null;
/** The talk itself as the slip, when no slip came of it. */
const chatBrief = (t: Talk, end?: 'cap' | 'trouble'): ConsultBrief =>
  ({ ...briefFromChat(t.lines, { you: strings.ui.consult.you, adeng: strings.actors.adeng }, strings.ui.consult.colon), consult: t.id, fromChat: true, ...(end ? { end } : {}) });
/**
 * The most the talk's next turn may spend: what is left of its own cap and of the month's, held like a round's (budget.ts).
 * Null when that is under a cent, or the month has too little left for a commission to start anyway.
 */
function talkGrant(t: Talk): number | null {
  const left = CONSULT_CAP_USD - spend.forCommission(consultFolder(t.id));
  if (left < 0.01) return null;
  const grant = reservations.reserve('consult', undefined, { roundUsd: left, monthUsd: settings.get().monthCapUsd }, { month: spend.thisMonth(now()), project: 0 });
  if ('refused' in grant) return null;
  return grant.usd!;
}
/**
 * One paid turn of the talk; what it cost goes in the ledger under the talk, which counts toward the month. The slip only
 * opens once there is a key (renderer main.ts, notReady), so there are credentials.
 */
async function talkTurn(t: Talk, prompt: string, usd: number, finish: boolean) {
  const cwd = join(app.getPath('userData'), 'consult');
  mkdirSync(cwd, { recursive: true });
  const turn = await consultTurn(prompt, consultOptions({ cwd, maxBudgetUsd: usd, env: agentEnv(credentials()!, process.env), finish, resume: t.sessionId, claude: locateClaude() ?? undefined }));
  reservations.settle('consult');
  t.sessionId = turn.sessionId ?? t.sessionId;
  spend.record(consultFolder(t.id), t.sessionId, turn.costUsd, now());
  log?.info('consult turn', { ok: turn.ok, budget: turn.budget, costUsd: turn.costUsd, finish });
  return turn;
}
ipcMain.handle(IPC.consult, async (_e, id: unknown, text: unknown, files: unknown): Promise<ConsultReply> => {
  if (!talk || talk.id !== id) talk = { id: `t${Date.now()}`, said: 0, lines: [], told: [] };
  const t = talk;
  t.lines.push({ who: 'you', text: String(text).trim().slice(0, 2000) });
  // Past the most the user may say, or what the talk may cost: no more paid turns, the slip comes from what was said.
  const usd = t.said < CONSULT_MESSAGES ? talkGrant(t) : null;
  if (usd === null) return { id: t.id, brief: chatBrief(t, 'cap') };
  t.said++;
  const fresh = (Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : []).filter((f) => !t.told.includes(f));
  t.told.push(...fresh);
  const turn = await talkTurn(t, userMessage(t.lines.at(-1)!.text, fresh), usd, false);
  if (!turn.text) return { id: t.id, brief: chatBrief(t, turn.budget ? 'cap' : 'trouble') };
  t.lines.push({ who: 'adeng', text: turn.text });
  return { id: t.id, reply: turn.text };
});
ipcMain.handle(IPC.consultFinish, async (): Promise<ConsultBrief> => {
  const t = talk!;
  const usd = talkGrant(t);
  if (usd === null) return chatBrief(t, 'cap');
  const turn = await talkTurn(t, FINISH_PROMPT, usd, true);
  const brief = briefFrom(turn.output, turn.text);
  return brief ? { ...brief, consult: t.id } : chatBrief(t, turn.budget ? 'cap' : undefined);
});
ipcMain.handle(IPC.consultsThisMonth, () => spend.consultsThisMonth(now()));

ipcMain.handle(IPC.getSettings, (): Settings => settings.get());
ipcMain.handle(IPC.saveSettings, (_e, patch: Partial<Settings>): Settings => {
  // Where commissions are written is chosen in the folder dialog (chooseWorkRoot), never sent from the page.
  const { workRoot: _ignored, ...rest } = patch && typeof patch === 'object' ? patch : ({} as Partial<Settings>);
  const looked = settings.get().updates;
  const saved = settings.update(rest);
  // Switched back on: look now rather than in up to six hours.
  if (saved.updates && !looked) void updates?.check();
  return saved;
});
ipcMain.handle(IPC.chooseWorkRoot, async (): Promise<Settings | null> => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { defaultPath: settings.get().workRoot, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : settings.update({ workRoot: r.filePaths[0] });
});
ipcMain.handle(IPC.openWorkRoot, async () => {
  const root = settings.get().workRoot;
  mkdirSync(root, { recursive: true });
  await shell.openPath(root);
});
ipcMain.handle(IPC.openLink, (_e, link: ExternalLink) => (LINKS[link] ? shell.openExternal(LINKS[link]) : undefined));
ipcMain.handle(IPC.appVersion, () => app.getVersion());
ipcMain.on(IPC.locale, (e) => { e.returnValue = locale(); });
ipcMain.on(IPC.scene, (e) => { e.returnValue = settings.get().scene; });
// Moving waits while a commission runs: reloading the page would lose the stage that acts it out.
ipcMain.handle(IPC.moveScene, (_e, scene: unknown): boolean => {
  const next = cleanScene(scene);
  if (!next || current || !win) return false;
  settings.update({ scene: next });
  mini.destroy();
  win.webContents.reload();
  return true;
});
// Built by scripts/notices.mjs next to the compiled app.
ipcMain.handle(IPC.legalNotices, (): string | null => {
  try {
    return readFileSync(join(app.getAppPath(), 'out', 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  } catch {
    return null;
  }
});
ipcMain.handle(IPC.relaunch, () => {
  if (current) return false;
  log?.info('relaunch for language', { language: settings.get().language });
  app.relaunch();
  app.exit(0);
  return true;
});

ipcMain.handle(IPC.runDebugTask, async (_e, kind: keyof typeof DEBUG_PROMPTS) => {
  if (!debugEnabled()) throw new Error('debug tasks are disabled');
  const workDir = commissionDir(settings.get().workRoot, fill(strings.app.debugCommission, { kind }));
  return runAgent({ prompt: DEBUG_PROMPTS[kind], workDir, recordingPath: recordingFor(kind), credentials: credentials(), ...emitters });
});

/**
 * The project a round counts against: the one of the work being changed, or of a commission carried on after it stopped.
 * A new commission starts a project of its own, which has no cap yet.
 */
function projectOf(job: Job, again: boolean): Project | undefined {
  const notebook = memory.get();
  const id = job.revise ? notebook.commissions.find((c) => c.id === job.revise!.id)?.project
    : again ? notebook.commissions.find((c) => c.folder === job.workDir && c.result === 'failed')?.project : undefined;
  return notebook.projects.find((p) => p.id === id);
}
const capsFor = (project?: Project): Caps => ({ roundUsd: settings.get().budgetUsd, monthUsd: settings.get().monthCapUsd, projectUsd: project?.capUsd });
/** What the ledger has this month and on the project: every folder its commissions worked in, all sessions. */
function spentOn(project?: Project): Spent {
  const folders = project ? projectFolders(project, memory.get().commissions) : [];
  return { month: spend.thisMonth(now()), project: folders.reduce((sum, f) => sum + spend.forCommission(f), 0) };
}
/** Where a cap stands once a round is settled. */
function noteOn(cap: CapKind, caps: Caps, spent: Spent): Refusal {
  const capUsd = cap === 'month' ? caps.monthUsd : caps.projectUsd!;
  const spentUsd = cap === 'month' ? spent.month : spent.project;
  return { cap, capUsd, spentUsd, leftUsd: Math.max(0, capUsd - spentUsd) };
}
/** A round a month or project cap stopped, or would not let start: the card says which and where it stands. */
const capStop = (r: Refusal, project?: Project): { error: string; cap: BudgetNote } =>
  ({ error: r.cap === 'month' ? 'monthCap' : 'projectCap', cap: { ...r, ...(r.cap === 'project' ? { project: project!.title } : {}) } });
/**
 * Whether a new round may start, asked before anything is made or kept for it (a new folder, the previous version): only
 * asking, so what it would hold goes straight back.
 */
function refused(project: Project | undefined, workDir: string): RunResult | null {
  const grant = reservations.reserve('asking', project?.id, capsFor(project), spentOn(project));
  reservations.settle('asking');
  return 'refused' in grant ? { ok: false, recordingPath: '', workDir, ...capStop(grant.refused, project) } : null;
}

/**
 * Run a commission, fresh or continued. While it runs it is remembered on disk so it can be resumed after
 * a crash; once it ends (any outcome) that record goes away, and a failed run stays available for "try again".
 */
async function runJob(job: Job, again: boolean): Promise<RunResult> {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  // What this round may spend is held from now until it is settled below (budget.ts). A round that cannot start stays the
  // one to carry on, once the cap allows.
  const project = projectOf(job, again);
  const run = `r${Date.now()}`;
  const grant = reservations.reserve(run, project?.id, capsFor(project), spentOn(project));
  if ('refused' in grant) {
    lastFailed = job;
    return { ok: false, recordingPath: '', workDir: job.workDir, ...capStop(grant.refused, project), carryOn: true };
  }
  const abort = new AbortController();
  current = { workDir: job.workDir, abort };
  mini.feed({ type: 'run', running: true });
  pending.save(job);
  const started = Date.now();
  const tally = new RoundTally(started);
  log?.info('run start', { demo: Boolean(job.form.demo), again, resumed: Boolean(again && job.sessionId) });
  // What goes in Adeng's notebook: the user's answers to questions, and where the work got stuck.
  const title = commissionTitle(job.form);
  const notes = memory.promptNotes(title);
  const choices: Record<string, string> = {};
  const stuck = new StuckTracker();
  broker.onAnswered = (req, choice) => {
    const picked = req.kind === 'question' ? req.options.find((o) => o.id === choice && o.id !== 'delegate') : undefined;
    if (picked) choices[req.title] = picked.label;
  };
  const r = job.revise;
  const revision: Revision | undefined = r && { ask: r.ask, form: job.form, summary: r.summary, restored: r.restored };
  // A round of changes picks up the earlier session when Claude Code still has it; otherwise it starts afresh from the folder.
  const pickUp = !again && r?.fromSession && sessionExists(r.fromSession) ? r.fromSession : undefined;
  let finished = false;
  // In a folder the user lent (A6): what is there as the round starts, so what it made can be told apart afterwards.
  const lent = Boolean(job.form.inPlace);
  const atStart = lent ? entriesIn(job.workDir) : [];
  try {
    const before = new Set(job.preexisting);
    const result = await runAgent({
      prompt: again ? continuePrompt(job.form, Boolean(job.sessionId), notes, revision)
        : revision ? revisePrompt(revision, Boolean(pickUp), notes)
        : job.form.demo ? demoPrompt(job.form, notes) : commissionPrompt(job.form, notes),
      resume: again ? job.sessionId : pickUp,
      onSession: (id) => { job.sessionId = id; pending.save(job); },
      onInit: (info) => log?.info('run session', info),
      onInput: (add) => { if (current) current.note = (text) => add(meetingNote(text)); },
      workDir: job.workDir,
      recordingPath: recordingFor(job.form.demo ? 'demo' : 'commission'),
      broker,
      credentials: credentials(),
      maxBudgetUsd: grant.usd,
      preexisting: before,
      keepOriginal: lent ? (file) => versions.keepOriginal(job.workDir, file) : undefined,
      abort,
      ...emitters,
      emitAi: (e) => { stuck.see(e); tally.see(e); emitters.emitAi(e); },
    });
    // Whatever the outcome, even called off: what it made so far must go too if the user undoes it.
    if (lent) versions.noteAdded(job.workDir, atStart, entriesIn(job.workDir));
    finished = result.ok;
    log?.info('run end', { ok: result.ok, error: result.error, detail: result.detail, costUsd: result.costUsd, seconds: Math.round((Date.now() - started) / 1000) });
    // Money spent counts whatever the outcome. A run called off reports nothing (real Claude Code, W11), so it adds nothing.
    const spentThisRun = spend.record(job.workDir, job.sessionId, result.costUsd, now());
    const costUsd = spend.forCommission(job.workDir) || undefined;
    // Settled: the ledger has what the round cost. A month or project cap that set this round's limit and stopped it is
    // that cap's stop, not the per-round one. Caps it took past eight tenths are said once; a cap stop says it already.
    const spent = spentOn(project);
    const stoppedBy = result.error === 'budget' && (grant.by === 'month' || grant.by === 'project') ? grant.by : null;
    const stop = stoppedBy ? capStop(noteOn(stoppedBy, capsFor(project), spent), project) : undefined;
    const error = stop?.error ?? result.error;
    const near = warnings(capsFor(project), spent, memory.get().budgetSaid ?? [], localMonth(now()), project?.id);
    if (near.length) memory.budgetSaid(near.map((w) => w.key));
    const budget = stop || !near.length ? undefined : near.map(({ key: _, ...w }) => ({ ...w, ...(w.cap === 'project' ? { project: project!.title } : {}) }));
    if (result.error !== 'cancelled') {
      const stuckHere = result.ok ? stuck.stuck : [...stuck.stuck, ...stuck.unresolved];
      const outcome = { result: result.ok ? 'done' as const : 'failed' as const, choices, costUsd, sessionId: job.sessionId, summary: result.summary };
      const changes = lent ? versions.lentChanges(job.workDir) : undefined;
      const outputs = changes ? lentOutputs(job.workDir, changes) : collectOutputs(job.workDir, before);
      // The main file may sit in a subfolder of a lent one.
      const main = outputs.main ? relative(job.workDir, outputs.main) : undefined;
      const round = tally.result(Date.now(), result.ok, result.error);
      // A lent folder's own files are counted afresh each round (versions.usersFiles), so they are not written down;
      // what this commission changed or made there is, because only that goes in its zip.
      const touched = changes && [...changes.changed, ...changes.added].sort();
      const entry = r
        ? memory.revise(r.id, r.ask, { ...outcome, main, round, touched, usd: spentThisRun }, stuckHere)
        : memory.remember({ title, ...outcome, folder: job.workDir, form: job.form, preexisting: lent ? undefined : job.preexisting, main, rounds: [round], touched, usd: spentThisRun }, stuckHere);
      if (entry) keepRound(entry);
      // A new commission done together is one more for the shop; a round of changes is part of the same one.
      const grew = result.ok && !r ? memory.finished() : [];
      send(IPC.result, {
        ok: result.ok, error, workDir: job.workDir, costUsd, summary: result.summary, ...outputs,
        id: entry?.id, round: entry?.asks?.length ?? 0, canRestore: Boolean(r && !lent && entry && previousRound(entry)), canUndo: lent && versions.canUndo(job.workDir), grew, budget,
      });
    }
    lastFailed = result.ok || result.error === 'cancelled' ? null : job;
    return { ...result, ...stop, ...(stop ? { carryOn: true } : {}), error, spentThisRun, budget };
  } finally {
    reservations.settle(run);
    broker.onAnswered = undefined;
    // Stopping on the way out promised it could be carried on, unless it got to the end first.
    if (!quitting || finished) pending.clear();
    current = null;
    lastWorkDir = job.workDir;
    mini.feed({ type: 'run', running: false });
  }
}

// Files and folders the user picked in a dialog this session: the only sources a commission may use.
const picked = new Set<string>();
ipcMain.handle(IPC.chooseSource, async (_e, id: CommissionTemplate): Promise<SourcePick | null> => {
  if (!win) return null;
  const source = template(id).source!;
  const r = await dialog.showOpenDialog(win, source.kind === 'folder'
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile'], filters: [{ name: strings.ui.templates[id], extensions: [...source.extensions] }] });
  const path = r.canceled ? undefined : r.filePaths[0];
  if (!path) return null;
  if (source.kind === 'file' && statSync(path).size > source.maxBytes) return { error: 'too-big' };
  picked.add(path);
  return { path, name: basename(path) };
});

/**
 * "Work in a folder I already have" (road-to-1.1.md A6): one the user picked here, not one that holds too much, and
 * small enough that the original of every file in it can be kept. Refused when picked, so nothing starts that
 * could not be undone.
 */
ipcMain.handle(IPC.chooseLent, async (): Promise<SourcePick | null> => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  const path = r.canceled ? undefined : r.filePaths[0];
  if (!path) return null;
  if (holdsTooMuch(path)) return { error: 'broad' };
  if (tooBigToLend(path)) return { error: 'too-big' };
  picked.add(path);
  return { path, name: basename(path) };
});

// Files handed over (dropped on the shop or picked): checked here, and only these may be copied in.
ipcMain.handle(IPC.handOver, async (_e, paths: string[] | null, already: Material[]): Promise<HandOver> => {
  let list = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && isAbsolute(p)) : null;
  if (!list) {
    if (!win) return { items: [], refused: [] };
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
    list = r.canceled ? [] : r.filePaths;
  }
  const sorted = sortHandOver(list, Array.isArray(already) ? already.filter((m) => picked.has(m.path)) : []);
  for (const m of sorted.items) picked.add(m.path);
  return sorted;
});

ipcMain.handle(IPC.startCommission, async (_e, form: CommissionForm): Promise<RunResult> => {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  if (form.source && !picked.has(form.source)) return { ok: false, recordingPath: '', workDir: '', error: 'source' };
  if (form.materials?.some((m) => !picked.has(m))) return { ok: false, recordingPath: '', workDir: '', error: 'source' };
  const stop = refused(undefined, '');
  if (stop) return stop;
  if (form.inPlace) return startLent(form, form.inPlace);
  if (form.demo) form = { ...form, materials: undefined };
  const workDir = commissionDir(settings.get().workRoot, folderName(commissionTitle(form)));
  mkdirSync(workDir, { recursive: true });
  if (form.demo) prepareDemoFolder(workDir, join(app.getAppPath(), 'demo', 'check.js'));
  prepareSource(workDir, form);
  try { copyMaterials(workDir, form.materials ?? []); } catch (e) { return { ok: false, recordingPath: '', workDir, error: 'source', detail: String(e) }; }
  return runJob({ form, workDir, preexisting: [...snapshot(workDir)], startedAt: Date.now() }, false);
});

/**
 * A commission in a folder the user lent. Nothing is copied in: what they hand over would land among their own files.
 * A folder grown too big since it was picked is refused here, before anything in it changes.
 */
function startLent(form: CommissionForm, folder: string): Promise<RunResult> {
  if (!picked.has(folder)) return Promise.resolve({ ok: false, recordingPath: '', workDir: '', error: 'source' });
  if (tooBigToLend(folder)) return Promise.resolve({ ok: false, recordingPath: '', workDir: '', error: 'tooBig' });
  // An earlier work here can't be undone any more: putting its originals back would undo this one as well.
  for (const c of memory.get().commissions) if (c.form?.inPlace && c.result === 'done' && overlaps(c.folder!, folder)) versions.dropLent(c.folder!);
  return runJob({ form: { ...form, materials: undefined, source: undefined, demo: false }, workDir: folder, preexisting: versions.usersFiles(folder), startedAt: Date.now() }, false);
}

/**
 * Another round on finished work, in the same folder: what the shop made so far is kept aside first
 * (the "previous version"), then the staff pick up where they left off.
 */
ipcMain.handle(IPC.reviseCommission, async (_e, req: ReviseRequest): Promise<RunResult> => {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  const ask = typeof req?.ask === 'string' ? req.ask.trim().slice(0, 2000) : '';
  const memo = typeof req?.id === 'string' ? memory.find(req.id) : memory.latest();
  if (!memo || !ask) return { ok: false, recordingPath: '', workDir: '', error: 'gone' };
  if (!memo.folder || !existsSync(memo.folder)) return { ok: false, recordingPath: '', workDir: memo.folder ?? '', error: 'gone' };
  // In a folder the user lent, their files are counted again (they may have added some), and a round that could not
  // be undone does not start. The originals kept so far are what undoing goes back to, so no previous version is kept.
  const lent = Boolean(memo.form?.inPlace);
  if (lent && tooBigToLend(memo.folder)) return { ok: false, recordingPath: '', workDir: '', error: 'tooBig' };
  const stop = refused(memory.get().projects.find((p) => p.id === memo.project), memo.folder);
  if (stop) return stop;
  const preexisting = lent ? versions.usersFiles(memo.folder) : memo.preexisting ?? [];
  const restored = restoredSince.has(memo.id);
  restoredSince.delete(memo.id);
  keepLatest(memo);
  const form = memo.form ?? { want: memo.title };
  return runJob({
    form, workDir: memo.folder, preexisting, startedAt: Date.now(),
    revise: { id: memo.id, ask, fromSession: memo.sessionId, summary: memo.summary, restored },
  }, false);
});
ipcMain.handle(IPC.shopState, (): ShopState => memory.shopState());
ipcMain.handle(IPC.markMet, (_e, id: GuestId) => memory.markMet(id));
ipcMain.handle(IPC.markTold, (_e, id: string) => { if (typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) memory.markTold(id); });
// From the works shelf: the main thing a commission made, or its folder; only what the notebook recorded.
ipcMain.handle(IPC.openWork, async (_e, id: string): Promise<boolean> => {
  const memo = typeof id === 'string' ? memory.find(id) : undefined;
  if (!memo?.folder || !existsSync(memo.folder)) return false;
  const main = memo.main ? join(memo.folder, memo.main) : null;
  if (main && existsSync(main) && insideForReal(memo.folder, main)) {
    if (openable(main)) return (await shell.openPath(main)) === '';
    shell.showItemInFolder(main);
    return true;
  }
  return (await shell.openPath(memo.folder)) === '';
});
/** A work's folder is where the staff will be let loose: not a whole drive, the user's own folders, or the shop's. */
function holdsTooMuch(folder: string): boolean {
  const theirs = (['home', 'documents', 'desktop', 'downloads', 'userData'] as const).map((name) => app.getPath(name));
  return dirname(folder) === folder || [...theirs, settings.get().workRoot].some((place) => insideForReal(folder, place));
}
/** Commissions put back to their previous version since their last round (the next round is told). */
const restoredSince = new Set<string>();
ipcMain.handle(IPC.relinkWork, async (_e, id: string) => {
  const memo = typeof id === 'string' ? memory.find(id) : undefined;
  // Not the one being worked on, and one with no main file gives nothing to recognise it by (the shelf offers neither).
  if (!memo?.main || current?.workDir === memo.folder) return 'cancelled';
  const r = await dialog.showOpenDialog(win!, { title: fill(strings.ui.shelf.relinkDialog, { main: memo.main }), properties: ['openDirectory'] });
  if (r.canceled) return 'cancelled';
  const folder = r.filePaths[0];
  if (holdsTooMuch(folder)) return 'broad';
  const main = join(folder, memo.main);
  if (!existsSync(main) || !statSync(main).isFile() || !insideForReal(folder, main)) return 'wrong';
  // A same-named main file is common, and the next round would change the other work's without asking.
  const others = memory.get().commissions.filter((c) => c.id !== memo.id && c.folder);
  if (others.some((c) => overlaps(c.folder!, folder))) return 'taken';
  spend.moved(memo.folder, folder);
  // What was kept of it came from the old folder; nothing may be put back over the new one.
  versions.drop(memo.id);
  if (memo.form?.inPlace) versions.dropLent(memo.folder!);
  memory.relink(memo.id, folder);
  restoredSince.delete(memo.id);
  return 'found';
});
// The result card's "back to the last version": back to the round before the latest, so pressing it again comes forward.
ipcMain.handle(IPC.restorePrevious, (_e, id: string): boolean => {
  const memo = typeof id === 'string' ? memory.find(id) : undefined;
  const to = memo && previousRound(memo);
  const ok = Boolean(to && revert(memo.project!, to));
  log?.info('restore previous', { ok });
  return ok;
});

/** What goes in a version of a commission's work, and what going back may clear away (project-versions.ts). */
const scopeOf = (memo: CommissionMemo): Scope => (memo.form?.inPlace
  ? { touched: memo.touched ?? [], original: (rel) => versions.originalOf(memo.folder, rel) }
  : { keep: new Set(memo.preexisting ?? []) });
const projectFor = (memo: CommissionMemo) => memory.get().projects.find((p) => p.id === memo.project)!;

/**
 * Before a round of changes, the round it starts from must have its version: work from before projects has none, and
 * its previous version kept the old way (versions/<commission>/) becomes the version of the round before that.
 */
function keepLatest(memo: CommissionMemo) {
  const p = projectFor(memo);
  const bare = p.rounds.filter((r) => !r.version);
  for (const c of p.commissions) {
    const older = bare.filter((r) => r.commission === c).at(-2);
    if (older && projectVersions.takeOld(c, p.id, older.n)) memory.versionKept(p.id, [older.n]);
  }
  const last = p.rounds.at(-1)!;
  if (projectVersions.has(p.id, last.n)) return;
  projectVersions.save(p.id, last.n, memo.folder, scopeOf(memo));
  memory.versionKept(p.id, [last.n]);
}

/** Every round ends with a version of the work, the round just written down for this commission (B2). */
function keepRound(entry: CommissionMemo) {
  const p = projectFor(entry);
  const n = p.rounds.filter((r) => r.commission === entry.id).at(-1)!.n;
  projectVersions.save(p.id, n, entry.folder, scopeOf(entry));
  memory.versionKept(p.id, [n]);
}

/** The round before a commission's project's latest, when its version is kept: the result card's way back. */
function previousRound(memo: CommissionMemo): number | undefined {
  const p = projectFor(memo);
  const before = p.rounds.at(-2)?.n;
  return !p.lent && before && projectVersions.has(p.id, before) ? before : undefined;
}

/**
 * Go back to round `to`'s version: what is in the folder now is kept first, as the latest round's version, so nothing is
 * lost; then the round's files come back and the timeline gets one more round. Not while a round is under way.
 */
function revert(id: string, to: number): boolean {
  const p = memory.get().projects.find((x) => x.id === id);
  if (current || !p || !projectVersions.has(p.id, to) || !existsSync(p.folder)) return false;
  const memo = memory.find(p.commissions.at(-1)!)!;
  const last = p.rounds.at(-1)!.n;
  projectVersions.save(p.id, last, p.folder, scopeOf(memo));
  projectVersions.putBack(p.id, to, p.folder, scopeOf(memo));
  const n = memory.reverted(p.id, to);
  projectVersions.save(p.id, n, p.folder, scopeOf(memo));
  memory.versionKept(p.id, [last, n]);
  restoredSince.add(memo.id);
  return true;
}

/** Where a project stands: at work, waiting for the user's answer, or how its latest commission came out. */
function statusOf(id: string): ProjectStatus {
  const p = memory.get().projects.find((x) => x.id === id)!;
  if (current && current.workDir === p.folder) return broker.waiting ? 'waiting' : 'running';
  return projectSettled(p, memory.get().commissions);
}
const rowOf = (id: string): ProjectRow => {
  const all = memory.get().projects;
  const p = all.find((x) => x.id === id)!;
  return boardRow(p, spentOn(p).project, statusOf(id), all.indexOf(p));
};
ipcMain.handle(IPC.projectBoard, (): ProjectRow[] => memory.get().projects.map((p) => rowOf(p.id)).sort((a, b) => b.touched.localeCompare(a.touched)));
ipcMain.handle(IPC.projectTimeline, (_e, id: string): ProjectTimeline | null => {
  const p = memory.get().projects.find((x) => x.id === id);
  if (!p) return null;
  const from = p.from && memory.get().projects.find((x) => x.id === p.from!.project);
  return {
    project: rowOf(p.id), rounds: timelineRows(p, memory.get().commissions, (n) => projectVersions.has(p.id, n)),
    ...(from ? { from: { title: from.title, round: p.from!.round } } : {}),
  };
});
/** The copy last made of a version to look at; it goes when the next one is opened, and when the app closes. */
let lookingAt: string | null = null;
const putAwayLook = () => { if (lookingAt) rmSync(lookingAt, { recursive: true, force: true }); lookingAt = null; };
ipcMain.handle(IPC.openVersion, async (_e, id: string, round: number): Promise<boolean> => {
  const p = memory.get().projects.find((x) => x.id === id);
  if (!p || !Number.isInteger(round) || !projectVersions.has(p.id, round)) return false;
  putAwayLook();
  lookingAt = mkdtempSync(join(tmpdir(), `lamplight-${p.id}-${round}-`));
  projectVersions.extract(p.id, round, lookingAt);
  const main = memory.find(p.rounds.find((r) => r.n === round)!.commission)?.main;
  const file = main && existsSync(join(lookingAt, main)) ? join(lookingAt, main) : lookingAt;
  log?.info('open version', { round });
  return (await shell.openPath(file)) === '';
});
ipcMain.handle(IPC.revertProject, (_e, id: string, round: number): boolean => {
  const ok = typeof id === 'string' && Number.isInteger(round) && revert(id, round);
  log?.info('revert project', { ok, round });
  return ok;
});
/**
 * Branch a new project off a round: its files in a new folder, with the user's own files the work started from (what
 * they handed over, the document to edit). Not from a lent folder, which would copy all of the user's folder.
 */
ipcMain.handle(IPC.forkProject, (_e, id: string, round: number): string | null => {
  const p = memory.get().projects.find((x) => x.id === id);
  if (!p || p.lent || !Number.isInteger(round) || !projectVersions.has(p.id, round)) return null;
  const r = p.rounds.find((x) => x.n === round)!;
  const source = memory.find(r.commission)!;
  const title = fill(strings.ui.projects.forkTitle, { title: p.title, n: String(round) });
  const folder = commissionDir(settings.get().workRoot, folderName(title));
  mkdirSync(folder, { recursive: true });
  projectVersions.extract(p.id, round, folder);
  const theirs = (source.preexisting ?? []).filter((path) => existsSync(path));
  for (const path of theirs) cpSync(path, join(folder, basename(path)), { recursive: true });
  const entry = memory.forked(source, { project: p.id, round }, title, folder, theirs.map((path) => join(folder, basename(path))), r.summary);
  keepRound(entry);
  log?.info('fork project', { round });
  return entry.project!;
});
ipcMain.handle(IPC.archiveProject, (_e, id: string, on: boolean): boolean => typeof id === 'string' && memory.archive(id, Boolean(on)));
// Undo a commission done in a folder the user lent: their files back as they were, what the shop made gone.
ipcMain.handle(IPC.undoWork, (_e, id: string): string[] | null => {
  if (current || typeof id !== 'string') return null;
  const memo = memory.find(id);
  if (!memo?.form?.inPlace || !memo.folder) return null;
  const skipped = versions.undo(memo.folder);
  if (skipped) memory.undone(id, skipped);
  log?.info('undo lent work', { done: skipped !== null, skipped: skipped?.length });
  return skipped;
});
// "Take it away" from the works shelf (road-to-1.1.md A8): the work becomes a file saved where the user picks, for
// them to pass on however they like. Nothing is uploaded or sent from here.
ipcMain.handle(IPC.exportWork, async (_e, id: string, as: 'zip' | 'pdf'): Promise<ExportResult> => {
  const memo = typeof id === 'string' ? memory.find(id) : undefined;
  const folder = memo?.folder;
  if (!memo || !folder || !existsSync(folder)) return 'gone';
  return as === 'pdf' ? exportPdf(memo, folder) : exportZip(memo, folder);
});
async function exportZip(memo: CommissionMemo, folder: string): Promise<ExportResult> {
  // In a folder the user lent, only what this commission touched: the rest is theirs and stays where it is.
  const entries = workEntries(folder, memo.form?.inPlace ? memo.touched ?? [] : undefined);
  if (!entries.length) return 'empty';
  const to = await saveAs(exportName(memo.title, 'zip'), 'Zip', 'zip');
  if (!to) return 'cancelled';
  writeFileSync(to, zip(entries));
  return saved(to);
}
async function exportPdf(memo: CommissionMemo, folder: string): Promise<ExportResult> {
  const page = memo.main && join(folder, memo.main);
  if (!page || !existsSync(page) || !insideForReal(folder, page)) return 'gone';
  const to = await saveAs(exportName(memo.title, 'pdf'), 'PDF', 'pdf');
  if (!to) return 'cancelled';
  writeFileSync(to, await pageToPdf(folder, page));
  return saved(to);
}
/** Where the user wants the file (the desktop is offered first, as for the diagnostics); null if they cancel. */
async function saveAs(name: string, kind: string, ext: string): Promise<string | null> {
  const r = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('desktop'), name), filters: [{ name: kind, extensions: [ext] }] });
  return r.canceled || !r.filePath ? null : r.filePath;
}
function saved(file: string): ExportResult {
  log?.info('work exported', { as: extname(file) });
  shell.showItemInFolder(file);
  return 'saved';
}
/**
 * New versions from GitHub Releases (road-to-1.1.md A1, updates.ts). A development build has nothing to update unless a
 * simulated run points it at a local feed: LAMPLIGHT_UPDATE_CONFIG names an app-update.yml (a generic provider and the
 * feed's address), honoured only unpackaged. There the installer is never started; the log says when it would have been.
 */
let updates: Updates | undefined;
function startUpdates() {
  const simFeed = app.isPackaged ? undefined : process.env.LAMPLIGHT_UPDATE_CONFIG;
  if (!app.isPackaged && !simFeed) return;
  const { autoUpdater } = electronUpdater;
  // Its own logging goes to the console; the shop writes the one line that matters (updates.ts).
  autoUpdater.logger = null;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  if (simFeed) {
    autoUpdater.updateConfigPath = simFeed;
    autoUpdater.forceDevUpdateConfig = true;
  }
  updates = new Updates({
    store: storeBuild(),
    wanted: () => settings.get().updates,
    updater: {
      check: async () => {
        const r = await autoUpdater.checkForUpdates();
        return r?.isUpdateAvailable ? { version: r.updateInfo.version, notes: r.updateInfo.releaseNotes } : null;
      },
      download: async () => { await autoUpdater.downloadUpdate(); },
      // Quietly, and the shop does not open again afterwards: the user has just closed it.
      install: () => (simFeed ? log?.info('update installer not run (simulated)') : (autoUpdater as BaseUpdater).install(true, false)),
    },
    backUp: (version) => backUp(app.getPath('userData'), `before-${version}`),
    tell: (offer) => send(IPC.updateOffer, offer),
    log: log!,
    lang: locale(),
  });
  // The first letter needs a page to arrive at.
  win?.webContents.once('did-finish-load', () => updates?.start());
}
ipcMain.handle(IPC.downloadUpdate, (): Promise<boolean> => updates?.download() ?? Promise.resolve(false));
ipcMain.handle(IPC.retryCommission, async (): Promise<RunResult | null> => (lastFailed ? runJob(lastFailed, true) : null));
ipcMain.handle(IPC.cancelCommission, () => current?.abort.abort());
// A commission left over from a crash or an unexpected quit: offered once at startup.
ipcMain.handle(IPC.pendingCommission, (): CommissionForm | null => (current ? null : (leftover?.form ?? null)));
ipcMain.handle(IPC.resumePending, async (): Promise<RunResult | null> => {
  const job = leftover;
  leftover = null;
  return job ? runJob(job, true) : null;
});
ipcMain.handle(IPC.dropPending, () => {
  leftover = null;
  pending.clear();
});

ipcMain.handle(IPC.answer, (_e, answer: DecisionAnswer) => {
  const ok = broker.answer(answer);
  if (!broker.waiting) {
    tray.calm();
    mini.feed({ type: 'answered' });
  }
  return ok;
});
ipcMain.handle(IPC.recallForCommission, (_e, form: CommissionForm): Recall => memory.recallForCommission(commissionTitle(form)));
ipcMain.handle(IPC.recallOnOpen, (): Recall => memory.recallOnOpen());
ipcMain.handle(IPC.recallForRevision, (_e, id: string): Recall => memory.recallForRevision(id, shorten));
ipcMain.handle(IPC.getMemory, (): Memory => memory.get());
ipcMain.handle(IPC.dataDamage, (): DataDamage => {
  const damage = { notebook: memory.damage, settings: settings.damaged, ledger: spend.damaged };
  memory.damage = null;
  settings.damaged = false;
  spend.damaged = false;
  return damage;
});
/** The settings, the notebook, the ledger and the rest, read from the data folder (at the start, and again after moving in). */
function openData() {
  const dir = app.getPath('userData');
  // Older versions' data is brought up to date (with a copy kept aside) before anything reads it.
  const migrated = migrate(dir);
  // Only how many: a change can quote a commission's title, and the log goes into the diagnostics file.
  if (migrated.to !== migrated.from || migrated.changes.length) log?.info('data migrated', { from: migrated.from, to: migrated.to, changes: migrated.changes.length });
  // The ledger first: settings from before the monthly cap take theirs from what was spent (budget.ts).
  spend = new SpendLedger(join(dir, 'spend.json'));
  settings = new SettingsStore(join(dir, 'settings.json'), app.getPath('documents'), () => startingMonthCap(spend.months(), now()));
  pending = new PendingStore(join(dir, 'pending.json'));
  memory = new MemoryStore(join(dir, 'memory.json'));
  versions = new VersionStore(join(dir, 'versions'));
  projectVersions = new ProjectVersions(join(dir, 'versions'));
  if (memory.damage || settings.damaged || spend.damaged) log?.warn('data files could not be read', { notebook: memory.damage, settings: settings.damaged, ledger: spend.damaged });
  leftover = pending.load();
}
/**
 * The Store build's first open beside an installer build's shop (move-in.ts): asked once, before the shop opens.
 * Yes copies it over and reads the data afresh; the original is never changed.
 */
let moveOffer: MoveOffer | null = null;
ipcMain.handle(IPC.moveInOffer, (): MoveOffer | null => moveOffer);
ipcMain.handle(IPC.moveIn, (_e, yes: boolean): boolean => {
  moveOffer = null;
  if (!yes || !oldInstallerData) return true;
  try {
    const brought = moveIn(oldInstallerData, app.getPath('userData'));
    log?.info('moved in from the installer build', { brought });
  } catch (err) {
    log?.error('could not move in', err);
    return false;
  }
  openData();
  return true;
});
// A meeting at the big table: the user's note goes to the running commission (false if it has wrapped up).
ipcMain.handle(IPC.addNote, (_e, text: string): boolean => {
  const clean = typeof text === 'string' ? text.trim().slice(0, 500) : '';
  return Boolean(clean && current?.note?.(clean));
});
ipcMain.handle(IPC.clearMemory, (): boolean => {
  // What it is doing would go straight back in the notebook, and the ledger would count the round twice.
  if (current) return false;
  memory.clear();
  versions.clear();
  spend.forget();
  pruneRecordings(join(app.getPath('userData'), 'recordings'), 0);
  return true;
});
ipcMain.handle(IPC.clearStats, () => memory.clearStats());
// Only folders the notebook itself recorded, looked up by id.
ipcMain.handle(IPC.openCommissionFolder, async (_e, id: string): Promise<boolean> => {
  const folder = memory.get().commissions.find((c) => c.id === id)?.folder;
  if (!folder || !existsSync(folder)) return false;
  return (await shell.openPath(folder)) === '';
});

// Only files from the current or last commission folder can be opened from the renderer.
ipcMain.handle(IPC.openOutput, async (_e, path: string, how: 'open' | 'reveal') => {
  if (typeof path !== 'string') return false;
  const allowed = [current?.workDir, lastWorkDir].filter(Boolean) as string[];
  if (!allowed.some((dir) => insideForReal(dir, path))) return false;
  if (how === 'reveal' || !openable(path)) shell.showItemInFolder(path);
  else await shell.openPath(path);
  return true;
});

/**
 * Kinds of file the shop opens with a click. The staff write files, and a page or a file they read could talk
 * them into writing a program, a script or a shortcut; opening that would run it. Anything else is shown in
 * its folder instead, for the user to decide.
 */
const OPENABLE = new Set(['.html', '.htm', '.md', '.txt', '.csv', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);
const openable = (path: string) => OPENABLE.has(extname(path).toLowerCase());
/** Two folders where one is inside the other (or they are the same), links followed. */
const overlaps = (a: string, b: string) => insideForReal(a, b) || insideForReal(b, a);
/** Inside the folder once links are followed, so a link inside cannot point the click somewhere else. */
function insideForReal(dir: string, path: string): boolean {
  try {
    return isInside(dir, path) && isInside(realpathSync(dir), realpathSync(path));
  } catch {
    return false;
  }
}

// The shop's windows only ever show its own pages. A link or a script that tried to load something else
// would get the shop's API with it, so navigation, new windows and embedded views are refused.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL;
    if (!(dev && !app.isPackaged && url.startsWith(dev))) e.preventDefault();
  });
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

// One shop at a time: two would write over each other's notebook, and each would spend its own budget.
if (!app.requestSingleInstanceLock()) app.exit(0);
// Electron's own File, Edit and View menus, developer tools among them, are not for the people the shop serves.
Menu.setApplicationMenu(null);
app.on('second-instance', () => tray.show());

app.whenReady().then(() => {
  // Nothing in the shop needs the camera, the microphone, notifications from the page or anything like them.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  log = new Log(join(app.getPath('userData'), 'logs'));
  log.prune();
  log.info('app start', { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, release: release() });
  app.on('child-process-gone', (_e, details) => log?.warn('child process gone', details));
  // Looked at before anything is written: the Store build's own folder is still as it was.
  moveOffer = moveInOffer(oldInstallerData, app.getPath('userData'));
  openData();
  keys = new KeyStore(join(app.getPath('userData'), 'api-key.bin'), safeStorage);
  pruneRecordings(join(app.getPath('userData'), 'recordings'));
  createWindow();
  startUpdates();
  tray.create();
  win?.on('focus', () => tray.calm());
}).catch((err: unknown) => {
  // Before the window there is nothing else to tell the user with, and a process with no window would stay until killed.
  log?.error('could not open', err);
  dialog.showErrorBox(strings.ui.startFail.title, fill(strings.ui.startFail.text, { reason: err instanceof Error ? err.message : String(err) }));
  app.quit();
});
// The corner window: what to show now, and a click on it brings the shop back.
ipcMain.handle(IPC.miniState, () => mini.state);
ipcMain.handle(IPC.showShop, () => tray.show());
app.on('before-quit', () => {
  leaving = true;
});
// After the windows have gone: the question on closing can still be answered with "keep going", which cancels the quit.
app.on('will-quit', () => {
  putAwayLook();
  mini.destroy();
  broker.cancelAll();
  current?.abort.abort();
  // Closing for real, with any commission let finish or stopped just above: a new version fetched earlier goes in now.
  updates?.quitting();
});
app.on('window-all-closed', () => app.quit());
