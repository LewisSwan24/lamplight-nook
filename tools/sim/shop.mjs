// Drive the built app (out/) with Playwright, against the stand-in Claude, for acceptance runs and screenshots.
//
// Safety: the app is started with a clean environment (no variables inherited from this shell) and a throwaway
// home that isolate.cjs points all its folders at, so it can never pick up real credentials or touch real data; the
// only key it sees is a fake one, and every agent run goes to tools/sim/claude.mjs, which never touches the network.

import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ELECTRON = join(ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
export const FAKE_CLAUDE = join(ROOT, 'tools', 'sim', 'claude.mjs');
const ISOLATE = join(ROOT, 'tools', 'sim', 'isolate.cjs');
/** Looks like a key to the app; worthless anywhere else. */
const FAKE_KEY = 'sk-ant-api03-simulated-0000000000000000000000000000000000000000';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const locale = (lang, appDir = ROOT) => JSON.parse(readFileSync(join(appDir, 'locales', `${lang}.json`), 'utf8'));

/** The window sizes the walk checks: a small laptop, a common desktop, and a wide one. */
export const SIZES = { small: [1280, 720], medium: [1600, 900], large: [1920, 1080] };

let xvfb = null;
/** A virtual display when there is none (Linux containers). */
export async function display() {
  if (process.platform !== 'linux') return undefined;
  if (process.env.DISPLAY && !process.env.SIM_OWN_DISPLAY) return process.env.DISPLAY;
  if (!xvfb) {
    const n = 90 + Math.floor(Math.random() * 9);
    xvfb = { proc: spawn('Xvfb', [`:${n}`, '-screen', '0', '2560x1600x24', '-nolisten', 'tcp'], { stdio: 'ignore' }), display: `:${n}` };
    xvfb.proc.unref(); // the display must not keep the script running
    process.on('exit', () => xvfb?.proc.kill());
    await sleep(800);
  }
  return xvfb.display;
}

/**
 * A fresh home for the app: its own data folder and Documents. `seed` writes files into the app's data folder
 * before it starts (settings.json, memory.json...), relative to it.
 */
export function freshHome(seed = {}) {
  const home = mkdtempSync(join(tmpdir(), 'lamplight-home-'));
  const data = join(home, '.config', 'Lamplight Nook');
  mkdirSync(data, { recursive: true });
  mkdirSync(join(home, 'Documents'), { recursive: true });
  for (const [name, content] of Object.entries(seed)) {
    mkdirSync(dirname(join(data, name)), { recursive: true });
    writeFileSync(join(data, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return { home, data, documents: join(home, 'Documents') };
}

/** Settings for a shop that has already been opened once, so the welcome card does not show. */
export function onboarded(lang, extra = {}) {
  return { name: lang === 'en' ? 'Sam' : '小林', onboarded: true, language: lang, muted: true, ...extra };
}

/** A symlink needs special rights on Windows, so there a hard link, or a copy across drives. */
function linkOrCopy(from, to) {
  if (process.platform !== 'win32') return symlinkSync(from, to);
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
  }
}

/**
 * A PATH on which no Claude Code can be found, for "not installed": folders holding a `claude` are left out,
 * and node (which may live next to it) comes from a folder of its own.
 */
function pathWithoutClaude(home) {
  const shim = join(home.home, '.sim-bin');
  mkdirSync(shim, { recursive: true });
  const node = join(shim, process.platform === 'win32' ? 'node.exe' : 'node');
  if (!existsSync(node)) linkOrCopy(process.execPath, node);
  const dirs = (process.env.PATH ?? '').split(delimiter).filter((d) => d && !['claude', 'claude.exe', 'claude.cmd'].some((n) => existsSync(join(d, n))));
  return [shim, ...dirs].join(delimiter);
}

/** What Windows programs need to run, with the user's own folders pointing into the throwaway home. */
function windowsEnv(home) {
  if (process.platform !== 'win32') return {};
  const { SystemRoot, windir, ComSpec, PATHEXT, TEMP, TMP } = process.env;
  return {
    SystemRoot, windir, ComSpec, PATHEXT, TEMP, TMP,
    // SIM_SHOW=1 in this shell to watch a run in real windows.
    ...(process.env.SIM_SHOW ? {} : { SIM_OFFSCREEN: '1' }),
    USERPROFILE: home.home,
    APPDATA: join(home.home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home.home, 'AppData', 'Local'),
  };
}

/** Stop at once if the app is not using the throwaway home, rather than run a commission over someone's real data. */
async function refuseRealFolders(app, home) {
  const folders = await app.evaluate(({ app }) => ['userData', 'documents', 'desktop'].map((n) => app.getPath(n)));
  const outside = folders.filter((f) => {
    const rel = relative(home.home, f);
    return rel.startsWith('..') || isAbsolute(rel);
  });
  if (outside.length) {
    await app.close().catch(() => {});
    throw new Error(`not isolated, the app would use: ${outside.join(', ')}`);
  }
}

/**
 * Start the app. Options: lang, home (from freshHome), size, scenario and speed for the stand-in Claude,
 * key (false for "no key"), debug (show the debug panel), appDir (another built checkout of the app,
 * such as an older version; its own locales are used), simEnv (more SIM_* settings for the stand-in Claude),
 * store (play the Microsoft Store build), claudePath (where Claude Code is; a missing path means not installed;
 * 'sdk' the Agent SDK's own copy, for real runs),
 * args (more Electron switches).
 */
export async function launch({ lang = 'zh-CN', home = freshHome(), size = 'medium', scenario = '', speed = 250, key = true, debug = false, appDir = ROOT, simEnv = {}, store = false, claudePath = FAKE_CLAUDE, args = [] } = {}) {
  const env = {
    PATH: claudePath === FAKE_CLAUDE || claudePath === 'sdk' ? process.env.PATH : pathWithoutClaude(home),
    HOME: home.home,
    SIM_HOME: home.home,
    SIM_DATA: home.data,
    DISPLAY: await display(),
    ...windowsEnv(home),
    LAMPLIGHT_LANG: lang,
    // 'sdk': no override, so a development build runs the Agent SDK's own Claude Code (the tested version).
    ...(claudePath === 'sdk' ? {} : { LAMPLIGHT_CLAUDE_PATH: claudePath }),
    SIM_SPEED: String(speed),
    SIM_SCENARIO: scenario,
    SIM_STATE_DIR: join(home.home, '.sim'),
    // true: the fake key; a string: that key (tools/real/ui.mjs, never from this shell's own variables).
    ...(key ? { ANTHROPIC_API_KEY: typeof key === 'string' ? key : FAKE_KEY } : {}),
    ...(debug ? { LAMPLIGHT_DEBUG: '1' } : {}),
    ...(store ? { LAMPLIGHT_STORE: '1' } : {}),
    ...Object.fromEntries(Object.entries(simEnv).filter(([k]) => k.startsWith('SIM_'))),
    ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  // Electron now and then fails to start right after another one quit; one more try is enough.
  const start = () => electron.launch({ executablePath: ELECTRON, args: ['-r', ISOLATE, appDir, '--no-sandbox', ...args], env, cwd: appDir });
  const app = await start().catch(async (err) => {
    if (!/failed to launch/i.test(String(err?.message))) throw err;
    await sleep(2000);
    return start();
  });
  await refuseRealFolders(app, home);
  const page = await app.firstWindow();
  // A development build always has the debug panel; keep it out of pictures and recordings unless asked for.
  if (!debug) {
    const hide = () => {
      const style = document.createElement('style');
      style.textContent = '#debug { display: none !important; }';
      (document.head ?? document.documentElement).append(style);
    };
    await page.addInitScript(hide);
    await page.evaluate(hide).catch(() => {});
  }
  const shop = new Shop(app, page, lang, home, appDir);
  await shop.resize(size);
  await page.waitForSelector('#game canvas', { timeout: 30_000 });
  await sleep(1500);
  return shop;
}

export class Shop {
  constructor(app, page, lang, home, appDir = ROOT) {
    this.app = app;
    this.page = page;
    this.lang = lang;
    this.home = home;
    this.L = locale(lang, appDir);
  }

  async resize(size) {
    const [w, h] = SIZES[size] ?? size;
    await this.app.evaluate(({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows().find((x) => !x.getTitle().includes('mini')) ?? BrowserWindow.getAllWindows()[0];
      win.setContentSize(w, h);
      win.center();
    }, [w, h]);
    await this.page.setViewportSize({ width: w, height: h }).catch(() => {});
    await sleep(400);
  }

  /** Screenshot of the window, without the debug panel. */
  async shot(path) {
    mkdirSync(dirname(path), { recursive: true });
    await this.page.evaluate(() => {
      document.body.classList.remove('debug');
      // A toolbar button or hotspot pressed by the script would show its focus ring.
      const a = document.activeElement;
      if (a instanceof HTMLElement && a.matches('.tool-btn, .hotspot')) a.blur();
    });
    // The pointer stays where the script last clicked, and a toolbar button there would show its label.
    await this.page.mouse.move(0, 0);
    await this.page.screenshot({ path });
    return path;
  }

  /** Click one of the shop's keyboard hotspots by its spoken name (the counter, the bell, the shelf...). */
  async hotspot(label) {
    // Press it the way the keyboard does: overlays drawn on top (the chalk text, parcels) must not catch the click.
    const found = await this.page.evaluate((label) => {
      const b = [...document.querySelectorAll('button.hotspot')].find((x) => x.getAttribute('aria-label') === label && !x.hidden);
      b?.click();
      return Boolean(b);
    }, label);
    if (!found) throw new Error(`no hotspot "${label}"`);
    await sleep(500);
  }

  /** Stub the main process's file dialogs so "choose a file" and "hand over files" pick these paths. */
  async pickFiles(paths) {
    await this.app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
    }, paths);
  }

  /** Wait for a selector, returning null instead of throwing on timeout. */
  async maybe(selector, timeout = 1000) {
    try { return await this.page.waitForSelector(selector, { timeout, state: 'visible' }); } catch { return null; }
  }

  /**
   * Answer whatever card the shop puts up while a commission runs, until the result card appears.
   * `answers` decides each card: (card) => the index or text of the button to press; null presses the default.
   */
  async workUntilDone({ answers = () => null, timeout = 240_000, onTick } = {}) {
    const start = Date.now();
    const seen = [];
    while (Date.now() - start < timeout) {
      if (onTick) await onTick(Date.now() - start);
      const result = await this.page.$('.card.result-card');
      if (result && await result.isVisible()) return { ok: true, seen };
      const decision = await this.page.$('.backdrop');
      if (decision && await decision.isVisible()) {
        const card = await this.page.evaluate(() => {
          const d = document.querySelector('.backdrop');
          return { text: d?.innerText ?? '', serious: !!d?.querySelector('.serious'), buttons: [...(d?.querySelectorAll('button') ?? [])].map((b) => b.innerText.trim()) };
        });
        seen.push(card);
        const pick = answers(card);
        await sleep(400);
        if (pick === undefined || pick === null) await this.page.keyboard.press('Enter');
        else if (typeof pick === 'number') await this.page.locator('.backdrop button').nth(pick).click();
        else await this.page.locator('.backdrop button', { hasText: pick }).first().click();
        await sleep(600);
        continue;
      }
      const stopped = await this.stopCard();
      if (stopped) return { ok: false, seen, stopped };
      await sleep(400);
    }
    return { ok: false, seen, timeout: true };
  }

  /**
   * Put the shop out of sight (as minimising does; Xvfb has no window manager to minimise with)
   * and return the corner window's page.
   */
  async away() {
    await this.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini'))?.hide());
    // A new window's page starts at about:blank, so look for it by its address once it has loaded.
    for (let i = 0; i < 60; i++) {
      const mini = this.app.windows().find((p) => p.url().includes('mini'));
      if (mini) { await sleep(2500); return mini; }
      await sleep(250);
    }
    throw new Error('the corner window did not appear');
  }

  /** The card saying why a commission stopped (network, budget...), as { title, text }, or null. */
  async stopCard() {
    const R = this.L.ui.run;
    const titles = [R.netTitle, R.busyTitle, R.billingTitle, R.authTitle, R.goneTitle, R.budgetTitle];
    return this.page.evaluate((titles) => {
      for (const c of document.querySelectorAll('#ui .card')) {
        const title = c.querySelector('.card-title, .serious-title')?.textContent?.trim();
        if (title && titles.includes(title)) return { title, text: c.innerText };
      }
      return null;
    }, titles);
  }

  /** Press the stop card's main button (try again / carry on). */
  async retry() {
    await this.page.locator('#ui .card .actions button.default').first().click();
    await sleep(500);
  }

  /** Open the commission slip from the counter, pick a template (by its id) and fill it in. */
  async order({ template, want, details, audience, files } = {}) {
    const counter = this.page.locator("button.hotspot");
    const labels = await counter.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
    const desk = this.L.sceneText?.study?.ui?.access?.hotspotCounter;
    const label = labels.find((l) => l === this.L.ui.access.hotspotCounter || l === desk) ?? this.L.ui.access.hotspotCounter;
    await this.hotspot(label);
    await this.page.waitForSelector('form.commission');
    if (template) {
      const label = template === 'demo' ? this.L.ui.templates.demo : this.L.ui.templates[template];
      const chip = this.page.locator('form.commission .template-chip', { hasText: label });
      if (!(await chip.getAttribute('class')).includes('on')) await chip.click();
    }
    if (files?.length) {
      await this.pickFiles(files);
      await this.page.locator('form.commission .material-add').click();
      await sleep(400);
    }
    if (want) await this.page.fill('form.commission textarea', want);
    const inputs = this.page.locator('form.commission input[type=text]');
    if (details) await inputs.nth(0).fill(details);
    if (audience) await inputs.nth(1).fill(audience);
  }

  /** Open settings on one of its tabs (basics, furnish, sight, work, about). */
  async openSettings(tab = 'basics') {
    await this.page.locator('.toolbar button.tool-btn').last().click();
    await this.page.waitForSelector('.settings .tabs');
    await this.page.locator(`.settings button.tab[data-tab="${tab}"]`).click();
    await sleep(300);
  }

  async submit() {
    await this.page.locator('form.commission button.default').click();
    await sleep(500);
  }

  /** Quit the app; if it does not go within ten seconds (a hidden window can hold it up), end the process. */
  async close() {
    let proc;
    try {
      proc = this.app.process();
    } catch {
      return; // Already gone: the legacy run stops it hard on purpose.
    }
    // Closing mid-commission asks "stop and close?" in a dialog that would block the app and pop up on the desktop.
    await this.app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
    await Promise.race([this.app.close().catch(() => {}), sleep(10_000)]);
    if (proc.exitCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
  }
}
