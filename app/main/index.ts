import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { fill, strings } from '../shared/i18n';
import { IPC, type EnvStatus } from '../shared/types';
import { DEBUG_PROMPTS, commissionDir, hasCredentials, runAgent } from './agent-runner';

const here = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null;

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

// The key is only read in the main process; the renderer just gets a boolean.
ipcMain.handle(IPC.envStatus, (): EnvStatus => ({ hasApiKey: hasCredentials() }));

ipcMain.handle(IPC.runDebugTask, async (_e, kind: keyof typeof DEBUG_PROMPTS) => {
  const workDir = commissionDir(app.getPath('documents'), fill(strings.app.debugCommission, { kind }));
  const recordingPath = join(app.getPath('userData'), 'recordings', `${Date.now()}-${kind}.jsonl`);
  return runAgent({
    prompt: DEBUG_PROMPTS[kind],
    workDir,
    recordingPath,
    emit: (event) => win?.webContents.send(IPC.rawEvent, event),
    emitAi: (event) => win?.webContents.send(IPC.aiEvent, { ...event, raw: undefined }),
  });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
