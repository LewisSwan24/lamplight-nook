// Smoke screenshots: open the built app in Electron and capture two shots (initial / after characters walk).
// Usage: npm run build && xvfb-run -a npx electron scripts/smoke.cjs <output folder>
const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const outDir = process.argv.at(-1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  // The main-process module is ESM; importing it creates the window.
  await import(join(__dirname, '..', 'out', 'main', 'index.js'));
  await sleep(500);
  const win = BrowserWindow.getAllWindows()[0];
  await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
  await sleep(2000);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, '1-initial.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`
    document.getElementById('actor').value = 'xiaoju';
    document.getElementById('anchor').value = 'door';
    document.getElementById('walk').click();
    document.getElementById('actor').value = 'adeng';
    document.getElementById('anchor').value = 'table';
    document.getElementById('walk').click();
  `);
  await sleep(6000);
  writeFileSync(join(outDir, '2-after-walk.png'), (await win.webContents.capturePage()).toPNG());
  // Replay the bundled recording and capture a few moments of it.
  await win.webContents.executeJavaScript(`document.getElementById('replay').click()`);
  for (const [i, ms] of [[3, 1500], [4, 4000], [5, 6000]]) {
    await sleep(ms);
    writeFileSync(join(outDir, `${i}-replay.png`), (await win.webContents.capturePage()).toPNG());
  }
  app.quit();
});
