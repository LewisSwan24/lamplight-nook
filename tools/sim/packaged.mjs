// The packaged app, unpacked and run from its folder, with the stand-in Claude. This is what the development runs cannot
// show: that everything the shop needs made it into app.asar, and that the safety fuses are really set.
//
//   npm run packaged
//   node tools/sim/packaged.mjs --app sim-out/packaged/win-unpacked --out sim-out/packaged-run --lang zh-CN
//
// It is not the release gate: no installer, no uninstall, no real Claude Code, no real key (docs/road-to-1.0.md W11).
//
// Safety: the fuses keep isolate.cjs out of a packaged app, so Windows would hand it the real data folder and the real
// Documents. --user-data-dir moves the data folder and settings.json moves the work folder. The real data folder is
// fingerprinted before and after, and any difference fails the run. Windows give up the foreground for a moment here:
// only isolate.cjs can open them off-screen, so they are moved there as soon as they can be reached.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { FAKE_CLAUDE, ROOT, Shop, freshHome, onboarded, sleep } from './shop.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SPRITES = ['back-door', 'garden-crops', 'grow-painting', 'adeng', 'baker'];
const FUSES = {
  RunAsNode: 'Disabled',
  EnableCookieEncryption: 'Enabled',
  EnableNodeOptionsEnvironmentVariable: 'Disabled',
  EnableNodeCliInspectArguments: 'Disabled',
  EnableEmbeddedAsarIntegrityValidation: 'Enabled',
  OnlyLoadAppFromAsar: 'Enabled',
};

const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const appDir = resolve(option('app', join(ROOT, 'sim-out', 'packaged', 'win-unpacked')));
const out = resolve(option('out', join(ROOT, 'sim-out', 'packaged-run')));
const lang = option('lang', 'zh-CN');
const exe = join(appDir, 'Lamplight Nook.exe');

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

/** Every file below a folder with its size and time, so that any write shows. */
function fingerprint(dir) {
  const seen = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      const s = statSync(path, { throwIfNoEntry: false });
      if (!s) continue;
      if (s.isDirectory()) walk(path);
      else seen.push(`${path}|${s.size}|${s.mtimeMs}`);
    }
  };
  if (existsSync(dir)) walk(dir);
  return seen.sort().join('\n');
}

const freePort = () => new Promise((done) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});

/** Start the packaged app and reach its window through the debugging port, which is all the fuses leave open. */
async function start(home, { debug }) {
  const port = await freePort();
  const began = Date.now();
  const proc = spawn(exe, [
    `--user-data-dir=${home.data}`,
    `--remote-debugging-port=${port}`,
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
  ], {
    env: {
      PATH: process.env.PATH,
      ...Object.fromEntries(['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP'].map((k) => [k, process.env[k]])),
      HOME: home.home,
      USERPROFILE: home.home,
      APPDATA: join(home.home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home.home, 'AppData', 'Local'),
      LAMPLIGHT_LANG: lang,
      LAMPLIGHT_CLAUDE_PATH: FAKE_CLAUDE,
      ANTHROPIC_API_KEY: 'sk-ant-api03-simulated-0000000000000000000000000000000000000000',
      SIM_HOME: home.home,
      SIM_DATA: home.data,
      SIM_SPEED: '150',
      SIM_SCENARIO: '',
      SIM_STATE_DIR: join(home.home, '.sim'),
      SIM_CONNECTION_PLAY: 'packaged',
      ...(debug ? { LAMPLIGHT_DEBUG: '1' } : {}),
    },
    stdio: 'ignore',
  });
  // Whatever goes wrong from here, this run does not leave a shop open on someone's desktop.
  process.once('exit', () => spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }));
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await sleep(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2000 }).catch(() => null);
  }
  if (!browser) throw new Error('the packaged app never opened its debugging port');
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('index.html'));
    if (!page) await sleep(500);
  }
  if (!page) throw new Error('the packaged app never opened its window');
  // Out of the way: Electron answers no window commands over this port, but the page itself may still move its window.
  await page.evaluate(() => window.moveTo(-32000, -32000)).catch(() => {});
  return { proc, browser, page, began };
}

/** Close the window, as its X does; the whole app should go by itself. */
async function stop({ proc, browser, page }) {
  await page.evaluate(() => window.close()).catch(() => {});
  for (let i = 0; i < 40 && proc.exitCode === null; i++) await sleep(250);
  await browser.close().catch(() => {});
  const clean = proc.exitCode !== null;
  if (!clean) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  return clean;
}

check(existsSync(exe), `the app is at ${exe}`);
if (failures.length) process.exit(1);
mkdirSync(out, { recursive: true });

const fuses = spawnSync(process.execPath, [join(ROOT, 'node_modules', '@electron', 'fuses', 'dist', 'bin.js'), 'read', '--app', exe], { encoding: 'utf8' }).stdout ?? '';
for (const [name, state] of Object.entries(FUSES)) {
  check(new RegExp(`${name}[^\\n]*${state}`).test(fuses.replace(/\[[0-9;]*m/g, '')), `fuse ${name} is ${state}`);
}

// Where the updater looks for new versions (package.json build.publish, app/main/updates.ts). electron-builder writes
// app-update.yml only for an installer, so `npm run packaged` (a plain folder) has none and its look on opening fails
// quietly; the win-unpacked folder `npm run dist` leaves has one, and that is checked when it is the app given.
const feedFile = join(appDir, 'resources', 'app-update.yml');
if (existsSync(feedFile)) {
  const feed = readFileSync(feedFile, 'utf8');
  check(/provider: github/.test(feed) && /owner: LewisSwan24/.test(feed) && /repo: lamplight-nook/.test(feed), 'the updater knows where the releases are (app-update.yml)');
} else console.log('note app-update.yml is written only for the installer; this folder has none');

const realData = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Lamplight Nook');
const before = fingerprint(realData);

const home = freshHome();
const workRoot = join(home.home, 'works');
writeFileSync(join(home.data, 'settings.json'), JSON.stringify(onboarded(lang, { workRoot, closeToTray: false })));

const result = { lang, appBytes: statSync(join(appDir, 'resources', 'app.asar')).size };
let run = await start(home, { debug: true });
try {
  const problems = [];
  run.page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  // A media element drops a request as soon as it has read what it needs for now: the music is checked by decoding it below.
  const music = new Set();
  run.page.on('requestfailed', (r) => {
    if (r.resourceType() === 'media' && r.failure()?.errorText === 'net::ERR_ABORTED') music.add(r.url());
    else problems.push(`failed (${r.failure()?.errorText}): ${r.url()}`);
  });
  run.page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
  await run.page.waitForSelector('#game canvas', { timeout: 30_000 });
  result.startMs = Date.now() - run.began;

  // From the top again, now that someone is listening: nothing it asks for may be missing from the package. First let the
  // first start finish what it fetches after the canvas is up (the street's guests): a reload would cut those short,
  // and a request cut short reads as one that failed.
  let last = Date.now();
  const busy = (r) => { if (r.resourceType() !== 'media') last = Date.now(); };
  for (const e of ['request', 'requestfinished', 'requestfailed']) run.page.on(e, busy);
  for (const until = Date.now() + 20_000; Date.now() - last < 2000 && Date.now() < until;) await sleep(250);
  for (const e of ['request', 'requestfinished', 'requestfailed']) run.page.off(e, busy);
  await run.page.reload();
  await run.page.waitForSelector('#game canvas', { timeout: 30_000 });
  await run.page.waitForFunction(() => window.lamplightDebug?.scene?.textures, null, { timeout: 30_000 });
  await sleep(3000);
  for (const key of SPRITES) {
    check(await run.page.evaluate((k) => window.lamplightDebug.scene.textures.exists(k), key), `the picture ${key} loaded`);
  }
  check(!(await run.page.evaluate(() => window.lamplightDebug.scene.textures.exists('no-such-picture'))), 'a picture that does not exist counts as missing');
  check(await run.page.evaluate(() => document.fonts.size > 0 && [...document.fonts].some((f) => f.status === 'loaded')), 'a font loaded');

  for (const url of music) {
    const seconds = await run.page.evaluate(async (u) => (await new AudioContext().decodeAudioData(await (await fetch(u)).arrayBuffer())).duration, url);
    check(seconds > 10, `the music decodes (${Math.round(seconds)} s)`);
  }

  const shop = new Shop(null, run.page, lang, home);
  await shop.shot(join(out, 'shop.png'));
  await shop.order({ template: 'demo' });
  await shop.submit();
  const done = await shop.workUntilDone({ timeout: 200_000 });
  check(done.ok, `the commission finished${done.ok ? '' : `: ${JSON.stringify(done.stopped ?? done).slice(0, 200)}`}`);
  await shop.shot(join(out, 'result.png'));
  const made = existsSync(workRoot) ? readdirSync(workRoot) : [];
  check(made.length === 1, `the work is in the folder that was set (${made.join(', ')})`);
  check(problems.length === 0, `nothing failed to load${problems.length ? `: ${problems.slice(0, 5).map((p) => p.replace(/file:.*\/assets\//, '')).join('; ')}` : ''}`);
  check(await run.page.locator('.update-letter').count() === 0, 'no letter about a version that is not newer');

  // Connections in a packaged shop (road-to-1.3.md C9): the three real kinds and never the test one, a calendar only
  // over https, and both kinds of nook-* server answering a commission.
  const { page } = run;
  await page.locator(`.toolbar button.tool-btn[aria-label="${shop.L.ui.notebook.title}"]`).click();
  await page.waitForSelector('.notebook .notebook-connections');
  await sleep(400);
  const kinds = await page.locator('.notebook-connections .connection-add').evaluateAll((b) => b.map((x) => x.dataset.kind).sort());
  check(kinds.join() === 'calendar,folder,maildraft', `the connections offered are the folder, the calendar and drafts (${kinds.join(', ')})`);
  await page.locator('.notebook-connections .connection-add[data-kind="calendar"]').click();
  await page.waitForSelector('.grant-card');
  await page.locator('.grant-card .grant-address').fill('http://127.0.0.1:9/c9.ics');
  await page.locator('.grant-card .grant-connect').click();
  await page.waitForSelector('.notebook .notebook-connections');
  await sleep(500);
  const refused = await page.locator('.notebook .connection').count() === 0 && (await page.locator('.connection-note').textContent()) === shop.L.ui.connections.address;
  check(refused, 'a calendar at http://127.0.0.1 is refused');
  await page.locator('.notebook-connections .connection-add[data-kind="maildraft"]').click();
  await page.waitForSelector('.grant-card');
  await page.locator('.grant-card .grant-connect').click();
  await page.waitForSelector('.notebook .connection');
  await page.keyboard.press('Escape');
  await sleep(300);
  await shop.order({ want: 'C9' });
  const tick = page.locator('form.commission .connection-row input[type=checkbox]');
  await tick.first().waitFor({ state: 'visible', timeout: 5000 });
  await tick.first().check();
  await shop.submit();
  const linked = await shop.workUntilDone({ answers: () => 1, timeout: 200_000 });
  check(linked.ok, `the commission with a connection finished${linked.ok ? '' : `: ${JSON.stringify(linked.stopped ?? linked).slice(0, 200)}`}`);
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(n); } };
  for (const n of readdirSync(workRoot).filter((n) => !made.includes(n))) walk(join(workRoot, n));
  check(files.some((f) => f.endsWith('.docx')), `nook-office made a Word file (${files.join(', ')})`);
  check(files.some((f) => f.endsWith('.eml')), 'the drafts connection wrote a draft');
  await shop.shot(join(out, 'connection.png'));

  // The town (road-to-1.4.md D10): out onto the street, with everything that stands on it, then into each new shop.
  // The last result's card is put away first, so the pictures show the town.
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.locator(`.toolbar button.tool-btn[aria-label="${shop.L.ui.toolbar.street}"]`).click();
  await sleep(1500);
  const street = await page.evaluate(() => {
    const g = window.lamplightDebug.street;
    return { out: g.sys.isActive() && g.sys.isVisible(), pictures: ['town-street', 'town-fronts', 'town-props', 'town-signs', 'town-grow', 'town-decor', 'town-story'].filter((k) => !g.textures.exists(k)) };
  });
  check(street.out, 'the street shows');
  check(street.pictures.length === 0, `the street's pictures loaded (missing: ${street.pictures.join(', ')})`);
  await shop.shot(join(out, 'street.png'));
  for (const room of ['print', 'studio', 'workshop', 'bakery']) {
    await page.evaluate((r) => window.lamplightDebug.street.lookAt(r), room);
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2500);
    const inside = await page.evaluate((r) => ({ here: window.lamplightDebug.scene.room, room: window.lamplightDebug.scene.textures.exists(`room-${r}`) }), room);
    check(inside.here === room && inside.room, `the ${room} opens with its room (${JSON.stringify(inside)})`);
    await shop.shot(join(out, `${room}.png`));
    await page.locator(`.toolbar button.tool-btn[aria-label="${shop.L.ui.toolbar.street}"]`).click();
    await sleep(1200);
  }
  await page.keyboard.press('Escape');
  await sleep(800);

  // The home network in a packaged shop (docs/plan-1.5.md E8): the switch on, a phone-sized Chrome pairs from the QR
  // code's address, the page loads with its headers and says it is connected, then the device is removed and the switch
  // goes off again. Needs this computer on a home network (10.x, 172.16-31.x or 192.168.x).
  await shop.openSettings('work');
  await page.locator('label.toggle', { hasText: shop.L.ui.lan.toggle }).click();
  await sleep(1500);
  await page.locator('.settings .lan-pair').click();
  await page.waitForSelector('.settings .lan-qr svg', { timeout: 5000 });
  const lanUrl = await page.locator('.settings .lan-qr').getAttribute('data-url');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
    const served = await phone.goto(lanUrl);
    check(/frame-ancestors 'none'/.test(served.headers()['content-security-policy'] ?? ''), `the phone page comes from ${new URL(lanUrl).host} with its security policy`);
    const connected = await phone.waitForFunction((w) => document.getElementById('state')?.textContent === w, shop.L.ui.lan.page.connected, { timeout: 10_000 }).then(() => true, () => false);
    check(connected, 'the phone page pairs and says it is connected');
    await phone.screenshot({ path: join(out, 'phone.png') });
    await sleep(2500);
    check(await page.locator('.settings .lan-qr').isHidden(), 'the QR code is put away once its device has paired');
    await page.locator('.settings .lan-devices li button.link').click();
    await sleep(500);
    check(await page.locator('.settings .lan-devices li').count() === 0, 'the device is removed');
  } finally {
    await browser.close();
  }
  await page.locator('label.toggle', { hasText: shop.L.ui.lan.toggle }).click();
  await sleep(500);
  await page.keyboard.press('Escape');
  await sleep(500);
  check(await stop(run), 'it closes by itself');
  // It looked for a new version on opening, for real. Offline or not, that is only ever a line in the log.
  const logs = join(home.data, 'logs');
  result.update = readdirSync(logs).flatMap((f) => readFileSync(join(logs, f), 'utf8').split('\n')).filter((l) => l.includes(' update ')).map((l) => l.trim().slice(25, 200));

  // Next time: the work is still there, and without the switch the debug tools are not.
  run = await start(home, { debug: false });
  await run.page.waitForSelector('#game canvas', { timeout: 30_000 });
  await sleep(2500);
  check(await run.page.evaluate(() => window.lamplightDebug === undefined), 'the debug tools stay hidden in a packaged build');
  await run.page.locator('.toolbar button.tool-btn').nth(2).click();
  await run.page.waitForSelector('.shelf-card', { timeout: 5000 });
  check(await run.page.locator('.shelf-card li.work').count() === 2, 'both works are on the shelf after a restart');
  await new Shop(null, run.page, lang, home).shot(join(out, 'shelf.png'));
  check(await stop(run), 'it closes by itself the second time too');
} finally {
  if (run.proc.exitCode === null) spawnSync('taskkill', ['/pid', String(run.proc.pid), '/T', '/F'], { stdio: 'ignore' });
}

check(fingerprint(realData) === before, 'the real data folder was not touched');
writeFileSync(join(out, 'result.json'), JSON.stringify({ ...result, failures }, null, 2));
console.log(JSON.stringify(result));
console.log(failures.length ? `FAILED ${failures.length}` : 'PACKAGED OK');
process.exit(failures.length ? 1 : 0);
