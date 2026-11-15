import { Menu, Notification, Tray, nativeImage, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { fill, strings } from '../shared/i18n';
import type { ActorId, DecisionRequest, RunInfo } from '../shared/types';

const T = strings.ui.tray;
/** How fast the tray lamp flickers while a decision waits. */
const FLICKER_MS = 600;
const AGENT_ACTOR: Record<DecisionRequest['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'adeng' };

/**
 * The lamp in the system tray. While the window is out of sight and a decision waits, the lamp flickers,
 * the taskbar button flashes, and (if switched on) one system notification goes out per decision. Its menu lists the
 * rounds under way and queued, and pauses the scheduled commissions (road-to-1.2.md B6).
 */
export class ShopTray {
  private tray: Tray | null = null;
  private plain = nativeImage.createEmpty();
  private glow = nativeImage.createEmpty();
  private step?: { n: number; total: number };
  private flicker?: ReturnType<typeof setInterval>;
  private notified = new Set<string>();
  private runs: RunInfo[] = [];
  private paused = false;
  /** The menu's "pause scheduled commissions" was switched. */
  onPause: (on: boolean) => void = () => {};

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
    this.menu();
    this.tray.on('click', () => this.show());
  }

  get available() {
    return this.tray !== null;
  }

  /** The rounds under way and in the queue, and whether scheduled commissions are paused, as the menu shows them. */
  setRuns(runs: RunInfo[], paused: boolean) {
    this.runs = runs;
    this.paused = paused;
    this.menu();
  }

  private menu() {
    const status = strings.ui.projects.status;
    const rows: MenuItemConstructorOptions[] = this.runs.length
      ? this.runs.map((r) => ({ label: fill(T.runLine, { title: r.project.title, status: status[r.state] }), enabled: false }))
      : [{ label: T.idle, enabled: false }];
    this.tray?.setContextMenu(Menu.buildFromTemplate([
      { label: T.show, click: () => this.show() },
      { type: 'separator' },
      ...rows,
      { type: 'separator' },
      { label: T.pauseSchedules, type: 'checkbox', checked: this.paused, click: (item) => this.onPause(item.checked) },
      { type: 'separator' },
      { label: T.quit, click: () => this.quit() },
    ]));
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

  /** The user is not looking at the shop: hidden, minimised, or another window in front. */
  private away() {
    const win = this.window();
    return Boolean(win && !(win.isVisible() && !win.isMinimized() && win.isFocused()));
  }

  /** A decision is waiting. Nothing happens if the user is looking at the shop already. True if a notification went out. */
  attention(req: DecisionRequest, notify: boolean): boolean {
    const win = this.window();
    if (!win || !this.away()) return false;
    win.flashFrame(true);
    this.tray?.setToolTip(T.tooltipWaiting);
    if (this.tray && !this.flicker) {
      let lit = false;
      this.flicker = setInterval(() => this.tray?.setImage((lit = !lit) ? this.glow : this.plain), FLICKER_MS);
    }
    if (!notify || this.notified.has(req.id) || !Notification.isSupported()) return false;
    this.notified.add(req.id);
    // The project first, so two rounds' questions are told apart (B5).
    const body = `${req.project ? `${req.project.title} · ` : ''}${req.kind === 'serious' ? `${T.notifySerious}: ${req.title}` : req.title}`;
    this.tell(fill(T.notifyTitle, { who: strings.actors[AGENT_ACTOR[req.agent]] }), body, () => {});
    return true;
  }

  /**
   * A system notification, only while the user is not looking at the shop (B6). Clicking it brings the shop back, then
   * `open` shows what it was about. True if it went out.
   */
  notice(title: string, body: string, open: () => void): boolean {
    if (!this.away() || !Notification.isSupported()) return false;
    this.tell(title, body, open);
    return true;
  }

  private tell(title: string, body: string, open: () => void) {
    const note = new Notification({ title, body, silent: false });
    note.on('click', () => {
      this.show();
      open();
    });
    note.show();
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
