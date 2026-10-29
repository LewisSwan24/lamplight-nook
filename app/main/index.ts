import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, net, safeStorage, shell } from 'electron';
import { fill, strings } from '../shared/i18n';
import { IPC, type AiEvent, type CommissionForm, type DecisionAnswer, type EnvStatus, type ExternalLink, type KeySaveResult, type Memory, type Recall, type RunResult, type Settings } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, runAgent } from './agent-runner';
import { KeyStore, keyHint, pickCredentials, saveKey } from './api-key';
import { installCommand, locateClaude } from './claude-locator';
import { collectOutputs, commissionPrompt, commissionTitle, continuePrompt, demoPrompt, meetingNote, prepareDemoFolder, snapshot } from './commission';
import { MemoryStore, StuckTracker } from './memory';
import { type Job, PendingStore } from './pending';
import { DecisionBroker } from './decision-broker';
import { isInside } from './paths';
import { SettingsStore } from './settings';
import { SpendLedger } from './spend';
import { ShopTray } from './tray';

const here = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null;

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);
const broker = new DecisionBroker((req) => {
  send(IPC.decision, req);
  tray.attention(req, settings.get().notify);
});
const iconDir = () => join(app.getAppPath(), 'assets', 'ui');
/** The lamp in the tray. Quitting from its menu closes for real, even with "close to tray" on. */
const tray = new ShopTray(iconDir(), () => win, () => { leaving = true; win?.close(); });
/** The commission currently running (one at a time), and the folder of the last one. */
let current: { workDir: string; abort: AbortController; note?: (text: string) => boolean } | null = null;
let lastWorkDir: string | null = null;
let settings: SettingsStore;
let pending: PendingStore;
let memory: MemoryStore;
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
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(here, '../renderer/index.html'));
}

const recordingFor = (kind: string) => join(app.getPath('userData'), 'recordings', `${Date.now()}-${kind}.jsonl`);
const emitters = {
  emit: (event: unknown) => send(IPC.rawEvent, event),
  emitAi: (event: AiEvent) => send(IPC.aiEvent, { ...event, raw: undefined }),
};

// The key is only read in the main process; the renderer just gets a boolean.
// Debug tools are for development; a packaged build hides them unless LAMPLIGHT_DEBUG=1.
const debugEnabled = () => !app.isPackaged || process.env.LAMPLIGHT_DEBUG === '1';
/** The key saved in the app wins over ANTHROPIC_API_KEY; a dev subscription only counts unpackaged. */
const credentials = () => pickCredentials(keys.get(), process.env, app.isPackaged);
ipcMain.handle(IPC.envStatus, (): EnvStatus => {
  const creds = credentials();
  return {
    hasApiKey: creds !== null,
    hasClaude: locateClaude() !== null,
    debug: debugEnabled(),
    keySource: creds?.source ?? null,
    keyHint: creds?.apiKey ? keyHint(creds.apiKey) : undefined,
    installCommand: installCommand(process.platform),
    platform: process.platform,
  };
});
ipcMain.handle(IPC.copyInstallCommand, () => clipboard.writeText(installCommand(process.platform)));
ipcMain.handle(IPC.saveApiKey, (_e, key: unknown): Promise<KeySaveResult> =>
  saveKey(typeof key === 'string' ? key : '', keys, (url, init) => net.fetch(url, init)));
ipcMain.handle(IPC.clearApiKey, () => keys.clear());
ipcMain.handle(IPC.spendThisMonth, (): number => spend.thisMonth());

ipcMain.handle(IPC.getSettings, (): Settings => settings.get());
ipcMain.handle(IPC.saveSettings, (_e, patch: Partial<Settings>): Settings => settings.update(patch));
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
  pending.save(job);
  // What goes in Adeng's notebook: the user's answers to questions, and where the work got stuck.
  const title = commissionTitle(job.form);
  const notes = memory.promptNotes(title);
  const choices: Record<string, string> = {};
  const stuck = new StuckTracker();
  broker.onAnswered = (req, choice) => {
    const picked = req.kind === 'question' ? req.options.find((o) => o.id === choice && o.id !== 'delegate') : undefined;
    if (picked) choices[req.title] = picked.label;
  };
  try {
    const before = new Set(job.preexisting);
    const result = await runAgent({
      prompt: again ? continuePrompt(job.form, Boolean(job.sessionId), notes) : job.form.demo ? demoPrompt(job.form, notes) : commissionPrompt(job.form, notes),
      resume: again ? job.sessionId : undefined,
      onSession: (id) => { job.sessionId = id; pending.save(job); },
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
    // Money spent counts whatever the outcome, cancelled runs included.
    spend.record(job.workDir, job.sessionId, result.costUsd);
    const costUsd = spend.forCommission(job.workDir) || undefined;
    if (result.error !== 'cancelled') {
      send(IPC.result, { ok: result.ok, workDir: job.workDir, costUsd, ...collectOutputs(job.workDir, before) });
      memory.remember({ title, result: result.ok ? 'done' : 'failed', choices, folder: job.workDir, costUsd }, result.ok ? stuck.stuck : [...stuck.stuck, ...stuck.unresolved]);
    }
    lastFailed = result.ok || result.error === 'cancelled' ? null : job;
    return result;
  } finally {
    broker.onAnswered = undefined;
    pending.clear();
    current = null;
    lastWorkDir = job.workDir;
  }
}

ipcMain.handle(IPC.startCommission, async (_e, form: CommissionForm): Promise<RunResult> => {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  const workDir = commissionDir(settings.get().workRoot, commissionTitle(form));
  mkdirSync(workDir, { recursive: true });
  if (form.demo) prepareDemoFolder(workDir, join(app.getAppPath(), 'demo', 'check.js'));
  return runJob({ form, workDir, preexisting: [...snapshot(workDir)], startedAt: Date.now() }, false);
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
  if (!broker.waiting) tray.calm();
  return ok;
});
ipcMain.handle(IPC.recallForCommission, (_e, form: CommissionForm): Recall => memory.recallForCommission(commissionTitle(form)));
ipcMain.handle(IPC.recallOnOpen, (): Recall => memory.recallOnOpen());
ipcMain.handle(IPC.getMemory, (): Memory => memory.get());
// A meeting at the big table: the user's note goes to the running commission (false if it has wrapped up).
ipcMain.handle(IPC.addNote, (_e, text: string): boolean => {
  const clean = typeof text === 'string' ? text.trim().slice(0, 500) : '';
  return Boolean(clean && current?.note?.(clean));
});
ipcMain.handle(IPC.clearMemory, () => memory.clear());

// Only files from the current or last commission folder can be opened from the renderer.
ipcMain.handle(IPC.openOutput, async (_e, path: string, how: 'open' | 'reveal') => {
  const allowed = [current?.workDir, lastWorkDir].filter(Boolean) as string[];
  if (!allowed.some((dir) => isInside(dir, path))) return false;
  if (how === 'reveal') shell.showItemInFolder(path);
  else await shell.openPath(path);
  return true;
});

app.whenReady().then(() => {
  settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), app.getPath('documents'));
  pending = new PendingStore(join(app.getPath('userData'), 'pending.json'));
  memory = new MemoryStore(join(app.getPath('userData'), 'memory.json'));
  keys = new KeyStore(join(app.getPath('userData'), 'api-key.bin'), safeStorage);
  spend = new SpendLedger(join(app.getPath('userData'), 'spend.json'));
  leftover = pending.load();
  createWindow();
  tray.create();
  win?.on('focus', () => tray.calm());
});
app.on('before-quit', () => {
  leaving = true;
  broker.cancelAll();
  current?.abort.abort();
});
app.on('window-all-closed', () => app.quit());
