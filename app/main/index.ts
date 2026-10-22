import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fill, strings } from '../shared/i18n';
import { IPC, type CommissionForm, type DecisionAnswer, type EnvStatus, type ExternalLink, type RunResult, type Settings } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, hasCredentials, runAgent } from './agent-runner';
import { locateClaude } from './claude-locator';
import { collectOutputs, commissionPrompt, continuePrompt, demoPrompt, prepareDemoFolder, snapshot } from './commission';
import { type Job, PendingStore } from './pending';
import { DecisionBroker } from './decision-broker';
import { isInside } from './paths';
import { SettingsStore } from './settings';

const here = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null;

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);
const broker = new DecisionBroker((req) => send(IPC.decision, req));
/** The commission currently running (one at a time), and the folder of the last one. */
let current: { workDir: string; abort: AbortController } | null = null;
let lastWorkDir: string | null = null;
let settings: SettingsStore;
let pending: PendingStore;
/** The last commission that failed (offered as "try again"), and one left over from a crash. */
let lastFailed: Job | null = null;
let leftover: Job | null = null;
/** Set once the user chose to stop and close, so the close prompt doesn't come back. */
let quitting = false;

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
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Closing mid-commission asks first; stopping is the second, deliberate choice.
  win.on('close', (e) => {
    if (!current || quitting || !win) return;
    const R = strings.ui.run;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', title: R.closeTitle, message: R.closeTitle, detail: R.closeText,
      buttons: [R.keepGoing, R.stopAndClose], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice === 0) {
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
  emitAi: (event: { raw?: unknown }) => send(IPC.aiEvent, { ...event, raw: undefined }),
};

// The key is only read in the main process; the renderer just gets a boolean.
// Debug tools are for development; a packaged build hides them unless LAMPLIGHT_DEBUG=1.
const debugEnabled = () => !app.isPackaged || process.env.LAMPLIGHT_DEBUG === '1';
ipcMain.handle(IPC.envStatus, (): EnvStatus => ({ hasApiKey: hasCredentials(), hasClaude: locateClaude() !== null, debug: debugEnabled() }));

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
  return runAgent({ prompt: DEBUG_PROMPTS[kind], workDir, recordingPath: recordingFor(kind), ...emitters });
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
  try {
    const before = new Set(job.preexisting);
    const result = await runAgent({
      prompt: again ? continuePrompt(job.form, Boolean(job.sessionId)) : job.form.demo ? demoPrompt(job.form) : commissionPrompt(job.form),
      resume: again ? job.sessionId : undefined,
      onSession: (id) => { job.sessionId = id; pending.save(job); },
      workDir: job.workDir,
      recordingPath: recordingFor(job.form.demo ? 'demo' : 'commission'),
      broker,
      preexisting: before,
      abort,
      ...emitters,
    });
    if (result.error !== 'cancelled') send(IPC.result, { ok: result.ok, workDir: job.workDir, ...collectOutputs(job.workDir, before) });
    lastFailed = result.ok || result.error === 'cancelled' ? null : job;
    return result;
  } finally {
    pending.clear();
    current = null;
    lastWorkDir = job.workDir;
  }
}

ipcMain.handle(IPC.startCommission, async (_e, form: CommissionForm): Promise<RunResult> => {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  const name = form.demo ? strings.demo.brief : form.want.slice(0, 16).replace(/[\\/:*?"<>|\s]+/g, '-');
  const workDir = commissionDir(settings.get().workRoot, name);
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

ipcMain.handle(IPC.answer, (_e, answer: DecisionAnswer) => broker.answer(answer));

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
  leftover = pending.load();
  createWindow();
});
app.on('before-quit', () => {
  broker.cancelAll();
  current?.abort.abort();
});
app.on('window-all-closed', () => app.quit());
