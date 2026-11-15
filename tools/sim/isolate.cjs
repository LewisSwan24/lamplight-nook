// Loaded before the app (electron -r) in every simulated run.
//
// Folders: HOME is enough on Linux, but on Windows Electron asks the system for its folders whatever the environment
// says, so a run would use the real Lamplight Nook data and the real Documents. Every folder the app can write to is
// pointed into the throwaway home here instead.
//
// Windows: with SIM_OFFSCREEN set there is no virtual display to hide in, so the app's windows are made off-screen and
// never take focus, and someone can keep working while a run goes on. The app imports BrowserWindow by name as an ES
// module, so that import is the only place to change a window's options before it first appears.

const electron = require('electron');
const { registerHooks } = require('node:module');
const { dirname, join } = require('node:path');

const { app } = electron;
// A native error box would wait for a click nobody can make; it is written down instead.
if (process.env.SIM_ERRORBOX) electron.dialog.showErrorBox = (title, text) => require('node:fs').writeFileSync(process.env.SIM_ERRORBOX, `${title}\n${text}`);
const home = process.env.SIM_HOME;
const data = process.env.SIM_DATA;
if (!home || !data) {
  console.error('isolate: SIM_HOME and SIM_DATA are required');
  process.exit(1);
}

app.setPath('home', home);
app.setPath('appData', dirname(data));
app.setPath('userData', data);
for (const [name, folder] of Object.entries({
  documents: 'Documents',
  desktop: 'Desktop',
  downloads: 'Downloads',
  music: 'Music',
  pictures: 'Pictures',
  videos: 'Videos',
})) {
  app.setPath(name, join(home, folder));
}

// Stand-ins for what the shop does outside its window (road-to-1.2.md B6). Opening at login would write to this computer's
// own start-up list, so it is only written down. System notifications and the tray's menu cannot be screenshot, so they are
// kept for a scenario to read, and a notification to click (emit('click')). Off-screen, notifications are not shown at all.
const sim = (globalThis.__sim = { login: [], notices: [], trayMenu: null });
app.setLoginItemSettings = (settings) => { sim.login.push(settings); };
{
  const { Notification, Tray } = electron;
  const show = Notification.prototype.show;
  Notification.prototype.show = function simShow() {
    sim.notices.push(this);
    if (!process.env.SIM_OFFSCREEN) show.call(this);
  };
  const setMenu = Tray.prototype.setContextMenu;
  Tray.prototype.setContextMenu = function simMenu(menu) {
    sim.trayMenu = menu;
    return setMenu.call(this, menu);
  };
}

if (process.env.SIM_OFFSCREEN) {
  const OFF = -32000;
  // An off-screen window counts as covered, and a covered window's page would stop drawing.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

  const { BrowserWindow } = electron;
  class OffscreenWindow extends BrowserWindow {
    constructor(options = {}) {
      const { show = true, ...rest } = options;
      super({ ...rest, x: OFF, y: OFF, show: false, skipTaskbar: true, alwaysOnTop: false });
      if (show) this.showInactive();
    }
  }
  // BrowserWindow.getAllWindows() keeps only windows whose constructor has this name.
  Object.defineProperty(OffscreenWindow, 'name', { value: 'BrowserWindow' });
  const proto = BrowserWindow.prototype;
  proto.show = function show() { this.showInactive(); };
  proto.center = function center() { this.setPosition(OFF, OFF); };
  proto.isFocused = () => true; // as it would be for someone using the shop: no flashing, no "come back" notices
  for (const name of ['focus', 'moveTop', 'flashFrame']) proto[name] = () => {};

  globalThis.__simElectron = { ...Object.fromEntries(Object.keys(electron).map((k) => [k, electron[k]])), BrowserWindow: OffscreenWindow };
  const names = Object.keys(globalThis.__simElectron);
  const SHIM = 'sim-electron:shim';
  const source = `const e = globalThis.__simElectron;\n${names.map((n) => `export const ${n} = e.${n};`).join('\n')}\nexport default e;\n`;
  // A CommonJS package the app imports (electron-updater) asks for Electron by a file address that does not exist: the
  // name made into a path beside the app. It gets the same Electron, as CommonJS.
  const CJS_SHIM = 'sim-electron:cjs';
  const { existsSync } = require('node:fs');
  const { fileURLToPath } = require('node:url');
  const required = (specifier) => specifier.startsWith('file:') && specifier.endsWith('/electron') && !existsSync(fileURLToPath(specifier));
  registerHooks({
    resolve: (specifier, context, next) => {
      if (specifier === 'electron') return { url: SHIM, format: 'module', shortCircuit: true };
      if (required(specifier)) return { url: CJS_SHIM, format: 'commonjs', shortCircuit: true };
      return next(specifier, context);
    },
    load: (url, context, next) => {
      if (url === SHIM) return { format: 'module', source, shortCircuit: true };
      if (url === CJS_SHIM) return { format: 'commonjs', source: 'module.exports = globalThis.__simElectron;\n', shortCircuit: true };
      return next(url, context);
    },
  });
}
