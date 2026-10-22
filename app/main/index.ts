import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fill, strings } from '../shared/i18n';
import { IPC, type CommissionForm, type DecisionAnswer, type EnvStatus, type ExternalLink, type RunResult, type Settings } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, hasCredentials, runAgent } from './agent-runner';
import { locateClaude } from './claude-locator';
import { collectOutputs, commissionPrompt, demoPrompt, prepareDemoFolder, snapshot } from './commission';
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

/** The only pages the renderer can open in a browser. */
const LINKS: Record<ExternalLink, string> = {
  claudeSetup: 'https://code.claude.com/docs/en/setup',
  apiKeys: 'https://console.anthropic.com/settings/keys',
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
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(here, '../renderer/index.html'));
}

const recordingFor = (kind: string) => join(app.getPath('userData'), 'recordings', `${Date.now()}-${kind}.jsonl`);
const emitters = {
  emit: (event: unknown) => send(IPC.rawEvent, event),
  emitAi: (event: { raw?: unknown }) => send(IPC.aiEvent, { ...event, raw: undefined }),
};

// The key is only read in the main process; the renderer just gets a boolean.
ipcMain.handle(IPC.envStatus, (): EnvStatus => ({ hasApiKey: hasCredentials(), hasClaude: locateClaude() !== null }));

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
  const workDir = commissionDir(settings.get().workRoot, fill(strings.app.debugCommission, { kind }));
  return runAgent({ prompt: DEBUG_PROMPTS[kind], workDir, recordingPath: recordingFor(kind), ...emitters });
});

ipcMain.handle(IPC.startCommission, async (_e, form: CommissionForm): Promise<RunResult> => {
  if (current) return { ok: false, recordingPath: '', workDir: current.workDir, error: 'busy' };
  const name = form.demo ? strings.demo.brief : form.want.slice(0, 16).replace(/[\\/:*?"<>|\s]+/g, '-');
  const workDir = commissionDir(settings.get().workRoot, name);
  const abort = new AbortController();
  current = { workDir, abort };
  try {
    mkdirSync(workDir, { recursive: true });
    if (form.demo) prepareDemoFolder(workDir, join(app.getAppPath(), 'demo', 'check.js'));
    const before = snapshot(workDir);
    const result = await runAgent({
      prompt: form.demo ? demoPrompt(form) : commissionPrompt(form),
      workDir,
      recordingPath: recordingFor(form.demo ? 'demo' : 'commission'),
      broker,
      preexisting: before,
      abort,
      ...emitters,
    });
    send(IPC.result, { ok: result.ok, workDir, ...collectOutputs(workDir, before) });
    return result;
  } finally {
    current = null;
    lastWorkDir = workDir;
  }
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
  createWindow();
});
app.on('before-quit', () => {
  broker.cancelAll();
  current?.abort.abort();
});
app.on('window-all-closed', () => app.quit());
