import { BrowserWindow, screen } from 'electron';
import { strings } from '../shared/i18n';
import { IPC } from '../shared/types';
import { MINI_IDLE, type MiniEvent, type MiniState, nextMini } from '../shared/mini';

/** The corner window in screen pixels: the counter corner at 3x, and a line of status under it. */
export const MINI_SIZE = { width: 288, height: 200 } as const;
const MARGIN = 16;

/**
 * A small always-on-top window in the corner of the desktop (plan.md R3): while the shop is out of
 * sight, Adeng stands at the counter there and follows the real work. Clicking it brings the shop back.
 */
export class MiniWindow {
  private win: BrowserWindow | null = null;
  state: MiniState = MINI_IDLE;

  constructor(private preload: string, private load: (w: BrowserWindow) => void) {}

  feed(ev: MiniEvent) {
    this.state = nextMini(this.state, ev);
    this.win?.webContents.send(IPC.miniPush, this.state);
  }

  /** Show it (without taking focus from whatever the user is doing), or put it away. */
  setVisible(on: boolean) {
    if (!on) return this.win?.hide();
    if (!this.win || this.win.isDestroyed()) this.create();
    if (!this.win!.isVisible()) this.win!.showInactive();
  }

  get visible() {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  destroy() {
    this.win?.destroy();
    this.win = null;
  }

  private create() {
    const area = screen.getPrimaryDisplay().workArea;
    this.win = new BrowserWindow({
      ...MINI_SIZE,
      x: area.x + area.width - MINI_SIZE.width - MARGIN,
      y: area.y + area.height - MINI_SIZE.height - MARGIN,
      title: strings.ui.mini.title,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      useContentSize: true,
      backgroundColor: '#1b1712',
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.win.on('closed', () => { this.win = null; });
    this.load(this.win);
  }
}
