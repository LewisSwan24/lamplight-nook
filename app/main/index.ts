import './locale-boot';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { arch, homedir, release } from 'node:os';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, crashReporter, dialog, ipcMain, net, safeStorage, session, shell } from 'electron';
import { fill, locale, shorten, strings } from '../shared/i18n';
import { IPC, type GuestId, type AiEvent, type CommissionForm, type DecisionAnswer, type EnvStatus, type ExternalLink, type KeySaveResult, type Memory, type Recall, type ReviseRequest, type RunResult, type ShopState, type Settings, type SourcePick, type HandOver, type Material, type WriteResult, type Letter } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, runAgent } from './agent-runner';
import { KeyStore, keyHint, pickCredentials, saveKey } from './api-key';
import { installCommand, locateClaude, runInstaller } from './claude-locator';
import { EDITABLE, MAX_EDIT_BYTES, type Revision, collectOutputs, commissionPrompt, commissionTitle, continuePrompt, demoPrompt, meetingNote, prepareDemoFolder, prepareSource, revisePrompt, snapshot, folderName } from './commission';
import { sessionExists } from './sessions';
import { VersionStore } from './versions';
import { migrate } from './migrate';
import { claudeVersion } from './claude-version';
import { feedbackMail, mailtoUrl, osName } from './feedback';
import { MemoryStore, StuckTracker } from './memory';
import { type Job, PendingStore } from './pending';
import { DecisionBroker } from './decision-broker';
import { isInside } from './paths';
import { diagnosticsEntries } from './diagnostics';
import { Log } from './log';
import { SettingsStore, defaultWorkRoot } from './settings';
import { SpendLedger } from './spend';
import { zip } from './zip';
import { ShopTray } from './tray';
import { MiniWindow } from './mini';
import { copyMaterials, sortHandOver } from './materials';
import { stepCount } from '../shared/board';
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
let keys: KeyStore;
let spend: SpendLedger;
/** The last commission that failed (offered as "try again"), and one left over from a crash. */
let lastFailed: Job | null = null;
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
      leaving = false;
      e.preventDefault();
      return;
    }
    quitting = true;
    pending.clear();
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
ipcMain.handle(IPC.spendThisMonth, (): number => spend.thisMonth());
ipcMain.handle(IPC.spendMonths, () => spend.months());

ipcMain.handle(IPC.getSettings, (): Settings => settings.get());
ipcMain.handle(IPC.saveSettings, (_e, patch: Partial<Settings>): Settings => {
  // Where commissions are written is chosen in the folder dialog (chooseWorkRoot), never sent from the page.
  const { workRoot: _ignored, ...rest } = patch && typeof patch === 'object' ? patch : ({} as Partial<Settings>);
  return settings.update(rest);
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
 * Run a commission, fresh or continued. While it runs it is remembered on disk so it can be resumed after
 * a crash; once it ends (any outcome) that record goes away, and a failed run stays available for "try again".
 */
async function runJob(job: Job, again: boolean): Promise<RunResult> {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  const abort = new AbortController();
  current = { workDir: job.workDir, abort };
  mini.feed({ type: 'run', running: true });
  pending.save(job);
  const started = Date.now();
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
      maxBudgetUsd: settings.get().budgetUsd || undefined,
      preexisting: before,
      abort,
      ...emitters,
      emitAi: (e) => { stuck.see(e); emitters.emitAi(e); },
    });
    log?.info('run end', { ok: result.ok, error: result.error, detail: result.detail, costUsd: result.costUsd, seconds: Math.round((Date.now() - started) / 1000) });
    // Money spent counts whatever the outcome, cancelled runs included.
    const spentThisRun = spend.record(job.workDir, job.sessionId, result.costUsd);
    const costUsd = spend.forCommission(job.workDir) || undefined;
    if (result.error !== 'cancelled') {
      const stuckHere = result.ok ? stuck.stuck : [...stuck.stuck, ...stuck.unresolved];
      const outcome = { result: result.ok ? 'done' as const : 'failed' as const, choices, costUsd, sessionId: job.sessionId, summary: result.summary };
      const outputs = collectOutputs(job.workDir, before);
      const main = outputs.main ? basename(outputs.main) : undefined;
      const entry = r
        ? memory.revise(r.id, r.ask, { ...outcome, main }, stuckHere)
        : memory.remember({ title, ...outcome, folder: job.workDir, form: job.form, preexisting: job.preexisting, main }, stuckHere);
      // A new commission done together is one more for the shop; a round of changes is part of the same one.
      const grew = result.ok && !r ? memory.finished() : [];
      send(IPC.result, {
        ok: result.ok, workDir: job.workDir, costUsd, summary: result.summary, ...outputs,
        id: entry?.id, round: entry?.asks?.length ?? 0, canRestore: Boolean(r && versions.has(r.id)), grew,
      });
    }
    lastFailed = result.ok || result.error === 'cancelled' ? null : job;
    return { ...result, spentThisRun };
  } finally {
    broker.onAnswered = undefined;
    pending.clear();
    current = null;
    lastWorkDir = job.workDir;
    mini.feed({ type: 'run', running: false });
  }
}

// Files and folders the user picked in a dialog this session: the only sources a commission may use.
const picked = new Set<string>();
ipcMain.handle(IPC.chooseSource, async (_e, kind: 'edit' | 'tidy'): Promise<SourcePick | null> => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, kind === 'tidy'
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile'], filters: [{ name: strings.ui.templates.edit, extensions: EDITABLE }] });
  const path = r.canceled ? undefined : r.filePaths[0];
  if (!path) return null;
  if (kind === 'edit' && statSync(path).size > MAX_EDIT_BYTES) return { error: 'too-big' };
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
  if (form.demo) form = { ...form, materials: undefined };
  const workDir = commissionDir(settings.get().workRoot, folderName(commissionTitle(form)));
  mkdirSync(workDir, { recursive: true });
  if (form.demo) prepareDemoFolder(workDir, join(app.getAppPath(), 'demo', 'check.js'));
  prepareSource(workDir, form);
  try { copyMaterials(workDir, form.materials ?? []); } catch (e) { return { ok: false, recordingPath: '', workDir, error: 'source', detail: String(e) }; }
  return runJob({ form, workDir, preexisting: [...snapshot(workDir)], startedAt: Date.now() }, false);
});

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
  const preexisting = memo.preexisting ?? [];
  const restored = restoredSince.has(memo.id);
  restoredSince.delete(memo.id);
  versions.save(memo.id, memo.folder, new Set(preexisting));
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
/** Commissions put back to their previous version since their last round (the next round is told). */
const restoredSince = new Set<string>();
ipcMain.handle(IPC.restorePrevious, (_e, id: string): boolean => {
  if (current || typeof id !== 'string') return false;
  const memo = memory.find(id);
  if (!memo?.folder || !versions.has(id)) return false;
  const ok = versions.restore(id, memo.folder, new Set(memo.preexisting ?? []));
  if (ok) restoredSince.add(id);
  log?.info('restore previous', { ok });
  return ok;
});
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
// A meeting at the big table: the user's note goes to the running commission (false if it has wrapped up).
ipcMain.handle(IPC.addNote, (_e, text: string): boolean => {
  const clean = typeof text === 'string' ? text.trim().slice(0, 500) : '';
  return Boolean(clean && current?.note?.(clean));
});
ipcMain.handle(IPC.clearMemory, () => {
  memory.clear();
  versions.clear();
});
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

app.whenReady().then(() => {
  // Nothing in the shop needs the camera, the microphone, notifications from the page or anything like them.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  log = new Log(join(app.getPath('userData'), 'logs'));
  log.prune();
  log.info('app start', { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, release: release() });
  app.on('child-process-gone', (_e, details) => log?.warn('child process gone', details));
  // Older versions' data is brought up to date (with a copy kept aside) before anything reads it.
  const migrated = migrate(app.getPath('userData'));
  if (migrated.to !== migrated.from || migrated.changes.length) log.info('data migrated', migrated);
  settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), app.getPath('documents'));
  pending = new PendingStore(join(app.getPath('userData'), 'pending.json'));
  memory = new MemoryStore(join(app.getPath('userData'), 'memory.json'));
  versions = new VersionStore(join(app.getPath('userData'), 'versions'));
  keys = new KeyStore(join(app.getPath('userData'), 'api-key.bin'), safeStorage);
  spend = new SpendLedger(join(app.getPath('userData'), 'spend.json'));
  leftover = pending.load();
  createWindow();
  tray.create();
  win?.on('focus', () => tray.calm());
});
// The corner window: what to show now, and a click on it brings the shop back.
ipcMain.handle(IPC.miniState, () => mini.state);
ipcMain.handle(IPC.showShop, () => tray.show());
app.on('before-quit', () => {
  leaving = true;
  mini.destroy();
  broker.cancelAll();
  current?.abort.abort();
});
app.on('window-all-closed', () => app.quit());
