import { BrowserWindow, ipcMain } from 'electron';
import { fill, strings } from '../shared/i18n';
import type { Postcard } from '../shared/postcard';
import { IPC } from '../shared/types';

/**
 * Someone else's shop, from a postcard (docs/plan-1.5.md E3): a window of its own over the shop, the same size, with a
 * preload that can only read the postcard and close the window. Closing it is going home; the shop underneath never
 * stopped, and whatever was under way there carries on.
 */
export class VisitWindow {
  private win: BrowserWindow | null = null;
  private card: Postcard | null = null;

  constructor(private preload: string, private load: (w: BrowserWindow) => void) {
    // Only the visit window's own page is answered: the shop's page has no postcard to ask for.
    ipcMain.on(IPC.visitCard, (e) => { e.returnValue = this.win && e.sender === this.win.webContents ? this.card : null; });
    ipcMain.handle(IPC.visitHome, (e) => { if (this.win && e.sender === this.win.webContents) this.close(); });
  }

  get open() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  /** Over `shop`, covering it: one postcard at a time, a new one in place of the last. */
  show(card: Postcard, shop: BrowserWindow) {
    this.close();
    this.card = card;
    const b = shop.getContentBounds();
    this.win = new BrowserWindow({
      ...b,
      parent: shop,
      modal: true,
      minWidth: 640,
      minHeight: 360,
      title: fill(strings.ui.visit.title, { name: card.name }),
      backgroundColor: '#1b1712',
      useContentSize: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const w = this.win;
    w.setMenu(null);
    // Nothing on the page leads anywhere else.
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => {
      if (this.win === w) { this.win = null; this.card = null; }
      if (!shop.isDestroyed()) shop.focus();
    });
    this.load(w);
  }

  close() {
    const w = this.win;
    this.win = null;
    this.card = null;
    if (w && !w.isDestroyed()) w.close();
  }
}
