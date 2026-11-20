import { oldInstallerData } from './store-home';
import './locale-boot';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { arch, homedir, release, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, crashReporter, dialog, ipcMain, Menu, net, powerMonitor, powerSaveBlocker, safeStorage, session, shell } from 'electron';
import electronUpdater, { type BaseUpdater } from 'electron-updater';
import { fill, locale, shorten, strings } from '../shared/i18n';
import { template } from '../shared/templates';
import { IPC, type GuestId, type AiEvent, type CommissionForm, type CommissionMemo, type ExportResult, type DataDamage, type DecisionAnswer, type EnvStatus, type ExternalLink, type KeySaveResult, type Memory, type Project, type BudgetNote, type Recall, type ReviseRequest, type RunResult, type ShopState, type Settings, type SourcePick, type CommissionTemplate, type HandOver, type Material, type WriteResult, type Letter, type MoveOffer, type ConsultBrief, type ConsultLine, type ConsultReply, type ProjectRow, type ProjectStatus, type ProjectTimeline, type RunInfo, type RunProject, type Schedule, type ScheduleEvery, type PendingRound, type Connection, type NotOpened, type SetupError } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, runAgent } from './agent-runner';
import { KeyStore, agentEnv, keyHint, pickCredentials, saveKey } from './api-key';
import { CONSULT_CAP_USD, CONSULT_MESSAGES, FINISH_PROMPT, briefFrom, briefFromChat, consultFolder, consultOptions, consultTurn, userMessage } from './consult';
import { installCommand, locateClaude, runInstaller } from './claude-locator';
import { citationsIn, sourceUrl } from './citations';
import { type Revision, collectOutputs, commissionPrompt, convertedNote, sourceProblem, commissionTitle, continuePrompt, demoPrompt, lentOutputs, meetingNote, prepareDemoFolder, prepareSource, revisePrompt, snapshot, folderName, withConnections } from './commission';
import { sessionExists } from './sessions';
import { VersionStore, entriesIn, tooBigToLend } from './versions';
import { backUp, migrate } from './migrate';
import { moveIn, moveInOffer } from './move-in';
import { Updates } from './updates';
import { claudeVersion } from './claude-version';
import { feedbackMail, mailtoUrl, osName } from './feedback';
import { MemoryStore, StuckTracker } from './memory';
import { type Job, PendingStore } from './pending';
import { NETWORK_WAIT_MS, Sleep, resumeOnWake } from './resume';
import { DecisionBroker } from './decision-broker';
import { isInside } from './paths';
import { diagnosticsEntries } from './diagnostics';
import { Log } from './log';
import { SettingsStore, defaultWorkRoot, loginItem } from './settings';
import { ScheduleStore, due, nextTime, wakeIn } from './schedule';
import { pruneRecordings } from './recorder';
import { SpendLedger } from './spend';
import { type Caps, type CapKind, type Grant, type Refusal, type Spent, Reservations, startingMonthCap, warnings } from './budget';
import { RunQueue, runId, type Ticket } from './runs';
import { now, setClock } from './clock';
import { localMonth } from '../shared/localday';
import { RoundTally } from './tally';
import { zip } from './zip';
import { exportName, workEntries } from './export';
import { imageThumb, pageThumb, pageToPdf, pageToPng, pictureToPng } from './print';
import { officeServer, prunePreviews, thumbSource } from './office/tools';
import { howToOpen } from './open-rule';
import { ShopTray } from './tray';
import { MiniWindow } from './mini';
import { copyMaterials, sortHandOver } from './materials';
import { stepCount } from '../shared/board';
import { boardRow, projectFolders, projectSettled, timelineRows } from './projects';
import { newSession, projectBackground } from './project-brief';
import { localDay } from '../shared/localday';
import { ProjectVersions, type Scope } from './project-versions';
import { cleanRoom, cleanScene, type RoomId } from '../shared/scenes';
import { CONNECTION_ID, ConnectionStore } from './connections';
import { ActionLog, ConnectionReads, RoundActions } from './action-log';
import { calendarKind, type FetchText, folderKind, type KindDef, maildraftKind, offerOf, testKind } from './connection-kinds';
import { type NookServer, connectionServers } from './nook-tools';
import { randomUUID } from 'node:crypto';

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
  mini.feed({ type: 'ask', serious: req.kind === 'serious', run: req.run, project: many() ? req.project?.title : undefined });
  if (tray.attention(req, settings.get().notify)) log?.info('notice', { kind: 'ask', run: req.run });
  sendRuns();
});
const iconDir = () => join(app.getAppPath(), 'assets', 'ui');
/** The lamp in the tray. Quitting from its menu closes for real, even with "close to tray" on. */
const tray = new ShopTray(iconDir(), () => win, () => { leaving = true; win?.close(); });
/**
 * The rounds under way (road-to-1.2.md B5), by run id, two at most: each with its own way to stop it, its clock, where it got
 * stuck and what the user answered, and the meeting note it takes.
 */
type Run = { id: string; job: Job; project: RunProject; abort: AbortController; started: number; stuck: StuckTracker; choices: Record<string, string>; note?: (text: string) => boolean;
  /** What the stretch since Claude Code last reported would cost (B7), and whether that is in the ledger already. */
  unreported?: () => number; counted?: boolean };
const runs = new Map<string, Run>();
/** Rounds waiting their turn: what starts one once it may, with what it may spend held, and how its caller hears it was called off. */
type Waiting = Ticket & { title: string; grant?: Grant; go: (grant: Grant) => void; drop: () => void };
const queue = new RunQueue<Waiting>();
/** The folders of rounds finished since the shop opened, whose files their result cards may open. */
const finishedIn = new Set<string>();
/** The first round under way: the tray's step count follows it, and a meeting's note goes to it. */
const lead = (): Run | undefined => runs.values().next().value;
/** Two rounds at once: lines from each then say which project they are about. */
const many = () => runs.size > 1;
/** A round is working in this folder. */
const busyIn = (folder: string) => [...runs.values()].some((r) => r.job.workDir === folder);
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
/** The scheduled commissions (road-to-1.2.md B6). */
let schedules: ScheduleStore;
let memory: MemoryStore;
let versions: VersionStore;
/** Every round's version of every project (B2), in the same folder as the lent folders' originals. */
let projectVersions: ProjectVersions;
let keys: KeyStore;
/** The user's connections (road-to-1.3.md C4). */
let connections: ConnectionStore;
/** The record of outside actions (road-to-1.3.md C6), actions.jsonl in the data folder. */
let actionLog: ActionLog;
let connectionReads: ConnectionReads;
let spend: SpendLedger;
/** What the rounds under way may still spend (road-to-1.2.md B8). */
const reservations = new Reservations();
/** Set once the user chose to stop and close, so the close prompt doesn't come back. */
let quitting = false;
/** Windows is shutting down or signing out (road-to-1.2.md B7): the rounds under way are interrupted, nothing new starts. */
let ending = false;
/** When the computer last slept and woke (B7). */
const sleep = new Sleep();
/** Rounds that failed for the network around a sleep: carried on by themselves once the network is back (B7). */
const toWake = new Set<string>();
/** Keeps the computer from sleeping by itself while a round runs (B7); closing the lid still puts it to sleep. */
let awake: number | undefined;
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

/** Opened at login (road-to-1.2.md B6): the shop starts in the tray, its window out of sight until the lamp is clicked. */
const startInTray = process.argv.includes('--tray');

function createWindow() {
  win = new BrowserWindow({
    show: !startInTray,
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
    if (!runs.size || quitting || !win) return;
    const R = strings.ui.run;
    // With a tray, the work can also go on out of sight this once, without changing the setting (B6, Q-B3).
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', title: R.closeTitle, message: R.closeTitle, detail: R.closeText,
      buttons: tray.available ? [R.keepGoing, R.stopAndClose, R.toTray] : [R.keepGoing, R.stopAndClose], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice !== 1) {
      // The quit is off, and this is what would have ended it.
      leaving = false;
      e.preventDefault();
      if (choice === 2) {
        win.hide();
        log?.info('tucked into the tray');
      }
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
  // Windows asks before shutting down or signing out, then says it is happening: either way no question card (B7).
  win.on('query-session-end', () => endSession('query'));
  win.on('session-end', () => endSession('end'));
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
/** One round's events: each carries its run id and project (B5). The tray's step count follows the first round only. */
function emittersFor(run: string, project: RunProject) {
  return {
    emit: emitters.emit,
    emitAi: (event: AiEvent) => {
      send(IPC.aiEvent, { ...event, raw: undefined, run, project });
      mini.feed({ type: 'ai', run, project: many() ? project.title : undefined, event: { kind: event.kind, agent: event.agent, plain: event.plain, todos: event.todos } });
      if (lead()?.id !== run) return;
      if (event.agent === 'main' && event.todos) tray.setStep(stepCount(event.todos));
      if (event.kind === 'done' || event.kind === 'failed' || event.kind === 'cancelled' || event.kind === 'session_start') tray.setStep(undefined);
    },
  };
}

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
/**
 * The kinds of connection this build can make (road-to-1.3.md C4). C5 brings the real ones; until then only a development
 * build has one, the test connection, whose secret a simulated run may name (LAMPLIGHT_TEST_SECRET) to look for it later.
 */
const connectionKinds = (): KindDef[] => [
  folderKind(pickLinkFolder, (path) => holdsTooMuch(path) || [settings.get().workRoot, app.getPath('userData')].some((own) => insideForReal(own, path))),
  calendarKind(fetchCalendar, !app.isPackaged),
  maildraftKind(),
  ...(app.isPackaged ? [] : [testKind(() => process.env.LAMPLIGHT_TEST_SECRET || `test-${randomUUID()}`, join(app.getPath('userData'), 'test-outside'))]),
];
/** The folder a synced-folder connection links (C5), picked in the main process's own dialog. */
async function pickLinkFolder(): Promise<string | null> {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0] ?? null;
}
/**
 * A calendar's address fetched (C5): no cookies, no redirects followed (one could lead anywhere), and given up after 20
 * seconds. The address never goes into a message.
 */
const fetchCalendar: FetchText = (url) => net.fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20_000) });
const kindOf = (kind: unknown) => connectionKinds().find((k) => k.kind === kind);
/** A connection's server for a round: its tools, each call noted as its last use; null for a kind this build cannot run. */
function connectionServer(c: Connection): NookServer | null {
  const def = kindOf(c.kind);
  return def ? { name: c.id, tools: def.tools(c, () => connections.secret(c.id)), used: () => connections.used(c.id), connection: { id: c.id, label: c.label, kind: c.kind } } : null;
}
/** Each round's preview pages for the result card's thumbnail (C1), in the data folder, the newest runs' only. */
const previewsDir = () => join(app.getPath('userData'), 'previews');
/** The shop's own tools, on every round: Word, Excel, PowerPoint and PDF (C1). */
const shopServers = (): NookServer[] => [officeServer({ previews: previewsDir(), toPdf: pageToPdf, toPng: pageToPng })];
/** The screens a thumbnail is taken from: a page as on a small laptop, a preview page at its own width. */
const PAGE_SCREEN = { width: 1024, height: 640 };
const PREVIEW_SCREEN = { width: 560, height: 420 };
/**
 * The result card's thumbnail (road-to-1.3.md C1), or nothing when its main file has no picture (thumbSource). A page
 * opens in the same walled-off window as a PDF does, a made Office file through its preview page.
 */
async function cardThumb(main: string, workDir: string, run: string): Promise<string | undefined> {
  const src = thumbSource(main, workDir, previewsDir(), run);
  if (!src) return undefined;
  if ('image' in src) return imageThumb(src.image);
  return 'preview' in src ? pageThumb(src.folder, src.page, PREVIEW_SCREEN, true) : pageThumb(src.folder, src.page, PAGE_SCREEN);
}
ipcMain.handle(IPC.connections, () => ({
  list: connections.list().flatMap((c) => { const def = kindOf(c.kind); return def ? [{ ...c, grant: def.grant }] : []; }),
  offers: connectionKinds().map(offerOf),
  allPaused: settings.get().connectionsPaused,
}));
ipcMain.handle(IPC.actions, () => actionLog.list());
/** Undo an outside action: only through its own kind, which removes only what that action made, in its own place. */
ipcMain.handle(IPC.undoAction, (_e, id: unknown): boolean => {
  const r = typeof id === 'string' ? actionLog.get(id) : undefined;
  if (!r?.undo?.path || r.undo.done || !r.ok || r.kind !== 'outside') return false;
  const c = connections.get(r.connection);
  const def = c && kindOf(c.kind);
  if (!def?.undo?.(r.tool, r.undo.path, c)) return false;
  const done = actionLog.undone(r.id, fill(strings.ui.actions.undoSaid, { said: r.said }));
  log?.info('outside action undone', { tool: r.tool, ok: Boolean(done) });
  return Boolean(done);
});
/** A connection made after its card said yes: the kind sets it up from what the user gave (C5), then it is kept. */
ipcMain.handle(IPC.addConnection, async (_e, kind: unknown, input: unknown): Promise<Connection | { error: SetupError } | null> => {
  const def = kindOf(kind);
  if (!def) return null;
  const address = (input as { address?: unknown } | null)?.address;
  const set = await def.setup({ address: typeof address === 'string' ? address.slice(0, 2000) : undefined });
  if ('error' in set) {
    log?.info('connection not made', { kind: def.kind, why: set.error });
    return set;
  }
  const made = connections.add(def.kind, set.label, set.config, set.secret);
  log?.info('connection added', { kind: def.kind, ok: Boolean(made) });
  return made ?? { error: 'storage' };
});
const connectionId = (id: unknown): id is string => typeof id === 'string' && CONNECTION_ID.test(id);
ipcMain.handle(IPC.pauseConnection, (_e, id: unknown, on: unknown) => connectionId(id) && typeof on === 'boolean' && connections.pause(id, on));
ipcMain.handle(IPC.removeConnection, (_e, id: unknown) => {
  const gone = connectionId(id) && connections.remove(id);
  if (gone) log?.info('connection removed');
  return gone;
});
ipcMain.handle(IPC.setProjectCap, (_e, id: unknown, usd: unknown): boolean => {
  const ok = typeof id === 'string' && typeof usd === 'number' && memory.setProjectCap(id, usd);
  pump();
  return ok;
});

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
  const before = settings.get();
  // The Store build can't register itself to open at login this way (an MSIX package needs a startup task), so it has no switch.
  if (storeBuild()) delete rest.openAtLogin;
  const saved = settings.update(rest);
  // Switched back on: look now rather than in up to six hours.
  if (saved.updates && !before.updates) void updates?.check();
  if (saved.openAtLogin !== before.openAtLogin) {
    app.setLoginItemSettings(loginItem(saved.openAtLogin));
    log?.info('open at login', { on: saved.openAtLogin });
  }
  if (saved.schedulesPaused !== before.schedulesPaused) lookAtSchedules();
  // A higher monthly cap may let a round waiting for money start.
  pump();
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
  if (!next || runs.size || queue.queued.length || !win) return false;
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
  if (runs.size || queue.queued.length) return false;
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
 * Whether a new round may start at all, asked before anything is made or kept for it (a new folder, the previous version).
 * Only the ledger counts here: what the rounds under way hold is theirs only until they end, so a round short of money
 * because of them waits in the queue instead (B5 rule 5).
 */
function refused(project: Project | undefined, workDir: string): RunResult | null {
  const grant = new Reservations().reserve('asking', project?.id, capsFor(project), spentOn(project));
  return 'refused' in grant ? { ok: false, recordingPath: '', workDir, ...capStop(grant.refused, project) } : null;
}

/**
 * Put a round in the queue (road-to-1.2.md B5) and start whatever may start. `start` runs it when its turn comes, with what
 * it may spend already held; once it ends that is let go and the queue moves on. Called off while it waits, its caller
 * hears so and nothing was spent.
 */
function queued(folder: string | undefined, project: Project | undefined, title: string, start: (run: string, grant: Grant) => Promise<RunResult>, by: Ticket['by'] = 'user', id = runId(Date.now())): Promise<RunResult> {
  return new Promise((resolve) => {
    queue.add({
      id, folder, project: project?.id, by, title,
      go: (grant) => void start(id, grant).then((r) => {
        reservations.settle(id);
        // One that failed for the network around a sleep holds no place while it waits to be carried on (B5 rule 4).
        void afterWake(r).then(resolve);
        pump();
      }),
      drop: () => {
        pending.clear(id);
        resolve({ run: id, ok: false, recordingPath: '', workDir: folder ?? '', error: 'cancelled' });
      },
    });
    pump();
    if (queue.queued.some((t) => t.id === id)) log?.info('run queued', { waits: queue.queued.find((t) => t.id === id)!.waits });
  });
}
/** Start what may start: two at most, one per project, first come first served, and only with the money for it held. */
function pump() {
  if (ending) return;
  const active = [...runs.values()].map((r) => ({ id: r.id, folder: r.job.workDir, project: r.project.id }));
  const projects = memory.get().projects;
  const starting = queue.take(active, overlaps, (t) => {
    const p = projects.find((x) => x.id === t.project);
    const grant = reservations.reserve(t.id, p?.id, capsFor(p), spentOn(p));
    if ('refused' in grant) return false;
    t.grant = grant;
    return true;
  });
  for (const t of starting) t.go(t.grant!);
  sendRuns();
}
/** The rounds under way and in the queue, as the page shows them: who is waiting for the user, and what each queued one waits for. */
function runInfos(): RunInfo[] {
  const under = [...runs.values()];
  // Each in its project's card colour (B9): a new commission takes the colour its project will get, as on the board.
  const projects = memory.get().projects;
  const fresh = [...under.filter((r) => !r.project.id).map((r) => r.id), ...queue.queued.filter((t) => !t.project).map((t) => t.id)];
  const color = (run: string, project?: string) => (project ? projects.findIndex((p) => p.id === project) : projects.length + fresh.indexOf(run));
  return [
    ...under.map((r): RunInfo => ({ run: r.id, project: r.project, state: broker.waitingOn(r.id) ? 'waiting' : 'running', color: color(r.id, r.project.id) })),
    ...queue.queued.map((t): RunInfo => {
      const waits = t.waits ?? 'slot';
      const behind = waits === 'money' ? [] : under.filter((r) => waits === 'slot' || (t.folder && overlaps(r.job.workDir, t.folder))).map((r) => r.project.title);
      return { run: t.id, project: { id: t.project, title: t.title }, state: 'queued', color: color(t.id, t.project), waits, behind };
    }),
  ];
}
function sendRuns() {
  const list = runInfos();
  send(IPC.runs, list);
  tray.setRuns(list, settings.get().schedulesPaused);
}
/**
 * Carry on a round that stopped (try again, left over from a crash, interrupted, or after waking): asked of the caps first,
 * then queued, under a run id of its own. It always continues the same session when there is one (B7), and its record
 * goes with it: written down as waiting, so closing the shop before its turn does not lose it.
 */
function carryOn(job: Job): Promise<RunResult> {
  const project = projectOf(job, true);
  const id = runId(Date.now());
  const stop = refused(project, job.workDir);
  if (stop) {
    // It stays the one to carry on, once the cap allows.
    pending.save({ ...job, run: id, state: 'failed', why: stop.error, at: Date.now() });
    return Promise.resolve({ ...stop, run: id, carryOn: true });
  }
  pending.save({ ...job, run: id, state: 'queued', at: Date.now() });
  const done = queued(job.workDir, project, project?.title ?? commissionTitle(job.form), (run, grant) => runJob(run, grant, job, true, project), 'user', id);
  // A scheduled round carried on is that schedule's round, not a missed one (B7).
  return job.schedule ? done.then((r) => { scheduleRan(job.schedule!, r); return r; }) : done;
}

/**
 * A round that failed for the network around a sleep (B7): once the computer is awake and the network is back, it is
 * carried on, once. The user's "try again" may have got there first, and then this does nothing. With no network ten
 * minutes after waking, the failure stands and its card comes up as usual.
 */
async function afterWake(r: RunResult): Promise<RunResult> {
  if (!r.run || !toWake.delete(r.run)) return r;
  for (;;) {
    if (sleep.wokeAt !== undefined && net.isOnline()) break;
    if (sleep.wokeAt !== undefined && Date.now() - sleep.wokeAt > NETWORK_WAIT_MS) return r;
    await new Promise((go) => setTimeout(go, 2000));
  }
  const job = pending.take(r.run);
  if (!job || ending) return r;
  log?.info('auto resume', { run: r.run });
  return carryOn({ ...job, autoResumed: true });
}

/**
 * The stretch of a round since Claude Code last reported a total goes in the ledger as an estimate, once (B7): when the
 * round ends without a result, or before the shop goes down under it, as it may not live to hear the end.
 */
function countUnreported(r: Run, usd = r.unreported?.() ?? 0): number {
  if (r.counted) return 0;
  r.counted = true;
  return spend.estimate(r.job.workDir, r.job.sessionId, usd, now());
}

/** Keep the computer awake exactly while a round runs (B7). */
function keepAwake() {
  if (runs.size && awake === undefined) awake = powerSaveBlocker.start('prevent-app-suspension');
  else if (!runs.size && awake !== undefined) {
    powerSaveBlocker.stop(awake);
    awake = undefined;
  } else return;
  log?.info('keep awake', { on: awake !== undefined });
}

/**
 * Windows is shutting down or signing out (B7): every round under way or waiting is written down as interrupted before
 * anything else, as the system may end the shop any moment; then they are stopped and the shop closes, without the
 * question card. Next time it opens, one card lists them.
 */
function endSession(why: string) {
  if (ending) return;
  ending = true;
  quitting = true;
  leaving = true;
  const cut = pending.interrupt(Date.now());
  for (const r of runs.values()) countUnreported(r);
  log?.info('session end', { why, interrupted: cut.length });
  broker.cancelAll();
  for (const r of runs.values()) r.abort.abort();
  app.quit();
}

/**
 * Run a commission, fresh or continued. While it runs it is remembered on disk so it can be resumed after
 * a crash; once it ends (any outcome) that record goes away, and a failed run stays available for "try again".
 */
async function runJob(run: string, grant: Grant, job: Job, again: boolean, project?: Project): Promise<RunResult> {
  // What this round may spend was held as it left the queue, until it is settled once it ends (budget.ts, queued()).
  const abort = new AbortController();
  const started = Date.now();
  const title = commissionTitle(job.form);
  // A new commission has no project until it is written down; it goes by its own title until then.
  const who: RunProject = { id: project?.id, title: project?.title ?? title };
  // What goes in Adeng's notebook: the user's answers to questions, and where the work got stuck. Each round its own (B5).
  const me: Run = { id: run, job, project: who, abort, started, stuck: new StuckTracker(), choices: {} };
  const { stuck, choices } = me;
  job.run = run;
  job.state = 'running';
  job.at = started;
  delete job.why;
  runs.set(run, me);
  keepAwake();
  mini.feed({ type: 'run', running: true });
  pending.save(job);
  sendRuns();
  const tally = new RoundTally(started);
  log?.info('run start', { run, demo: Boolean(job.form.demo), again, resumed: Boolean(again && job.sessionId), together: runs.size, connections: job.form.connections?.length ?? 0 });
  const r = job.revise;
  // A round of changes is a round inside a project: it starts with what the staff remember of it (B3), and carries the
  // project's preferences there instead of the questions answered on the rest of the shop's work.
  const notes = memory.promptNotes(title, Boolean(r));
  broker.listen(run, (req, choice) => {
    const picked = req.kind === 'question' ? req.options.find((o) => o.id === choice && o.id !== 'delegate') : undefined;
    if (picked) choices[req.title] = picked.label;
  });
  const out = emittersFor(run, who);
  const background = r && project ? projectBackground(memory.projectBrief(project.id)!, project.rounds) : undefined;
  const revision: Revision | undefined = r && { ask: r.ask, form: job.form, summary: r.summary, restored: r.restored, background };
  // A round of changes picks up the earlier session when Claude Code still has it; otherwise it starts afresh from the folder.
  const pickUp = !again && r?.fromSession && sessionExists(r.fromSession) ? r.fromSession : undefined;
  let finished = false;
  let outcome: string | undefined;
  // In a folder the user lent (A6): what is there as the round starts, so what it made can be told apart afterwards.
  const lent = Boolean(job.form.inPlace);
  const atStart = lent ? entriesIn(job.workDir) : [];
  // The connections ticked on its slip (C4), kept with the slip for its later rounds and a schedule's.
  // None while the user has paused them all (C6); one paused mid-round is refused at its next call.
  const ticked = settings.get().connectionsPaused ? [] : connectionServers(job.form.connections, connections.list(), connectionServer);
  // Every round is watched, ticked connections or not: a session that read through one keeps the web tools asking (C6).
  const actions = new RoundActions({
    run, project: project?.id, log: actionLog, paused: () => settings.get().connectionsPaused,
    readFrom: connectionReads.get(again ? job.sessionId : pickUp),
    onRead: (label) => { if (job.sessionId) connectionReads.set(job.sessionId, label); },
  });
  const told = ticked.map((s) => {
    const c = connections.get(s.name)!;
    return { server: `nook-${c.id}`, label: c.label, brief: kindOf(c.kind)!.brief };
  });
  try {
    const before = new Set(job.preexisting);
    const result = await runAgent({
      prompt: withConnections(again ? continuePrompt(job.form, Boolean(job.sessionId), notes, revision)
        : revision ? revisePrompt(revision, Boolean(pickUp), notes)
        : job.form.demo ? demoPrompt(job.form, notes) : commissionPrompt(job.form, notes), told),
      nook: { servers: [...shopServers(), ...ticked], run, project: project?.id, actions },
      resume: again ? job.sessionId : pickUp,
      onSession: (id) => { job.sessionId = id; pending.save(job); if (actions.readFrom) connectionReads.set(id, actions.readFrom); },
      onInit: (info) => log?.info('run session', info),
      onInput: (add) => { me.note = (text) => add(meetingNote(text)); },
      onUnreported: (estimate) => { me.unreported = estimate; },
      workDir: job.workDir,
      recordingPath: recordingFor(job.form.demo ? 'demo' : 'commission'),
      broker: broker.forRun(run, who),
      credentials: credentials(),
      maxBudgetUsd: grant.usd,
      preexisting: before,
      keepOriginal: lent ? (file) => versions.keepOriginal(job.workDir, file) : undefined,
      abort,
      ...out,
      emitAi: (e) => { stuck.see(e); tally.see(e); out.emitAi(e); },
    });
    // Whatever the outcome, even called off: what it made so far must go too if the user undoes it.
    if (lent) versions.noteAdded(job.workDir, atStart, entriesIn(job.workDir));
    finished = result.ok;
    outcome = result.error;
    log?.info('run end', { run, ok: result.ok, error: result.error, detail: result.detail, costUsd: result.costUsd, seconds: Math.round((Date.now() - started) / 1000) });
    // Money spent counts whatever the outcome. A run called off reports nothing (real Claude Code, W11), so it adds nothing.
    // What it spent since Claude Code last said is estimated from its tokens, on a line of its own (B7).
    const spentThisRun = spend.record(job.workDir, job.sessionId, result.costUsd, now()) + countUnreported(me, result.estimatedUsd ?? 0);
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
    // Failed for the network around a sleep, it is carried on by itself (afterWake): no card, nothing in the notebook yet.
    const waking = resumeOnWake(job, result.error, sleep, Date.now());
    if (waking) toWake.add(run);
    if (result.error !== 'cancelled' && !waking) {
      const stuckHere = result.ok ? stuck.stuck : [...stuck.stuck, ...stuck.unresolved];
      const outcome = { result: result.ok ? 'done' as const : 'failed' as const, choices, costUsd, sessionId: job.sessionId, summary: result.summary };
      const changes = lent ? versions.lentChanges(job.workDir) : undefined;
      const outputs = changes ? lentOutputs(job.workDir, changes) : collectOutputs(job.workDir, before);
      // The main file may sit in a subfolder of a lent one.
      const main = outputs.main ? relative(job.workDir, outputs.main) : undefined;
      const round = { ...tally.result(Date.now(), result.ok, result.error), ...(result.contextTokens ? { contextTokens: result.contextTokens } : {}) };
      // A lent folder's own files are counted afresh each round (versions.usersFiles), so they are not written down;
      // what this commission changed or made there is, because only that goes in its zip.
      const touched = changes && [...changes.changed, ...changes.added].sort();
      const entry = r
        ? memory.revise(r.id, r.ask, { ...outcome, main, round, touched, usd: spentThisRun }, stuckHere, undefined, Boolean(r.scheduled) && !again)
        : memory.remember({ title, ...outcome, folder: job.workDir, form: job.form, preexisting: lent ? undefined : job.preexisting, main, rounds: [round], touched, usd: spentThisRun }, stuckHere);
      if (entry) keepRound(entry);
      // A new commission done together is one more for the shop; a round of changes is part of the same one.
      const grew = result.ok && !r ? memory.finished() : [];
      // A research write-up is checked against its sources and against what this round searched or fetched (C7).
      const F = strings.ui.files;
      const citations = job.form.template === 'research' ? citationsIn(job.workDir, { summary: F.summary, sources: F.sources }, result.seenUrls ?? []) : undefined;
      if (citations) cited.set(run, job.workDir);
      send(IPC.result, {
        citations, run, project: { ...who, id: entry?.project ?? who.id }, ok: result.ok, error, workDir: job.workDir, costUsd, summary: result.summary, ...outputs,
        converted: convertedNote(job.form, outputs.main), id: entry?.id, round: entry?.asks?.length ?? 0, canRestore: Boolean(r && !lent && entry && previousRound(entry)), canUndo: lent && versions.canUndo(job.workDir), grew, budget,
      });
      // The card first, its thumbnail when it is ready (C1): loading a page takes a moment, which the card need not wait for.
      if (outputs.main) {
        const shown = Date.now();
        void cardThumb(outputs.main, job.workDir, run).then((png) => {
          log?.info('result thumbnail', { ms: Date.now() - shown, kb: png ? Math.round(png.length / 1024) : 0 });
          if (png) send(IPC.resultPreview, { run, png });
        }, (err) => log?.warn('result thumbnail failed', String(err)));
      }
      const named = memory.get().projects.find((p) => p.id === entry?.project)?.title ?? who.title;
      notice(result.ok ? 'done' : error === 'budget' || stop ? 'budget' : 'failed', named, () => send(IPC.openResult, run));
    }
    return { ...result, run, ...stop, ...(stop ? { carryOn: true } : {}), error, spentThisRun, budget };
  } finally {
    broker.forget(run);
    // What is left to carry on (B7): interrupted by a shutdown it was written down already; stopping on the way out
    // promised it could be carried on, unless it got to the end first; a failed round is offered again, even after closing.
    if (ending) { /* written down as interrupted */ }
    else if (finished || (outcome === 'cancelled' && !quitting)) pending.clear(run);
    else if (quitting) pending.save({ ...job, state: 'stopped', at: Date.now() });
    else pending.save({ ...job, state: 'failed', why: outcome ?? 'failed', at: Date.now() });
    runs.delete(run);
    keepAwake();
    finishedIn.add(job.workDir);
    mini.feed({ type: 'run', running: runs.size > 0 });
    sendRuns();
  }
}

/**
 * Rounds whose card lists sources (C7), by run, with their commission folder: openSource opens only a web address that
 * the folder's own sources.json gives, read again at the click.
 */
const cited = new Map<string, string>();
ipcMain.handle(IPC.openSource, async (_e, run: unknown, n: unknown): Promise<boolean> => {
  const dir = typeof run === 'string' ? cited.get(run) : undefined;
  const file = dir && join(dir, strings.ui.files.sources);
  if (!file || !Number.isInteger(n) || !existsSync(file)) return false;
  const url = sourceUrl(readFileSync(file, 'utf8'), n as number);
  if (!url) return false;
  await shell.openExternal(url);
  return true;
});

// Files and folders the user picked in a dialog this session: the only sources a commission may use.
const picked = new Set<string>();
/** Folders the user chose to lend, after the checks for too broad and too big: only these can be worked in place. */
const lendable = new Set<string>();
ipcMain.handle(IPC.chooseSource, async (_e, id: CommissionTemplate): Promise<SourcePick | null> => {
  if (!win) return null;
  const source = template(id).source!;
  const r = await dialog.showOpenDialog(win, source.kind === 'folder'
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile'], filters: [{ name: strings.ui.templates[id], extensions: [...source.extensions] }] });
  const path = r.canceled ? undefined : r.filePaths[0];
  if (!path) return null;
  // Too big, or (C3) an Office file with macros that would run once its changed copy is opened.
  const problem = source.kind === 'file' ? sourceProblem(path, source.maxBytes) : undefined;
  if (problem) return { error: problem };
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
  lendable.add(path);
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
  if (form.source && !picked.has(form.source)) return { ok: false, recordingPath: '', workDir: '', error: 'source' };
  if (form.materials?.some((m) => !picked.has(m))) return { ok: false, recordingPath: '', workDir: '', error: 'source' };
  if (form.inPlace) return refused(undefined, '') ?? startLent(form, form.inPlace);
  return startNew(form);
});

/** A new commission in a new folder, asked of the caps first, then queued; `by` a schedule goes after the user's own (B5 rule 2). */
function startNew(form: CommissionForm, by: Ticket['by'] = 'user', schedule?: string): Promise<RunResult> {
  const stop = refused(undefined, '');
  if (stop) return Promise.resolve(stop);
  const f = form.demo ? { ...form, materials: undefined } : form;
  // Its folder is made when its turn comes, so one called off in the queue leaves nothing behind.
  return queued(undefined, undefined, commissionTitle(f), async (run, grant) => {
    const workDir = commissionDir(settings.get().workRoot, folderName(commissionTitle(f)));
    mkdirSync(workDir, { recursive: true });
    if (f.demo) prepareDemoFolder(workDir, join(app.getAppPath(), 'demo', 'check.js'));
    prepareSource(workDir, f);
    try { await copyMaterials(workDir, f.materials ?? [], pictureToPng); } catch (e) { return { run, ok: false, recordingPath: '', workDir, error: 'source', detail: String(e) }; }
    return runJob(run, grant, { form: f, workDir, preexisting: [...snapshot(workDir)], startedAt: Date.now(), ...(schedule ? { schedule } : {}) }, false);
  }, by);
}

/**
 * A commission in a folder the user lent. Nothing is copied in: what they hand over would land among their own files.
 * A folder grown too big since it was picked is refused here, before anything in it changes.
 */
function startLent(form: CommissionForm, folder: string): Promise<RunResult> {
  if (!lendable.has(folder)) return Promise.resolve({ ok: false, recordingPath: '', workDir: '', error: 'source' });
  if (tooBigToLend(folder)) return Promise.resolve({ ok: false, recordingPath: '', workDir: '', error: 'tooBig' });
  return queued(folder, undefined, commissionTitle(form), (run, grant) => {
    // An earlier work here can't be undone any more: putting its originals back would undo this one as well.
    for (const c of memory.get().commissions) if (c.form?.inPlace && c.result === 'done' && overlaps(c.folder!, folder)) versions.dropLent(c.folder!);
    return runJob(run, grant, { form: { ...form, materials: undefined, source: undefined, demo: false }, workDir: folder, preexisting: versions.usersFiles(folder), startedAt: Date.now() }, false);
  });
}

/**
 * Another round on finished work, in the same folder: what the shop made so far is kept aside first
 * (the "previous version"), then the staff pick up where they left off.
 */
ipcMain.handle(IPC.reviseCommission, async (_e, req: ReviseRequest): Promise<RunResult> => {
  const ask = typeof req?.ask === 'string' ? req.ask.trim().slice(0, 2000) : '';
  const memo = typeof req?.id === 'string' ? memory.find(req.id) : memory.latest();
  if (!memo || !ask) return { ok: false, recordingPath: '', workDir: '', error: 'gone' };
  return reviseRound(memo, ask);
});
/** Another round on a commission's project, from the result card or a schedule (B6), queued behind its project's other rounds. */
async function reviseRound(memo: CommissionMemo, ask: string, by: Ticket['by'] = 'user', schedule?: string): Promise<RunResult> {
  if (!memo.folder || !existsSync(memo.folder)) return { ok: false, recordingPath: '', workDir: memo.folder ?? '', error: 'gone' };
  // In a folder the user lent, their files are counted again (they may have added some), and a round that could not
  // be undone does not start. The originals kept so far are what undoing goes back to, so no previous version is kept.
  const lent = Boolean(memo.form?.inPlace);
  if (lent && tooBigToLend(memo.folder)) return { ok: false, recordingPath: '', workDir: '', error: 'tooBig' };
  const project = memory.get().projects.find((p) => p.id === memo.project);
  const stop = refused(project, memo.folder);
  if (stop) return stop;
  const folder = memo.folder;
  // What the round starts from is kept when its turn comes: a round of the same project before it may still change it.
  return queued(folder, project, project?.title ?? memo.title, (run, grant) => {
    const latest = memory.find(memo.id)!;
    const preexisting = lent ? versions.usersFiles(folder) : latest.preexisting ?? [];
    const restored = restoredSince.has(memo.id);
    restoredSince.delete(memo.id);
    keepLatest(latest);
    const form = latest.form ?? { want: latest.title };
    // A session grown long, or left for over a week, is not picked up: the project background and the folder carry the work
    // over (B3), and a fresh session reads far less each round.
    const fromSession = newSession(latest.rounds?.at(-1) ?? { date: latest.date }, localDay(now())) ? undefined : latest.sessionId;
    return runJob(run, grant, {
      form, workDir: folder, preexisting, startedAt: Date.now(), ...(schedule ? { schedule } : {}),
      revise: { id: memo.id, ask, fromSession, summary: latest.summary, restored, ...(by === 'schedule' ? { scheduled: true } : {}) },
    }, false, project);
  }, by);
}

/**
 * A system notification about a project (road-to-1.2.md B6), only while the user is away from the shop and has them on:
 * its name and how it went, never what is in its files. The log has the kind only, as it goes into the diagnostics.
 */
function notice(kind: 'done' | 'failed' | 'budget' | 'skipped', project: string, open: () => void = () => {}) {
  if (!settings.get().notify) return;
  const T = strings.ui.tray;
  if (tray.notice(fill(T[`${kind}Title`], { project }), T[`${kind}Body`], open)) log?.info('notice', { kind });
}

let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * Look at the scheduled commissions (road-to-1.2.md B6). A due one's slip goes in the queue, behind what the user started.
 * One missed while the shop was closed or the computer asleep runs once if it is recent; what was skipped is written on it
 * for the project board. Then sleep until the next due time, an hour at most. Paused from the tray, none is looked at.
 */
function lookAtSchedules() {
  clearTimeout(scheduleTimer);
  if (!settings.get().schedulesPaused) {
    // A schedule whose round is still to be carried on (interrupted, failed) does not run again meanwhile (B7).
    const held = new Set(pending.list().map((j) => j.schedule));
    for (const s of schedules.list()) {
      const d = due(s, now(), held.has(s.id));
      // Held (B7), its due time only moves on.
      if (!d.run && !d.missed.length && d.next === s.next) continue;
      const missed = d.missed.at(-1);
      schedules.update(s.id, { next: d.next ?? s.next, enabled: d.next !== null, ...(missed ? { missed } : {}) });
      log?.info('schedule due', { run: d.run, missed: d.missed.length });
      if (d.run) runScheduled(s);
    }
  }
  scheduleTimer = setTimeout(lookAtSchedules, wakeIn(schedules.list(), now()));
}
/**
 * A scheduled round: another round in its project, or a new commission. It waits for answers like any other and holds its
 * place while it does (B5 rule 4). Turned away by a cap before it starts, it is skipped, with a note and a notice (B8).
 */
function runScheduled(s: Schedule) {
  const project = memory.get().projects.find((p) => p.id === s.project);
  const title = project?.title ?? commissionTitle(s.form);
  const start = project ? reviseRound(memory.find(project.commissions.at(-1)!)!, s.form.want, 'schedule', s.id) : startNew(s.form, 'schedule', s.id);
  void start.then((r) => {
    if (r.error === 'cancelled') return;
    if (r.cap && !r.run) {
      schedules.update(s.id, { last: { at: now().toISOString(), result: 'skipped', why: r.error } });
      notice('skipped', title);
      return;
    }
    scheduleRan(s.id, r);
    // The page shows its card as for a round the user started.
    send(IPC.scheduled, { ...r, title });
  });
}
/** How a schedule's round went, for the project board; called off (the shop closing, the computer shutting down) is no outcome. */
function scheduleRan(id: string, r: RunResult) {
  if (r.error === 'cancelled' || !schedules.list().some((s) => s.id === id)) return;
  schedules.update(id, { last: { at: now().toISOString(), result: r.ok ? 'done' : 'failed', ...(r.error ? { why: r.error } : {}) } });
}
/** When a schedule comes round, as set on the "do it regularly" card: checked here, as the page could send anything. */
function cleanEvery(every: unknown): ScheduleEvery | null {
  const e = every as ScheduleEvery;
  const clock = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (e?.kind === 'daily' && clock(e.time)) return { kind: 'daily', time: e.time };
  if (e?.kind === 'weekly' && Number.isInteger(e.weekday) && e.weekday >= 0 && e.weekday <= 6 && clock(e.time)) return { kind: 'weekly', weekday: e.weekday, time: e.time };
  if (e?.kind === 'once' && typeof e.at === 'string' && /^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d$/.test(e.at)) return { kind: 'once', at: e.at };
  return null;
}
ipcMain.handle(IPC.saveSchedule, (_e, project: unknown, want: unknown, every: unknown): Schedule | null => {
  const p = memory.get().projects.find((x) => x.id === project);
  const ask = typeof want === 'string' ? want.trim().slice(0, 2000) : '';
  const when = cleanEvery(every);
  const next = when && nextTime(when, now());
  if (!p || !ask || !when || !next) return null;
  const s: Schedule = { id: `s${Date.now()}`, project: p.id, form: { want: ask }, every: when, next: next.toISOString(), enabled: true };
  schedules.add(s);
  log?.info('schedule saved', { every: when.kind });
  lookAtSchedules();
  return s;
});
ipcMain.handle(IPC.removeSchedule, (_e, id: unknown): boolean => {
  if (typeof id !== 'string' || !schedules.list().some((s) => s.id === id)) return false;
  schedules.remove(id);
  lookAtSchedules();
  return true;
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
    if (howToOpen(main).open) return (await shell.openPath(main)) === '';
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
  if (!memo?.main || (memo.folder && busyIn(memo.folder))) return 'cancelled';
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
  if (!p || busyIn(p.folder) || !projectVersions.has(p.id, to) || !existsSync(p.folder)) return false;
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

/** Where a project stands: at work, waiting for the user's answer, in the queue (B5), or how its latest commission came out. */
function statusOf(id: string): ProjectStatus {
  const p = memory.get().projects.find((x) => x.id === id)!;
  const at = [...runs.values()].find((r) => r.project.id === p.id || r.job.workDir === p.folder);
  if (at) return broker.waitingOn(at.id) ? 'waiting' : 'running';
  if (queue.queued.some((t) => t.project === p.id)) return 'queued';
  return projectSettled(p, memory.get().commissions);
}
/** A queued round as the board shows it: called off from there, with why it waits and behind whom. */
function queueNote(t: Waiting): ProjectRow['queue'] {
  const info = runInfos().find((i) => i.run === t.id)!;
  return { run: t.id, waits: info.waits!, behind: info.behind ?? [] };
}
const rowOf = (id: string): ProjectRow => {
  const all = memory.get().projects;
  const p = all.find((x) => x.id === id)!;
  const waiting = queue.queued.find((t) => t.project === p.id);
  return {
    ...boardRow(p, spentOn(p).project, statusOf(id), all.indexOf(p)), ...(waiting && statusOf(id) === 'queued' ? { queue: queueNote(waiting) } : {}),
    schedules: schedules.list().filter((s) => s.project === p.id),
  };
};
/** New commissions under way or in the queue have no project yet: each is a row of its own, in the colour its project will get. */
function freshRows(): ProjectRow[] {
  const count = memory.get().projects.length;
  const row = (id: string, title: string, status: ProjectStatus, i: number): ProjectRow =>
    ({ id, title, touched: localDay(now()), rounds: 0, usd: 0, status, archived: false, lent: false, color: count + i, fresh: true });
  const under = [...runs.values()].filter((r) => !r.project.id).map((r, i) => row(r.id, r.project.title, broker.waitingOn(r.id) ? 'waiting' : 'running', i));
  const waiting = queue.queued.filter((t) => !t.project).map((t, i) => ({ ...row(t.id, t.title, 'queued', under.length + i), queue: queueNote(t) }));
  return [...under, ...waiting];
}
ipcMain.handle(IPC.projectBoard, (): ProjectRow[] => [...freshRows(), ...memory.get().projects.map((p) => rowOf(p.id)).sort((a, b) => b.touched.localeCompare(a.touched))]);
ipcMain.handle(IPC.projectTimeline, (_e, id: string): ProjectTimeline | null => {
  const p = memory.get().projects.find((x) => x.id === id);
  if (!p) return null;
  const from = p.from && memory.get().projects.find((x) => x.id === p.from!.project);
  return {
    project: rowOf(p.id), rounds: timelineRows(p, memory.get().commissions, (n) => projectVersions.has(p.id, n)),
    ...(from ? { from: { title: from.title, round: p.from!.round } } : {}), brief: memory.projectBrief(p.id)!,
  };
});
ipcMain.handle(IPC.saveBrief, (_e, id: string, brief: unknown): boolean => typeof id === 'string' && memory.editBrief(id, brief, now()));
ipcMain.handle(IPC.forgetProject, (_e, id: string): boolean => {
  const ok = typeof id === 'string' && memory.forgetProject(id, now());
  log?.info('forget project', { ok });
  return ok;
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
  const file = main && existsSync(join(lookingAt, main)) && isInside(lookingAt, join(lookingAt, main)) ? join(lookingAt, main) : lookingAt;
  log?.info('open version', { round });
  // Same rule as opening a work: only kinds that are safe to open; anything else is shown in its folder.
  if (file !== lookingAt && !howToOpen(file).open) { shell.showItemInFolder(file); return true; }
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
  if (typeof id !== 'string') return null;
  const memo = memory.find(id);
  if (!memo?.form?.inPlace || !memo.folder || [...runs.values()].some((r) => overlaps(r.job.workDir, memo.folder!))) return null;
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
// Try again: once per round, so a second click, or the wake getting there first, does nothing (B7).
ipcMain.handle(IPC.retryCommission, async (_e, run: unknown): Promise<RunResult | null> => {
  const job = typeof run === 'string' ? pending.take(run) : undefined;
  return job ? carryOn(job) : null;
});
// Stop a round under way, or call off one still in the queue: nothing was held or spent for that one yet (B5 rule 3).
ipcMain.handle(IPC.cancelCommission, (_e, run: unknown) => {
  if (typeof run !== 'string') return;
  const waiting = queue.cancel(run);
  if (!waiting) return runs.get(run)?.abort.abort();
  log?.info('run called off in the queue');
  waiting.drop();
  pump();
});
// Rounds left over from before (a crash, "stop and close", a failure, a shutdown): offered when the shop opens (B7).
ipcMain.handle(IPC.pendingRounds, (): PendingRound[] => pending.left().map((j) => ({ run: j.run!, state: j.state ?? 'running', form: j.form, title: commissionTitle(j.form) })));
// Each carries on as a new round with a run id of its own, once.
ipcMain.handle(IPC.resumePending, async (_e, run: unknown): Promise<RunResult | null> => {
  const job = typeof run === 'string' ? pending.take(run) : undefined;
  return job ? carryOn(job) : null;
});
ipcMain.handle(IPC.dropPending, (_e, run: unknown) => {
  if (typeof run === 'string') pending.take(run);
});

ipcMain.handle(IPC.answer, (_e, answer: DecisionAnswer) => {
  const ok = broker.answer(answer);
  if (!broker.waiting) {
    tray.calm();
    mini.feed({ type: 'answered' });
  }
  sendRuns();
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
  actionLog = new ActionLog(join(dir, 'actions.jsonl'));
  connectionReads = new ConnectionReads(join(dir, 'connection-reads.json'));
  settings = new SettingsStore(join(dir, 'settings.json'), app.getPath('documents'), () => startingMonthCap(spend.months(), now()));
  pending = new PendingStore(join(dir, 'pending'), join(dir, 'pending.json'));
  schedules = new ScheduleStore(join(dir, 'schedules.json'));
  memory = new MemoryStore(join(dir, 'memory.json'));
  versions = new VersionStore(join(dir, 'versions'));
  projectVersions = new ProjectVersions(join(dir, 'versions'));
  if (memory.damage || settings.damaged || spend.damaged) log?.warn('data files could not be read', { notebook: memory.damage, settings: settings.damaged, ledger: spend.damaged });
  pending.load();
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
// A meeting: the user's note goes to the round it was called for (B9), or the first under way when none is named; false
// if that round has wrapped up.
ipcMain.handle(IPC.addNote, (_e, text: string, run?: string): boolean => {
  const clean = typeof text === 'string' ? text.trim().slice(0, 500) : '';
  const to = typeof run === 'string' ? runs.get(run) : lead();
  return Boolean(clean && to?.note?.(clean));
});
ipcMain.handle(IPC.clearMemory, (): boolean => {
  // What it is doing would go straight back in the notebook, and the ledger would count the round twice.
  if (runs.size || queue.queued.length) return false;
  memory.clear();
  versions.clear();
  spend.forget();
  actionLog.clear();
  // connection-reads.json stays: a session it marks may still be carried on, and must keep asking (C6). It holds only
  // session ids and connection names, nothing that was read.
  pruneRecordings(join(app.getPath('userData'), 'recordings'), 0);
  prunePreviews(previewsDir(), 0);
  return true;
});
ipcMain.handle(IPC.clearStats, () => memory.clearStats());
// Only folders the notebook itself recorded, looked up by id.
ipcMain.handle(IPC.openCommissionFolder, async (_e, id: string): Promise<boolean> => {
  const folder = memory.get().commissions.find((c) => c.id === id)?.folder;
  if (!folder || !existsSync(folder)) return false;
  return (await shell.openPath(folder)) === '';
});

// Only files from the folders of rounds under way or finished since the shop opened can be opened from the renderer.
ipcMain.handle(IPC.openOutput, async (_e, path: string, how: 'open' | 'reveal'): Promise<{ ok: boolean; why?: NotOpened }> => {
  if (typeof path !== 'string') return { ok: false };
  const allowed = [...[...runs.values()].map((r) => r.job.workDir), ...finishedIn];
  if (!allowed.some((dir) => insideForReal(dir, path))) return { ok: false };
  if (how === 'reveal') { shell.showItemInFolder(path); return { ok: true }; }
  // Only kinds that are safe to open (open-rule.ts); an Office file that failed its look inside says why on the card.
  const rule = howToOpen(path);
  if (rule.open) await shell.openPath(path);
  else shell.showItemInFolder(path);
  return rule.open || !rule.why ? { ok: true } : { ok: true, why: rule.why };
});

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
  connections = new ConnectionStore(app.getPath('userData'), safeStorage);
  pruneRecordings(join(app.getPath('userData'), 'recordings'));
  prunePreviews(previewsDir());
  createWindow();
  startUpdates();
  tray.create();
  tray.onPause = (on) => {
    settings.update({ schedulesPaused: on });
    log?.info('schedules paused', { on });
    sendRuns();
    lookAtSchedules();
  };
  sendRuns();
  win?.on('focus', () => tray.calm());
  // Scheduled commissions once the page can show their rounds, and again on waking from sleep (B6).
  win?.webContents.once('did-finish-load', lookAtSchedules);
  // Sleep (B7): when it went down, and on waking the time it came back; rounds that failed for the network around it carry on.
  powerMonitor.on('suspend', () => {
    sleep.suspend(Date.now());
    log?.info('suspend', { running: runs.size });
  });
  powerMonitor.on('resume', () => {
    sleep.resume(Date.now());
    log?.info('resume');
    lookAtSchedules();
  });
  // Sleep, waking and a shutdown played from a test, never in a packaged build.
  if (!app.isPackaged) {
    const asEmitter = (o: unknown) => o as { emit: (event: string, ...args: unknown[]) => boolean };
    (globalThis as { __lamplightPower?: unknown }).__lamplightPower = {
      suspend: () => asEmitter(powerMonitor).emit('suspend'),
      resume: () => asEmitter(powerMonitor).emit('resume'),
      shutdown: () => win && asEmitter(win).emit('session-end', { preventDefault: () => {}, reasons: ['shutdown'] }),
    };
  }
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
  // Stopped on the way out, written down as such now: the shop may be gone before the rounds end (B7). What they spent
  // since they last said is estimated now for the same reason.
  for (const r of runs.values()) {
    if (!ending) pending.save({ ...r.job, state: 'stopped', at: Date.now() });
    countUnreported(r);
  }
  for (const r of runs.values()) r.abort.abort();
  // Closing for real, with any commission let finish or stopped just above: a new version fetched earlier goes in now.
  updates?.quitting();
});
app.on('window-all-closed', () => app.quit());
