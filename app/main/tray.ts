import { Menu, Notification, Tray, nativeImage, type BrowserWindow } from 'electron';
import { fill, strings } from '../shared/i18n';
import type { ActorId, DecisionRequest } from '../shared/types';

const T = strings.ui.tray;
/** How fast the tray lamp flickers while a decision waits. */
const FLICKER_MS = 600;
const AGENT_ACTOR: Record<DecisionRequest['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'adeng' };

/**
 * The lamp in the system tray. While the window is out of sight and a decision waits, the lamp flickers,
 * the taskbar button flashes, and (if switched on) one system notification goes out per decision.
 */
export class ShopTray {
  private tray: Tray | null = null;
  private plain = nativeImage.createEmpty();
  private glow = nativeImage.createEmpty();
  private step?: { n: number; total: number };
  private flicker?: ReturnType<typeof setInterval>;
  private notified = new Set<string>();

  constructor(private iconDir: string, private window: () => BrowserWindow | null, private quit: () => void) {}

  /** Put the lamp in the tray. Some Linux desktops have no tray; the app works without one. */
  create() {
    this.plain = nativeImage.createFromPath(`${this.iconDir}/tray.png`);
    this.glow = nativeImage.createFromPath(`${this.iconDir}/tray-glow.png`);
    try {
      this.tray = new Tray(this.plain);
    } catch {
      return;
    }
    this.tray.setToolTip(T.tooltip);
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: T.show, click: () => this.show() },
      { type: 'separator' },
      { label: T.quit, click: () => this.quit() },
    ]));
    this.tray.on('click', () => this.show());
  }

  get available() {
    return this.tray !== null;
  }

  /** Bring the window back and stop asking for attention. */
  show() {
    const win = this.window();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    this.calm();
  }

  /** A decision is waiting. Nothing happens if the user is looking at the shop already. */
  attention(req: DecisionRequest, notify: boolean) {
    const win = this.window();
    if (!win || (win.isVisible() && !win.isMinimized() && win.isFocused())) return;
    win.flashFrame(true);
    this.tray?.setToolTip(T.tooltipWaiting);
    if (this.tray && !this.flicker) {
      let lit = false;
      this.flicker = setInterval(() => this.tray?.setImage((lit = !lit) ? this.glow : this.plain), FLICKER_MS);
    }
    if (notify && !this.notified.has(req.id) && Notification.isSupported()) {
      this.notified.add(req.id);
      const note = new Notification({
        title: fill(T.notifyTitle, { who: strings.actors[AGENT_ACTOR[req.agent]] }),
        // The project first, so two rounds' questions are told apart (B5).
        body: `${req.project ? `${req.project.title} · ` : ''}${req.kind === 'serious' ? `${T.notifySerious}: ${req.title}` : req.title}`,
        silent: false,
      });
      note.on('click', () => this.show());
      note.show();
    }
  }

  /** Where Claude's to-do list is, on the lamp's tooltip; none when the work is over. */
  setStep(step?: { n: number; total: number }) {
    this.step = step;
    if (!this.flicker) this.tray?.setToolTip(this.restingTip());
  }

  private restingTip() {
    return this.step ? fill(T.tooltipStep, { n: String(this.step.n), total: String(this.step.total) }) : T.tooltip;
  }

  /** Nothing is waiting any more (answered, or the user came back). */
  calm() {
    clearInterval(this.flicker);
    this.flicker = undefined;
    this.tray?.setImage(this.plain);
    this.tray?.setToolTip(this.restingTip());
    this.window()?.flashFrame(false);
  }
}
