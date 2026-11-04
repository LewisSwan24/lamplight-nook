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

if (process.env.SIM_OFFSCREEN) {
  const OFF = -32000;
  // An off-screen window counts as covered, and a covered window's page would stop drawing.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

  const { BrowserWindow, Notification } = electron;
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
  Notification.prototype.show = () => {};

  globalThis.__simElectron = { ...Object.fromEntries(Object.keys(electron).map((k) => [k, electron[k]])), BrowserWindow: OffscreenWindow };
  const names = Object.keys(globalThis.__simElectron);
  const SHIM = 'sim-electron:shim';
  const source = `const e = globalThis.__simElectron;\n${names.map((n) => `export const ${n} = e.${n};`).join('\n')}\nexport default e;\n`;
  registerHooks({
    resolve: (specifier, context, next) => (specifier === 'electron' ? { url: SHIM, format: 'module', shortCircuit: true } : next(specifier, context)),
    load: (url, context, next) => (url === SHIM ? { format: 'module', source, shortCircuit: true } : next(url, context)),
  });
}
