#!/usr/bin/env node
// Simulated acceptance run: drives the built app through every kind of commission and the features around them,
// in Chinese and English, against the stand-in Claude. Nothing is spent and no real credentials can be reached.
//
//   npm run build && node tools/sim/accept.mjs [--lang zh-CN,en] [--only demo,board,...] [--out sim-out]
//
// Each scenario prints PASS or FAIL with the reason, and leaves screenshots in <out>/<lang>/.

import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { closeSync, copyFileSync, cpSync, existsSync, ftruncateSync, openSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { mainCards } from './cards.mjs';
import { pdfSays, readPdf } from './pdftext.mjs';
import { FAKE_CLAUDE, freshHome, launch, locale, onboarded, sleep, ROOT } from './shop.mjs';
import { OFFICE_FILES, OFFICE_READ_FILE } from './plays.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const LANGS = opt('lang', 'zh-CN,en').split(',');
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const OUT = join(ROOT, opt('out', 'sim-out'));
const SPEED = Number(opt('speed', '120'));

const W = {
  'zh-CN': {
    page: '帮我做一个家庭聚会签到的小网页。',
    research: '帮我查一查阳台种番茄要注意什么，写一份简短的总结。',
    letter: '帮我写一封给房东的信，说下个月底退租。',
    sheet: '帮我做一个记每月开销的表格。',
    plan: '帮我排一个四周学会游泳换气的计划。',
    album: '用这些照片做一本秋天出游的小相册。',
    resume: '帮我写一份应聘图书馆管理员的简历。',
    notes: '帮我给《瓦尔登湖》做一份读书笔记。',
    travel: '帮我做一份杭州的旅行攻略，三天。',
    tool: '帮我做一个把文本里的英文全改成大写的小工具。',
    document: '帮我写一份周末读书会的通知。',
    slides: '帮我做一份介绍春季新菜单的 PPT。',
    chart: '帮我把这些数字画成图表：一月 120，二月 180，三月 90，四月 150。',
    poster: '帮我做一张周末读书会的海报。',
    toolRename: '帮我做一个按日期给照片改名的小工具。',
    toolWipe: '帮我做一个删掉文件夹里临时文件的小工具。',
    edit: '帮我改一下这份文档：读起来更顺一点。',
    tidy: '帮我看看这个文件夹该怎么整理：下载文件夹太乱了。',
    note: '页面底部加一行联系电话',
    ask: '颜色再浅一点',
  },
  en: {
    page: 'Make me a small web page for a family reunion sign-in.',
    research: 'Look into growing tomatoes on a balcony and write me a short summary.',
    letter: 'Write a letter to my landlord about moving out at the end of next month.',
    sheet: 'Make me a table for monthly spending.',
    plan: 'Plan out four weeks of learning to breathe while swimming for me.',
    album: 'Make a little album of these photos: our autumn trip.',
    resume: 'Write me a résumé for a job as a librarian.',
    notes: 'Make me reading notes on Walden.',
    travel: 'Make me a travel guide for Edinburgh, three days.',
    tool: 'Make me a small tool that turns the text in a file into capitals.',
    document: 'Write me a notice about the weekend book club.',
    slides: 'Make me slides about the new spring menu.',
    chart: 'Draw a chart of tea sales from these numbers: January 120, February 180, March 90, April 150.',
    poster: 'Make a poster for the weekend book club.',
    toolRename: 'Make me a small tool that renames photos by date.',
    toolWipe: 'Make me a small tool that deletes the temporary files in a folder.',
    edit: 'Please edit this document: make it read more smoothly.',
    tidy: 'How should I tidy up this folder? My downloads are a mess.',
    note: 'Add a contact phone number at the bottom',
    ask: 'Make the colours a bit lighter',
  },
};

/** Sample files handed over to the shop: two photos and a short note. */
function samples(home) {
  const dir = join(home.home, 'samples');
  mkdirSync(dir, { recursive: true });
  const art = join(ROOT, 'assets', 'sprites');
  const pngs = readdirSync(art).filter((f) => f.endsWith('.png')).slice(0, 3);
  const photos = pngs.map((f, i) => {
    const to = join(dir, `photo-${i + 1}.png`);
    writeFileSync(to, readFileSync(join(art, f)));
    return to;
  });
  const note = join(dir, 'notes.txt');
  writeFileSync(note, 'Saturday 3pm, the park by the river.\nBring a blanket.\n');
  const doc = join(dir, 'letter-draft.txt');
  writeFileSync(doc, 'Dear all,\n\n\nThis is a draft that   rambles a bit.\nIt could read better.\n');
  const messy = join(dir, 'Downloads');
  mkdirSync(messy, { recursive: true });
  for (const f of ['setup (1).exe', 'setup.exe', 'IMG_2031.jpg', 'report-final-final.docx']) writeFileSync(join(messy, f), 'x');
  return { dir, photos, note, doc, messy };
}

/** The shop's file names in one language. */
const shopFiles = (lang) => JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).ui.files;

/** A PNG's width and height from its header, or null when the file is missing or no PNG. */
function pngSize(file) {
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  return b.subarray(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
}

/** A small 24-bit BMP with a colour ramp, the kind an old scanner saves. */
function bmpOf(width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const b = Buffer.alloc(54 + row * height);
  b.write('BM', 0);
  b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(height, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * height, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) b.set([Math.round((255 * x) / width), 120, Math.round((255 * y) / height)], 54 + y * row + x * 3);
  }
  return b;
}

/** Every file under a folder, by path inside it with "/", sorted. */
const filesIn = (dir) => readdirSync(dir, { recursive: true }).map((p) => p.split(sep).join('/')).filter((p) => statSync(join(dir, p)).isFile()).sort();

/** Unpack a zip with the system's own tool, not the shop's code, into a folder beside it. */
function unzipped(file) {
  const to = `${file}-out`;
  mkdirSync(to);
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-xf', file, '-C', to], { encoding: 'utf8' });
  check(run.status === 0, `could not unpack ${file}: ${run.stderr}`);
  return to;
}

/** Clicks that would open a file in Word or a browser are written down instead (globalThis.opened, .revealed). */
const recordOpens = (shop) => shop.app.evaluate(({ shell }) => {
  globalThis.opened = [];
  globalThis.revealed = [];
  shell.openPath = async (p) => { globalThis.opened.push(p); return ''; };
  shell.showItemInFolder = (p) => { globalThis.revealed.push(p); };
});
const opened = (shop) => shop.app.evaluate(() => ({ opened: globalThis.opened, revealed: globalThis.revealed }));

/** The result card's thumbnail (road-to-1.3.md C1), once it has come: its data: address, and how long it took. */
async function cardThumb(shop, timeout = 10_000) {
  const start = Date.now();
  const img = shop.page.locator('.result-card .result-thumb:not([hidden]) img');
  await img.waitFor({ state: 'visible', timeout });
  return { src: await img.getAttribute('src'), ms: Date.now() - start };
}

/**
 * What officeSafe looks for, checked with the system's own unzip rather than the shop's code: no macro project, no
 * macro-enabled type, no relationship that reaches outside except a web link.
 */
function looksSafe(file, scratch) {
  mkdirSync(scratch, { recursive: true });
  // The system tar cannot open every name (Chinese ones, on Windows): the copy goes by its kind.
  const copy = join(scratch, `package-${readdirSync(scratch).length}${file.slice(file.lastIndexOf('.'))}`);
  cpSync(file, copy);
  const dir = unzipped(copy);
  const parts = filesIn(dir);
  check(!parts.some((p) => /vbaProject\.bin$/i.test(p)), `${copy}: carries a macro project`);
  check(!/macroEnabled/i.test(readFileSync(join(dir, '[Content_Types].xml'), 'utf8')), `${copy}: macro-enabled`);
  for (const rel of parts.filter((p) => p.endsWith('.rels'))) {
    for (const r of readFileSync(join(dir, rel), 'utf8').match(/<Relationship [^>]*>/g) ?? []) {
      check(!/TargetMode="External"/.test(r) || /\/hyperlink"/.test(r), `${copy}: ${rel} reaches outside: ${r}`);
    }
  }
  return { dir, parts };
}

/** Connect the test connection from the notebook (C4) and close the notebook again. */
async function connectTest(shop) {
  const { page, L } = shop;
  await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
  await page.waitForSelector('.notebook .notebook-connections');
  await sleep(400);
  await page.locator('.notebook-connections .connection-add[data-kind="test"]').click();
  await page.waitForSelector('.grant-card');
  await sleep(400);
  await page.locator('.grant-card .grant-connect').click();
  await page.waitForSelector('.notebook .connection');
  await sleep(400);
  await page.keyboard.press('Escape');
  await sleep(300);
}

/**
 * Connect a kind from the notebook (C5): the folder its dialog will pick, the address typed on its card, `shot` with the
 * card up, and the notebook left open on the connections page. `keep`: the connection is expected not to be made.
 */
async function connectKind(shop, kind, { folder, address, shot, keep = false } = {}) {
  const { page, L } = shop;
  if (folder) await shop.pickFiles([folder]);
  await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
  await page.waitForSelector('.notebook .notebook-connections');
  await sleep(400);
  await page.locator(`.notebook-connections .connection-add[data-kind="${kind}"]`).click();
  await page.waitForSelector('.grant-card');
  await sleep(400);
  if (address) await page.locator('.grant-card .grant-address').fill(address);
  if (shot) await shot();
  await page.locator('.grant-card .grant-connect').click();
  await page.waitForSelector(keep ? '.notebook .notebook-connections' : '.notebook .connection');
  await sleep(500);
}

/** Fill in a slip with the one connection ticked, and send it. */
async function orderWithConnection(shop, want) {
  await shop.order({ want });
  const tick = shop.page.locator('form.commission .connection-row input[type=checkbox]');
  await tick.first().waitFor({ state: 'visible', timeout: 5000 });
  await tick.first().check();
  await shop.submit();
}

/** The newest commission folder under the shop's Documents. */
function latestCommission(home) {
  const found = [];
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!statSync(p).isDirectory()) continue;
      if (/^\d{4}-\d{2}-\d{2}-\d{6}-/.test(name)) found.push(p);
      else if (depth < 3 && !name.startsWith('.')) walk(p, depth + 1);
    }
  };
  walk(home.home, 0);
  return found.sort().at(-1);
}

/** Copy a legacy-out snapshot into a fresh home, pointing every stored path at the new place. */
function restoreHome(snap) {
  const home = freshHome();
  rmSync(home.home, { recursive: true, force: true });
  cpSync(join(snap, 'home'), home.home, { recursive: true });
  const old = readFileSync(join(snap, 'home.txt'), 'utf8').trim();
  for (const f of readdirSync(home.data).filter((n) => n.endsWith('.json'))) {
    const p = join(home.data, f);
    // JSON keeps a Windows path with its backslashes doubled, so the old home is looked for in that form too.
    const inJson = (path) => JSON.stringify(path).slice(1, -1);
    writeFileSync(p, readFileSync(p, 'utf8').split(inJson(old)).join(inJson(home.home)).split(old).join(home.home));
  }
  return home;
}

/**
 * A local update feed, as electron-updater's generic provider reads it: latest.yml naming a newer version with notes in
 * both languages, and its "installer" (a few made-up bytes, never run). `config` is the app-update.yml pointing at it;
 * `asked` lists every file the app asked for.
 */
async function updateFeed(home, version = '1.1.1') {
  const dir = join(home.home, 'feed');
  mkdirSync(dir, { recursive: true });
  const exe = `Lamplight-Nook-Setup-${version}.exe`;
  const body = Buffer.from(`not a real installer, ${version}\n`.repeat(4000));
  writeFileSync(join(dir, exe), body);
  const sha512 = createHash('sha512').update(body).digest('base64');
  const notes = [`## 小灯屋 ${version}`, '', `- ${UPDATE_NOTES['zh-CN']}`, '', `## Lamplight Nook ${version}`, '', `- ${UPDATE_NOTES.en}`, ''].join('\n');
  writeFileSync(join(dir, 'latest.yml'), [
    `version: ${version}`, 'files:', `  - url: ${exe}`, `    sha512: ${sha512}`, `    size: ${body.length}`,
    `path: ${exe}`, `sha512: ${sha512}`, "releaseDate: '2026-11-15T00:00:00.000Z'", `releaseNotes: ${JSON.stringify(notes)}`, '',
  ].join('\n'));
  const asked = [];
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://feed').pathname.slice(1));
    asked.push(name);
    const file = join(dir, name);
    if (!name || name.includes('..') || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-length': statSync(file).size }).end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const config = join(dir, 'app-update.yml');
  writeFileSync(config, `provider: generic\nurl: http://127.0.0.1:${server.address().port}/\nupdaterCacheDirName: lamplight-nook-updater\n`);
  return { config, exe, asked, close: () => server.close() };
}
/** What the new version's notes say, one line in each language. */
const UPDATE_NOTES = { 'zh-CN': '有新版本时，邮差会送信来。', en: 'The postman brings word of new versions.' };

/** The app's log lines so far (app/main/log.ts), each with its time. */
const logLines = (home) => {
  const dir = join(home.data, 'logs');
  return existsSync(dir) ? readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n')).filter(Boolean) : [];
};
const logged = (home, what) => logLines(home).filter((l) => l.includes(` ${what}`));
async function waitForLog(home, what, count, timeout = 30_000) {
  const until = Date.now() + timeout;
  while (logged(home, what).length < count && Date.now() < until) await sleep(500);
  return logged(home, what).length >= count;
}

/** A moment as the shop's clock takes it (LAMPLIGHT_CLOCK): local YYYY-MM-DDTHH:MM:SS. */
const localStamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const check = (cond, why) => { if (!cond) throw new Error(why); };
/** The rounds the shop has written down as under way or to carry on (road-to-1.2.md B7): pending/<run>.json. */
const pendingRounds = (home) => {
  const dir = join(home.data, 'pending');
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^r\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : [];
};
/** Choose the second option on questions, and "not now" on serious cards (the default). */
const demoAnswers = (card) => (card.serious ? null : 1);

async function runOne(shop, { template, want, files }, opts = {}) {
  await shop.order({ template, want, files });
  await shop.submit();
  let r = await shop.workUntilDone(opts);
  for (let i = 0; !r.ok && r.stopped && i < 12; i++) {
    await shop.retry();
    r = await shop.workUntilDone(opts);
  }
  await checkBubbles(shop);
  return r;
}

/** Nothing anyone says is half hidden: no bubble crosses a card or sits on another bubble. */
async function checkBubbles(shop) {
  const clashes = await shop.page.evaluate(() => {
    const touch = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const shown = [...document.querySelectorAll('.label.bubble')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => ({ text: e.textContent, box: e.getBoundingClientRect() }));
    const cards = [...document.querySelectorAll('.card, .parcel, .dialog, .serious')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const out = [];
    shown.forEach((b, i) => {
      if (cards.some((c) => touch(b.box, c))) out.push(`card over "${b.text}"`);
      for (const other of shown.slice(i + 1)) if (touch(b.box, other.box)) out.push(`"${b.text}" on "${other.text}"`);
    });
    return out;
  });
  check(!clashes.length, `speech bubbles: ${clashes.join('; ')}`);
}

/**
 * Another commission while one is under way (road-to-1.2.md B5): the counter shows the running card, and "take another
 * commission" there opens the slip.
 */
async function another(shop, { template, want }, counter) {
  // The counter of whichever room is on screen: the view follows the last order to its shop (road-to-1.4.md D3).
  const room = await shop.page.evaluate(() => window.lamplightDebug.scene.room);
  await shop.hotspot(counter ?? shop.L.sceneText[room]?.ui.access.hotspotCounter ?? shop.L.ui.access.hotspotCounter);
  await shop.page.locator('.running-card .progress-another').click();
  await shop.page.waitForSelector('form.commission');
  const chip = shop.page.locator('form.commission .template-chip', { hasText: shop.L.ui.templates[template] });
  if (!(await chip.getAttribute('class')).includes('on')) await chip.click();
  await shop.page.fill('form.commission textarea', want);
  await shop.submit();
}
/** Open the project board from the toolbar, and what each row says: its status, why it waits, and whether it can be called off. */
async function boardRows(shop) {
  await shop.page.locator(`.toolbar button.tool-btn[aria-label="${shop.L.ui.projects.button}"]`).click();
  await shop.page.waitForSelector('.project-card:not(.timeline-card)');
  await sleep(300);
  return shop.page.locator('.project-card li.project-row').evaluateAll((rows) => rows.map((r) => ({
    title: r.querySelector('.project-open, .project-name')?.textContent ?? '',
    status: r.querySelector('.project-status')?.textContent ?? '',
    waits: r.querySelector('.project-waits')?.textContent ?? '',
    callOff: Boolean(r.querySelector('.project-call-off')),
  })));
}

/** Open the slip at the counter, start a talk with Adeng (B4) and say each line, waiting for his answer to each. */
async function talk(shop, lines) {
  await shop.order({});
  await shop.page.locator('form.commission .consult-open').click();
  await shop.page.waitForSelector('.consult-say');
  for (const line of lines) {
    const before = await shop.page.locator('.consult-line.adeng:not(.waiting)').count();
    await shop.page.fill('.consult-say', line);
    await shop.page.locator('.consult-send').click();
    await shop.page.waitForFunction((n) => document.querySelectorAll('.consult-line.adeng:not(.waiting)').length > n, before, { timeout: 20_000 });
  }
}
/** "That's it, write up the slip": wait for the slip to come back filled in. */
async function writeUp(shop) {
  await shop.page.locator('.consult-finish').click();
  await shop.page.waitForSelector('.consult', { state: 'hidden', timeout: 20_000 });
  await sleep(300);
}
/** What the slip says now, the sticker picked and the note on top. */
const slipValues = (shop) => shop.page.evaluate(() => {
  const f = document.querySelector('form.commission');
  const inputs = f.querySelectorAll('.slip-body input[type=text]');
  return { want: f.querySelector('.slip-body textarea').value, details: inputs[0].value, audience: inputs[1].value, chip: f.querySelector('.template-chip.on')?.textContent ?? '', note: f.querySelector('.consult-note').textContent };
});
/** The slip, or the talk in its place, fits the window: nothing pushed sideways or off the top or bottom. */
async function noSpill(shop, what) {
  const spill = await shop.page.locator('form.commission').evaluate((f) => {
    const box = f.getBoundingClientRect();
    return f.scrollWidth > f.clientWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1;
  });
  check(!spill, `${what} does not fit the window`);
}

/** The pieces that come with the number of works done (app/shared/growth.ts COUNTED), and when. */
const COUNTED_PIECES = [
  ['painting', 1], ['plant', 2], ['lights', 3], ['fruit', 5], ['guitar', 8], ['bonsai', 12], ['easel', 16], ['trophy', 20], ['portrait', 25],
  ['sunset', 35], ['star', 50], ['chime', 55], ['aquarium', 60], ['scroll', 65], ['teapot', 70], ['gramophone', 75], ['cushion', 80], ['hat', 90], ['plaque', 100],
];

/**
 * The street through the year (road-to-1.4.md D6), out of a shop past a hundred works: each season and each festival
 * once, rain and snow with Xiaoju out under an umbrella, and each festival in the three shops along the street.
 */
async function seasonsOnTheStreet(shop, out) {
  const { page, L } = shop;
  const town = JSON.parse(readFileSync(join(ROOT, 'assets/sprites/town.json'), 'utf8'));
  const streetButton = () => page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.street}"]`).click();
  const set = (sky, holiday, season) => page.evaluate(([sky, holiday, season]) => {
    const { scene } = window.lamplightDebug;
    scene.setWeather(sky, holiday, false);
    if (season) scene.setSeason(season);
    scene.setPeriod('day', true);
  }, [sky, holiday, season]);
  const street = () => page.evaluate(() => {
    const s = window.lamplightDebug.street;
    const ids = ['spring', 'summer', 'autumn', 'winter', 'halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn', 'rain', 'snow'];
    return { decor: ids.filter((id) => s.decor.shows(id)), cart: s.growth.shows('stall'), umbrella: !!s.umbrella?.visible };
  });
  const scrollTo = (x) => page.evaluate((x) => { window.lamplightDebug.street.cameras.main.scrollX = x; }, x);

  await set('clear', null, 'spring');
  await streetButton();
  await sleep(800);
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    await set('clear', null, season);
    await sleep(300);
    const v = await street();
    check(JSON.stringify(v.decor) === JSON.stringify([season]), `in ${season} the street shows ${v.decor}`);
    // The tree by the workshop and the two in the lot.
    await scrollTo(500);
    await sleep(200);
    await shop.shot(join(out, `seasons-street-${season}.png`));
  }
  for (const holiday of ['halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn']) {
    const season = { halloween: 'autumn', christmas: 'winter', new_year: 'winter', lantern: 'spring', dragon_boat: 'summer', mid_autumn: 'autumn' }[holiday];
    await set('clear', holiday, season);
    await sleep(300);
    const v = await street();
    check(v.decor.includes(holiday) && v.decor.includes(season), `at ${holiday} the street shows ${v.decor}`);
    // The New Year has no stall: the cart stays out. The others stand where it does.
    check(v.cart === (holiday === 'new_year'), `at ${holiday} the cart is ${v.cart ? 'out' : 'away'}`);
    await scrollTo(holiday === 'new_year' ? 0 : town.lot.x + town.lot.w / 2 - 200);
    await sleep(200);
    await shop.shot(join(out, `seasons-street-${holiday}.png`));
  }
  for (const sky of ['rain', 'snow']) {
    await set(sky, null, sky === 'snow' ? 'winter' : 'summer');
    await sleep(600);
    const v = await street();
    check(v.decor.includes(sky), `on a ${sky} day the street shows ${v.decor}`);
    await scrollTo(0);
    await sleep(200);
    await shop.shot(join(out, `seasons-street-${sky}.png`));
  }

  // Xiaoju goes out on an errand in the snow: an umbrella over her, in the inset and on the street.
  await page.keyboard.press('Escape');
  await sleep(600);
  await page.evaluate(() => { void window.lamplightDebug.scene.walkTo('xiaoju', 'door'); });
  let w = null;
  for (let i = 0; i < 60 && !(w && w.alpha === 1); i++) {
    await sleep(500);
    w = await page.evaluate(() => window.lamplightDebug.scene.streetWalker());
  }
  check(w && w.actor === 'xiaoju', `Xiaoju did not go out: ${JSON.stringify(w)}`);
  const inset = await page.evaluate(() => !!window.lamplightDebug.scene.street.umbrella?.visible);
  check(inset, 'no umbrella over Xiaoju in the inset on a snowy day');
  await shop.shot(join(out, 'seasons-street-umbrella-inset.png'));
  await streetButton();
  await sleep(800);
  check((await street()).umbrella, 'no umbrella over Xiaoju on the street on a snowy day');
  await shop.shot(join(out, 'seasons-street-umbrella.png'));

  // Each festival in each shop along the street: its own frame of shops-decor.png.
  for (const room of ['print', 'studio', 'workshop']) {
    await page.evaluate((room) => window.lamplightDebug.street.lookAt(room), room);
    await page.keyboard.press('Enter');
    await sleep(1500);
    check(await page.evaluate(() => window.lamplightDebug.scene.room) === room, `Enter in front of the ${room} did not go in`);
    for (const holiday of ['halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn']) {
      await set('clear', holiday);
      await sleep(300);
      const frame = await page.evaluate(() => {
        const d = window.lamplightDebug.scene.weather.decor;
        return d.visible ? `${d.texture.key}:${d.frame.name}` : null;
      });
      check(frame === `shops-decor:${room}-${holiday}`, `the ${room} at ${holiday} shows ${frame}`);
      await shop.shot(join(out, `seasons-${room}-${holiday}.png`));
    }
    await set('clear', null);
    await streetButton();
    await sleep(800);
  }
  await page.keyboard.press('Escape');
  await sleep(500);
}

const SCENARIOS = {
  /** Data files that cannot be read: nothing is written over, the shop says so, and work goes on. */
  async baddata(lang, out) {
    const N = locale(lang).ui.notebook;
    const works = Array.from({ length: 3 }, (_, i) => ({ id: `c${1760000000000 + i * 86400000}`, title: `work ${i + 1}`, date: '2025-10-09', result: 'done', choices: {}, folder: 'C:/nowhere', form: { want: 'x', template: 'page' } }));
    const good = JSON.stringify({ commissions: works, stuckNotes: [], greeted: 'c1', shop: { done: 3, told: [], grown: [], met: [] } });
    const kept = (home, name) => readdirSync(home.data).filter((f) => f.startsWith(`${name}.broken-`));

    // With a copy from the last opening: the works come back.
    let home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': '{"commissions":[{"titl', 'memory.last-good.json': good, 'spend.json': '[{"key"' });
    let shop = await launch({ lang, home, debug: true });
    try {
      await shop.page.waitForSelector('.notebook-trouble', { timeout: 10_000 });
      const said = await shop.page.locator('.notebook-trouble').innerText();
      check(said.includes(N.troubleRestored), 'the shop does not say what happened');
      check(said.includes(N.troubleLedger), 'the shop does not mention the ledger');
      check(kept(home, 'memory').length === 1, 'the file that could not be read was not put aside');
      check(kept(home, 'spend').length === 1, 'the ledger that could not be read was not put aside');
      await shop.shot(join(out, 'baddata.png'));
      await shop.page.locator('.notebook-trouble button.default').click();
      // Moving to another room reloads the page: it has been said.
      await shop.page.reload();
      await shop.page.waitForSelector('.toolbar');
      await sleep(3000);
      check(await shop.page.locator('.notebook-trouble').count() === 0, 'the shop says it again after a reload');
      await shop.page.locator('.toolbar button.tool-btn').nth(2).click();
      await shop.page.waitForSelector('.shelf-card');
      check(await shop.page.locator('.shelf-card li.work').count() === 3, 'the works did not come back');
      await shop.page.keyboard.press('Escape');
      await sleep(300);
      await shop.order({ template: 'demo' });
      await shop.submit();
      check((await shop.workUntilDone()).ok, 'the next commission did not finish');
    } finally {
      await shop.close();
    }
    const after = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    check(after.commissions.length === 4, `${after.commissions.length} works after the next commission`);
    check(readFileSync(join(home.data, kept(home, 'memory')[0]), 'utf8') === '{"commissions":[{"titl', 'the file put aside changed');

    // Opening again: all is well, nothing more is said.
    shop = await launch({ lang, home, debug: true });
    try {
      await sleep(4000);
      check(await shop.page.locator('.notebook-trouble').count() === 0, 'the shop says it again the next time');
    } finally {
      await shop.close();
    }

    // No copy: a new notebook, and the old one still there.
    home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': 'garbage' });
    shop = await launch({ lang, home, debug: true });
    try {
      await shop.page.waitForSelector('.notebook-trouble', { timeout: 10_000 });
      check((await shop.page.locator('.notebook-trouble').innerText()).includes(N.troubleLost), 'the shop does not say it lost the notebook');
      check(kept(home, 'memory').length === 1, 'the file that could not be read was not put aside');
    } finally {
      await shop.close();
    }

    // A card that must be answered comes first, then this one.
    home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': 'garbage', 'pending.json': JSON.stringify({ workDir: join(tmpdir(), 'nowhere'), form: { want: 'x' }, id: 'c1', startedAt: 1760000000000 }) });
    shop = await launch({ lang, home, debug: true });
    try {
      await shop.page.waitForSelector('.pending-card', { timeout: 10_000 });
      check(await shop.page.locator('.notebook-trouble').count() === 0, 'the trouble card pushed the unfinished work aside');
    } finally {
      await shop.close();
    }
  },

  /** Small laptops and Windows display scaling: game pixels stay even, clicks land, and every card stays on the screen. */
  async screens(lang, out) {
    const problems = [];
    const see = (ok, why) => { if (!ok) problems.push(why); };
    // Real display scaling: 1366x768 at 125%, 1920x1080 at 150%, 1536x864 (a 1080p laptop at 125%), 2560x1440 at 175%.
    for (const [w, h, scale] of [[1093, 580, 1.25], [1280, 680, 1.5], [1536, 830, 1.25], [1463, 790, 1.75]]) {
      const name = `${w}x${h}@${scale}`;
      const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), size: [w, h], displayScale: scale, debug: true });
      try {
        await sleep(2500);
        const got = await shop.page.evaluate(() => {
          const r = document.querySelector('#game canvas').getBoundingClientRect();
          return { dpr: devicePixelRatio, x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
        });
        see(Math.abs(got.dpr - scale) < 0.01, `${name}: the display scale is ${got.dpr}`);
        const real = got.w * got.dpr / 320;
        see(Math.abs(real - Math.round(real)) < 0.01, `${name}: a game pixel is ${real} real pixels wide`);
        see(got.x >= 0 && got.y >= 0 && got.x + got.w <= got.vw + 1 && got.y + got.h <= got.vh + 1, `${name}: the shop does not fit: ${JSON.stringify(got)}`);
        // By day whatever the clock says: the evening's lamplight is a gradient, with runs that are no one's pixels.
        await shop.page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
        await sleep(500);
        // Counted on the picture itself: runs of one colour across a row are whole numbers of game pixels.
        const pic = await shop.page.screenshot({ scale: 'device', clip: { x: got.x, y: got.y + got.h * 0.1, width: got.w, height: got.h * 0.5 } });
        const uneven = await shop.page.evaluate(async ([png, n]) => {
          const img = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }));
          const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
          c.drawImage(img, 0, 0);
          const d = c.getImageData(0, 0, img.width, img.height).data;
          let runs = 0, off = 0;
          for (let y = 0; y < img.height; y += n * 3) {
            let start = 0;
            for (let x = 1; x < img.width; x++) {
              const at = (y * img.width + x) * 4;
              if (d[at] === d[at - 4] && d[at + 1] === d[at - 3] && d[at + 2] === d[at - 2]) continue;
              runs++;
              if ((x - start) % n) off++;
              start = x;
            }
          }
          return off / runs;
        }, [pic.toString('base64'), Math.round(real)]);
        see(uneven < 0.03, `${name}: ${(uneven * 100).toFixed(1)}% of the colour runs are not whole game pixels`);
        await shop.page.screenshot({ path: join(out, `screens-${name}.png`), scale: 'device' });
        // A click on Adeng, wherever scaling has put them, lands on Adeng.
        const spot = await shop.page.evaluate(() => {
          const scene = window.lamplightDebug.scene;
          const s = scene.actors.get('adeng').sprite;
          const r = document.querySelector('#game canvas').getBoundingClientRect();
          return { x: r.x + s.x * r.width / 320, y: r.y + (s.y - 10) * r.height / 180 };
        });
        await shop.page.mouse.click(spot.x, spot.y);
        see(await shop.maybe('.actor-card', 3000), `${name}: clicking Adeng does not open their card`);
        await shop.page.keyboard.press('Escape');
      } finally {
        await shop.close();
      }
    }
    // The smallest window the app allows, and small ones around it: every card stays on the screen, close button and all.
    const memory = {
      commissions: Array.from({ length: 12 }, (_, i) => ({ id: `c${1760000000000 + i * 86400000}`, title: 'A long enough name for a commission', date: '2026-10-20', result: 'done', choices: { Q: 'A' }, costUsd: 0.2, folder: 'C:/nowhere', form: { want: 'x', template: 'letter' } })),
      stuckNotes: [], greeted: 'c1', shop: { done: 12, told: [], grown: [], met: [] },
    };
    const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory) }), debug: true });
    try {
      for (const size of [[640, 360], [800, 450], [911, 512]]) {
        await shop.resize(size);
        for (const [name, sel, open, tab] of mainCards(lang)) {
          if (tab) await shop.openSettings(tab);
          else await shop.page.evaluate(`void (${open})`);
          await sleep(300);
          const box = await shop.page.evaluate((sel) => {
            const card = document.querySelector(sel);
            const r = card.getBoundingClientRect();
            const buttons = [...card.querySelectorAll('.actions button.default, :scope > button.close')].map((b) => b.getBoundingClientRect());
            return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, vw: innerWidth, vh: innerHeight, offPaper: card.matches('.paper') && card.scrollHeight > card.clientHeight + 1, buttonsOut: card.scrollHeight > card.clientHeight ? 0 : buttons.filter((b) => b.top < 0 || b.bottom > innerHeight + 1 || b.left < 0 || b.right > innerWidth + 1).length };
          }, sel);
          const where = `${size.join('x')} ${name}`;
          see(box.top >= -1 && box.left >= -1 && box.bottom <= box.vh + 1 && box.right <= box.vw + 1, `${where} leaves the window: ${Math.round(box.top)}..${Math.round(box.bottom)} of ${box.vh}, ${Math.round(box.left)}..${Math.round(box.right)} of ${box.vw}`);
          see(box.buttonsOut === 0, `${where}: ${box.buttonsOut} of its buttons are out of reach`);
          // The paper is only as tall as the card, so the inside has to do the scrolling.
          see(!box.offPaper, `${where}: its words run off the paper`);
          if (size[0] === 640 && (name === 'shelf' || name === 'slip' || name === 'settings-work')) await shop.shot(join(out, `screens-small-${name}.png`));
          await shop.page.keyboard.press('Escape');
          await sleep(200);
          const stuck = shop.page.locator('.pending-card button.default');
          if (await stuck.count()) await stuck.click();
          await sleep(100);
        }
      }
    } finally {
      await shop.close();
    }
    check(problems.length === 0, `\n  ${problems.join('\n  ')}`);
  },

  /** Every kind of text on every main card can be read: tools/sim/contrast.mjs. */
  async contrast(lang, out) {
    const run = spawnSync(process.execPath, [join(ROOT, 'tools', 'sim', 'contrast.mjs'), '--lang', lang, '--out', out], { encoding: 'utf8' });
    check(run.status === 0, `too faint:\n${run.stdout.split('\n').filter((l) => l.startsWith('LOW') || l.startsWith('?')).join('\n')}${run.stderr}`);
    console.log(`  ${run.stdout.trim().split('\n').at(-1)}`);
  },

  /** Settings that cannot be read: the welcome again, then the shop says why and what the budget is now. */
  async badsettings(lang, out) {
    const N = locale(lang).ui.notebook;
    const home = freshHome({ 'settings.json': '{"name":"Sam' });
    const shop = await launch({ lang, home, debug: true });
    try {
      check(await shop.maybe('.welcome input[type=text]', 8000), 'no welcome card');
      await shop.page.locator('.welcome input[type=text]').fill(lang === 'en' ? 'Sam' : '小林');
      for (let i = 0; i < 2; i++) {
        await shop.page.locator('.welcome .actions button.default').last().click();
        await sleep(300);
      }
      // Something else on the table holds the card back, and the limit changes while it waits.
      await shop.page.evaluate(() => { const c = document.createElement('div'); c.className = 'card held'; document.getElementById('ui').append(c); });
      await shop.page.locator('.welcome .actions button.default').last().click();
      await sleep(3000);
      await shop.page.evaluate(() => window.lamplight.saveSettings({ budgetUsd: 1 }));
      await shop.page.evaluate(() => document.querySelector('.card.held').remove());
      await shop.page.waitForSelector('.notebook-trouble', { timeout: 15_000 });
      const said = await shop.page.locator('.notebook-trouble').innerText();
      check(said.includes('$1') && !said.includes('$3'), `the budget it names is not the one in force: ${said}`);
      check(said.includes(N.troubleKept), 'the file put aside is not mentioned');
      await shop.shot(join(out, 'badsettings.png'));
    } finally {
      await shop.close();
    }
  },

  /** How each round went, kept on this computer: a real round is written down, the ledger page sums the month, and clearing it keeps the works. */
  async stats(lang, out) {
    const N = locale(lang).ui.notebook;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const round = (extra) => ({ date: day, seconds: 60, helpers: {}, waits: 0, waitedSeconds: 0, ...extra });
    const earlier = { id: `c${new Date(`${day}T12:00:00`).getTime()}`, title: 'Earlier', date: day, result: 'done', choices: {}, folder: 'C:/nowhere', rounds: [round({ failure: 'net' }), round({ waits: 2, waitedSeconds: 30 })] };
    const home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify({ commissions: [earlier], stuckNotes: [], greeted: earlier.id }) });
    const shop = await launch({ lang, home, speed: SPEED, debug: true });
    const saved = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions;
    try {
      const r = await runOne(shop, { template: 'demo' }, { answers: demoAnswers });
      check(r.ok, `did not finish: ${JSON.stringify(r)}`);
      const kept = saved().at(-1).rounds;
      check(kept?.length === 1 && kept[0].seconds > 0 && !kept[0].failure, `the round was not written down: ${JSON.stringify(kept)}`);
      check(kept[0].helpers.researcher === 1 && kept[0].helpers.reviewer === 1, `the errands were not counted: ${JSON.stringify(kept[0].helpers)}`);
      await shop.page.keyboard.press('Escape');
      await shop.page.evaluate(() => window.lamplightDebug.ui.showNotebook());
      await shop.page.waitForSelector('.notebook-ledger');
      const page = await shop.page.locator('.notebook-ledger').innerText();
      const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
      check(page.includes(fill(N.ledgerKind.net, { n: '1' })), `the failure is not on the page: ${page}`);
      check(page.includes(fill(N.ledgerSince, { date: day })), `it does not say since when: ${page}`);
      check(page.includes(fill(N.ledgerWaits, { n: '2', time: fill(N.ledgerSeconds, { s: '30' }) })), `the waiting is not summed: ${page}`);
      check(/\b2\b/.test(page) && /\b3\b/.test(page), `two works in three rounds are not counted: ${page}`);
      await shop.shot(join(out, 'stats.png'));
      await shop.page.locator('.notebook-ledger-clear').click();
      await sleep(500);
      check((await shop.page.locator('.notebook-ledger').innerText()).includes(N.ledgerCleared), 'clearing says nothing');
      const after = saved();
      check(after.length === 2 && after.every((c) => !c.rounds), `clearing lost works or kept rounds: ${JSON.stringify(after.map((c) => [c.title, c.rounds]))}`);
    } finally {
      await shop.close();
    }
  },

  /** The shop cannot open at all: it says so and goes, rather than staying behind with no window. */
  async badstart(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    writeFileSync(join(home.data, 'logs'), 'a file where the folder goes');
    const told = join(home.home, 'told.txt');
    const app = await launch({ lang, home, simEnv: { SIM_ERRORBOX: told }, noWindow: true }).catch(() => null);
    const exited = !app || await Promise.race([new Promise((r) => app.process().once('exit', () => r(true))), sleep(30_000).then(() => false)]);
    if (!exited) app.process().kill();
    check(exited, 'the app stayed running with no window');
    check(readFileSync(told, 'utf8').startsWith(locale(lang).ui.startFail.title), 'nothing was said');
  },

  /** Opening it twice brings the shop back rather than opening a second one on the same notebook. */
  async oneshop(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, debug: true });
    // The corner window comes up when the shop is put away, so only the big window counts.
    const hidden = () => shop.app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find((w) => w.getSize()[0] >= 640).isVisible());
    try {
      await shop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getSize()[0] >= 640).hide());
      await sleep(300);
      check(await hidden(), 'the shop could not be put away for the test');
      const again = await launch({ lang, home, noWindow: true }).catch(() => null);
      const gone = !again || await Promise.race([new Promise((r) => again.process().once('exit', () => r(true))), sleep(15_000).then(() => false)]);
      if (!gone) again.process().kill();
      check(gone, 'a second shop opened on the same data');
      await sleep(500);
      check(!(await hidden()), 'the first shop did not come back');
      await shop.page.evaluate(() => document.title);
    } finally {
      await shop.close();
    }
  },

  /** A work's folder was moved: the shelf says so, and takes the new place only if the work is really there. */
  async moved(lang, out) {
    const W = locale(lang).ui.shelf;
    const home = freshHome();
    const was = join(home.home, 'was');
    const now = join(home.home, 'now');
    const wrong = join(home.home, 'wrong');
    for (const d of [now, wrong]) mkdirSync(d, { recursive: true });
    writeFileSync(join(now, 'page.html'), 'x');
    writeFileSync(join(now, 'mine.txt'), 'x');
    const work = { id: 'c1760000000000', title: 'A page', date: '2025-10-09', result: 'done', choices: {}, folder: was, main: 'page.html', sessionId: 's1', form: { want: 'x', template: 'demo' } };
    writeFileSync(join(home.data, 'memory.json'), JSON.stringify({ commissions: [work], stuckNotes: [], greeted: work.id, shop: { done: 1, told: [], grown: [], met: [] } }));
    writeFileSync(join(home.data, 'settings.json'), JSON.stringify(onboarded(lang)));
    const shop = await launch({ lang, home, debug: true });
    const saved = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions[0];
    try {
      await shop.app.evaluate(({ shell }) => { globalThis.opened = []; shell.openPath = async (p) => { globalThis.opened.push(p); return ''; }; });
      await shop.page.locator('.toolbar button.tool-btn').nth(2).click();
      await shop.page.waitForSelector('.shelf-card');
      const row = shop.page.locator('.shelf-card li.work');
      await row.locator('.work-actions button').first().click();
      await row.locator('.work-note button').waitFor();
      check((await row.locator('.work-note').innerText()).includes(W.gone), 'the shelf does not say it is gone');

      await shop.pickFiles([wrong]);
      await row.locator('.work-note button').click();
      await sleep(400);
      check((await row.locator('.work-note').innerText()).includes(W.relinkWrong), 'a folder without the work was not refused');
      check(saved().folder === was, 'a folder without the work was taken');

      // Somewhere that holds far more than the work: the staff would be let loose on all of it.
      writeFileSync(join(home.home, 'page.html'), 'x');
      await shop.pickFiles([home.home]);
      await row.locator('.work-note button').click();
      await sleep(400);
      check((await row.locator('.work-note').innerText()).includes(W.relinkBroad), 'the whole home folder was not refused');
      check(saved().folder === was, 'the whole home folder was taken');

      await shop.pickFiles([now]);
      await row.locator('.work-note button').click();
      await sleep(400);
      check((await row.locator('.work-note').innerText()).includes(W.relinked), 'the shelf does not say it found it');
      check(saved().folder === now && !saved().sessionId, 'the notebook did not take the new folder');
      check(saved().preexisting.length === 1 && saved().preexisting[0].endsWith('mine.txt'), 'the file the shop made, or what else is in the folder, is counted wrongly');
      await row.locator('.work-actions button').first().click();
      await sleep(300);
      const opened = await shop.app.evaluate(() => globalThis.opened);
      check(opened.length === 1 && opened[0].endsWith('page.html') && opened[0].includes('now'), `opened ${opened}`);
      await shop.shot(join(out, 'moved.png'));
      // A round that made no file of its own still comes back with a card: without one the run ends in silence.
      await shop.page.keyboard.press('Escape');
      await shop.page.evaluate((workDir) => { window.lamplightDebug.ui.showResult({ ok: true, summary: 'done', files: [], workDir }); }, now);
      await shop.page.waitForSelector('.result-card');
      check((await shop.page.locator('.result-card').innerText()).includes('done'), 'a result with no file has no card');
    } finally {
      await shop.close();
    }
  },

  /** A year to the day after the first work: said once, whenever the shop is opened that day. */
  async birthday(lang, out) {
    const now = new Date();
    const made = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 12).getTime();
    const words = lang === 'en' ? "It's the shop's birthday today." : '今天是小店的生日。';
    const work = { id: `c${made}`, title: 'A page', date: '2025-10-09', result: 'done', choices: {}, folder: 'C:/nowhere', form: { want: 'x', template: 'demo' } };
    const home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify({ commissions: [work], stuckNotes: [], greeted: work.id, shop: { done: 1, told: [], grown: [], met: [] } }) });
    const listen = (shop) => shop.page.evaluate(() => {
      window.heard = [];
      setInterval(() => { window.heard.push(document.getElementById('labels').innerText); }, 200);
    });
    const heard = (shop) => shop.page.evaluate((w) => window.heard.some((h) => h.includes(w)), words);
    const told = (h) => JSON.parse(readFileSync(join(h.data, 'memory.json'), 'utf8')).shop.told.includes('birthday_1');
    const waitToHear = async (shop, ms) => {
      let said = false;
      for (const start = Date.now(); !said && Date.now() - start < ms; await sleep(500)) said = await heard(shop);
      return said;
    };
    // Closed before anyone got to say it: it still comes the next time the shop opens that day.
    let shop = await launch({ lang, home, debug: true });
    try {
      await sleep(3000);
    } finally {
      await shop.close();
    }
    check(!told(home), 'it counted as said though the shop closed before anyone said it');
    shop = await launch({ lang, home, debug: true });
    try {
      await listen(shop);
      check(await waitToHear(shop, 40_000), 'nobody said it was the birthday');
    } finally {
      await shop.close();
    }
    check(told(home), 'the shop did not remember saying it');
    shop = await launch({ lang, home, debug: true });
    try {
      await listen(shop);
      await sleep(20_000);
      check(!(await heard(shop)), 'it was said again the same day');
    } finally {
      await shop.close();
    }
    // Left open across midnight: said on the new day without opening the shop again.
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
    const eve = { ...work, id: `c${new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1, 12).getTime()}` };
    const later = freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify({ commissions: [eve], stuckNotes: [], greeted: eve.id, shop: { done: 1, told: [], grown: [], met: [] } }) });
    shop = await launch({ lang, home: later, debug: true });
    try {
      await listen(shop);
      await sleep(12_000);
      check(!(await heard(shop)), 'it was said the day before the birthday');
      await shop.page.clock.setFixedTime(tomorrow);
      check(await waitToHear(shop, 90_000), 'nobody said it when the day turned to the birthday');
    } finally {
      await shop.close();
    }
    check(told(later), 'the shop did not remember saying it on the new day');
  },

  /** Asked on the way out mid-commission: going on really goes on, and stopping really can be carried on next time. */
  async stopclose(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    let shop = await launch({ lang, home, debug: true, speed: 1500 });
    const quit = (answer) => shop.app.evaluate(({ app, dialog }, answer) => {
      dialog.showMessageBoxSync = () => answer;
      app.quit();
    }, answer);
    try {
      await shop.order({ template: 'page', want: 'A page' });
      await shop.submit();
      await sleep(2500);
      await quit(0);
      await sleep(1500);
      check(await shop.page.evaluate(() => document.visibilityState !== undefined), 'the window went');
      check(pendingRounds(home).length === 1, 'the commission was given up on although the answer was to keep going');
      const said = await shop.page.locator('#ui').innerText();
      const gone = shop.L.ui.run.failedTitle;
      check(!said.includes(gone), 'keeping going stopped the commission');
      const exit = new Promise((r) => shop.app.process().once('exit', r));
      await quit(1).catch(() => {});
      await Promise.race([exit, sleep(15_000)]);
    } finally {
      await shop.close().catch(() => {});
    }
    shop = await launch({ lang, home, debug: true });
    check(pendingRounds(home)[0]?.state === 'stopped', `"stop and close" left ${JSON.stringify(pendingRounds(home).map((j) => j.state))}`);
    try {
      check(await shop.maybe('.pending-card', 10_000), 'the promise to carry on next time was not kept');
    } finally {
      await shop.close();
    }
  },

  /** A commission that finishes just after "stop and close" is finished: nothing is left to carry on next time. */
  async stopdone(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, debug: true });
    try {
      await shop.order({ template: 'page', want: 'A page' });
      await shop.submit();
      await sleep(1000);
      check(pendingRounds(home)[0]?.state === 'running', 'the commission was not noted as under way');
      // The answer is "stop and close", and the window stays long enough for the commission to finish first.
      await shop.app.evaluate(({ BrowserWindow, dialog }) => {
        dialog.showMessageBoxSync = () => 1;
        const main = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini'));
        main.on('close', (e) => e.preventDefault());
        main.close();
      });
      check((await shop.workUntilDone()).ok, 'the commission did not finish');
      await sleep(500);
      check(pendingRounds(home).length === 0, 'a finished commission would be offered again next time');
      await shop.app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.removeAllListeners('close');
      });
    } finally {
      await shop.close();
    }
  },

  /** A folder with another work in it, or inside another work, is not where a moved work went. */
  async movedother(lang, out) {
    const W = locale(lang).ui.shelf;
    const home = freshHome();
    const was = join(home.home, 'was');
    const holder = join(home.home, 'holder');
    const other = join(holder, 'other');
    const inner = join(other, 'inner');
    const own = join(home.home, 'own');
    for (const d of [inner, own]) mkdirSync(d, { recursive: true });
    for (const d of [holder, other, inner, own]) writeFileSync(join(d, 'index.html'), 'x');
    const work = (id, title, folder) => ({ id, title, date: '2025-10-09', result: 'done', choices: {}, folder, main: 'index.html', form: { want: title, template: 'page' } });
    const works = [work('c1760000000000', 'Other work', other), work('c1760000000001', 'Moved work', was)];
    writeFileSync(join(home.data, 'memory.json'), JSON.stringify({ commissions: works, stuckNotes: [], greeted: works[1].id, shop: { done: 2, told: [], grown: [], met: [] } }));
    writeFileSync(join(home.data, 'settings.json'), JSON.stringify(onboarded(lang)));
    const shop = await launch({ lang, home, debug: true });
    const saved = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.find((c) => c.id === works[1].id);
    try {
      await shop.page.locator('.toolbar button.tool-btn').nth(2).click();
      await shop.page.waitForSelector('.shelf-card');
      const row = shop.page.locator('.shelf-card li.work', { hasText: 'Moved work' });
      await row.locator('.work-actions button').first().click();
      await row.locator('.work-note button').waitFor();
      for (const [folder, what] of [[other, 'the other work\'s folder'], [inner, 'a folder inside the other work'], [holder, 'a folder holding the other work']]) {
        await shop.pickFiles([folder]);
        await row.locator('.work-note button').click();
        await sleep(400);
        check((await row.locator('.work-note').innerText()).includes(W.relinkTaken), `${what} was not refused`);
        check(saved().folder === was, `${what} was taken`);
      }
      await shop.shot(join(out, 'moved-other.png'));
      await shop.pickFiles([own]);
      await row.locator('.work-note button').click();
      await sleep(400);
      check(saved().folder === own, 'a folder of its own was not taken');
    } finally {
      await shop.close();
    }
  },

  /** Forgetting everything while a commission runs would be written straight back: it waits. */
  async forgetbusy(lang, out) {
    const N = locale(lang).ui.notebook;
    const work = { id: 'c1760000000000', title: 'A page', date: '2025-10-09', result: 'done', choices: {}, folder: 'C:/nowhere', form: { want: 'x', template: 'demo' } };
    const home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify({ commissions: [work], stuckNotes: [], greeted: work.id, shop: { done: 1, told: [], grown: [], met: [] } }) });
    const shop = await launch({ lang, home, debug: true, speed: 1500 });
    try {
      await shop.order({ template: 'page', want: 'Another page' });
      await shop.submit();
      await sleep(1000);
      await shop.page.evaluate(() => window.lamplightDebug.ui.showNotebook(window.lamplight));
      await shop.page.waitForSelector('.notebook');
      await shop.page.locator('.notebook button', { hasText: N.forget }).click();
      await shop.page.locator('.notebook button', { hasText: N.forgetYes }).click();
      await sleep(500);
      check((await shop.page.locator('.notebook').innerText()).includes(N.forgetBusy), 'the shop does not say why it did not forget');
      const kept = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
      check(kept.commissions.length === 1, 'it forgot while a commission was running');
      await shop.shot(join(out, 'forgetbusy.png'));
    } finally {
      await shop.close();
    }
  },

  /** Every control and every card has a name for a screen reader: tools/sim/names.mjs. */
  async names(lang, out) {
    const run = spawnSync(process.execPath, [join(ROOT, 'tools', 'sim', 'names.mjs'), '--lang', lang, '--out', out], { encoding: 'utf8' });
    check(run.status === 0, `nameless:\n${run.stdout.split('\n').filter((l) => l.startsWith('NONE')).join('\n')}${run.stderr}`);
    console.log(`  ${run.stdout.trim().split('\n').at(-1)}`);
  },

  /** Fourteen months and more runs than the ledger used to keep: each month and the sum are right. */
  async ledger(lang, out) {
    const month = (i) => `20${25 + Math.floor((i + 9) / 12)}-${String((i + 9) % 12 + 1).padStart(2, '0')}`;
    const spend = Array.from({ length: 14 * 50 }, (_, i) => ({ key: `C:/w/${i}|s`, usd: 0.1, month: month(Math.floor(i / 50)) }));
    const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang), 'spend.json': JSON.stringify(spend) }), debug: true, size: 'small' });
    try {
      await sleep(1500);
      await shop.openSettings('work');
      await shop.page.locator('.spend-months summary').click();
      await shop.page.waitForSelector('.spend-book tr');
      await sleep(200);
      const rows = await shop.page.locator('.spend-book tr').allInnerTexts();
      check(rows.length === 15, `${rows.length} rows in the ledger`);
      check(rows.slice(0, 14).every((r) => r.includes('$5.00') && r.includes('50')), `a month reads wrong: ${rows[0]}`);
      check(rows[14].includes('$70.00'), `the sum reads ${rows[14]}`);
      // Closed and opened again: read afresh, no rows twice.
      await shop.page.locator('.spend-months summary').click();
      await shop.page.locator('.spend-months summary').click();
      await sleep(300);
      check(await shop.page.locator('.spend-book tr').count() === 15, 'opening the ledger again repeats its rows');
      await shop.page.locator('.spend-months').scrollIntoViewIfNeeded();
      const spills = await shop.page.locator('.card.settings').evaluate((c) => c.scrollWidth > c.clientWidth + 1);
      check(!spills, 'the ledger pushes the settings sideways');
      await shop.shot(join(out, 'ledger.png'));
    } finally {
      await shop.close();
    }
    const empty = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), debug: true, size: 'small' });
    try {
      await sleep(1500);
      await empty.openSettings('work');
      await empty.page.locator('.spend-months summary').click();
      await sleep(300);
      check(await empty.page.locator('.spend-book tr').count() === 1, 'an empty ledger has rows');
    } finally {
      await empty.close();
    }
  },

  /** A shop that has made a thousand things: still opens quickly, and anything on the shelf can be found. */
  async thousand(lang, out) {
    const S = locale(lang).ui.shelf;
    const N = locale(lang).ui.notebook;
    const kinds = ['page', 'research', 'edit', 'tidy', 'letter', 'sheet', 'plan', 'album', 'resume', 'notes', 'travel', 'tool'];
    const needle = lang === 'en' ? 'Needle in the haystack' : '草堆里的针';
    const day = (i) => Date.UTC(2024, 0, 1) + i * 86_400_000;
    const commissions = Array.from({ length: 1000 }, (_, i) => ({
      id: `c${day(i)}`, title: i === 500 ? needle : `${lang === 'en' ? 'Work' : '作品'} ${i + 1}`, date: new Date(day(i)).toISOString().slice(0, 10),
      result: 'done', choices: { Q: 'answer', R: 'another answer' }, asks: i % 7 ? [] : [{ ask: 'a bit warmer', date: '2024-01-01' }], folder: `C:/nowhere/${i}`, costUsd: 0.12,
      form: { want: `Make something for round ${i}`, template: kinds[i % kinds.length] },
    }));
    const memory = { commissions, stuckNotes: [], greeted: 'c1', shop: { done: 1000, told: [], grown: [], met: [] } };
    const home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory) });
    const times = { memoryKb: Math.round(statSync(join(home.data, 'memory.json')).size / 1024) };

    const began = Date.now();
    let shop = await launch({ lang, home, size: 'small', debug: true });
    times.launch = Date.now() - began;
    const { page } = shop;
    const painted = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const timed = async (name, act) => {
      const t = Date.now();
      await act();
      await painted();
      times[name] = Date.now() - t;
    };
    const works = () => page.locator('.shelf-card li.work').count();
    const openShelf = async () => {
      await page.locator('.toolbar button.tool-btn').nth(2).click();
      await page.waitForSelector('.shelf-card');
    };
    /** From the press to the card on screen, timed in the page so that the script's own clicking does not count. */
    const opening = (button, card) => page.evaluate(async ([button, card]) => {
      const t = performance.now();
      document.querySelectorAll('.toolbar button.tool-btn')[button].click();
      while (!document.querySelector(card)) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.round(performance.now() - t);
    }, [button, card]);
    try {
      await sleep(2500);
      times.shelf = await opening(2, '.shelf-card');
      check(await page.evaluate(() => document.activeElement?.classList.contains('shelf-search')), 'the shelf does not open ready to search');
      check(await works() === 40, `the shelf draws ${await works()} works at first`);
      await shop.shot(join(out, 'thousand-shelf.png'));

      await timed('search', () => page.keyboard.type(needle));
      check(await works() === 1, `searching finds ${await works()} works`);
      check((await page.locator('.shelf-card li.work').innerText()).includes(needle), 'searching finds the wrong work');
      await page.keyboard.press('Enter');
      check(await page.evaluate(() => !!document.activeElement?.closest('li.work')), 'Enter in the search box does not go to the first result');
      await page.locator('.shelf-search').focus();
      await page.keyboard.press('Escape');
      check(await page.locator('.shelf-card').count() === 1, 'Esc with words in the box closes the whole shelf');
      check(await page.locator('.shelf-search').inputValue() === '', 'Esc does not clear the words');
      check(await works() === 40, 'clearing the words does not bring the shelf back');
      // Still choosing a character: the list stays as it is until the word is settled.
      await page.evaluate(() => {
        const box = document.querySelector('.shelf-search');
        box.value = 'zzzz';
        box.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true }));
      });
      check(await works() === 40, 'the list redraws while a word is still being composed');
      await page.evaluate(() => document.querySelector('.shelf-search').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
      check(await works() === 0, 'the list does not follow when the word is settled');
      await page.locator('.shelf-search').fill('');
      await page.locator('.shelf-search').fill(new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2024, 2, 1)));
      check(await works() === 31, `the month as written finds ${await works()} works`);
      await page.locator('.shelf-search').fill('');
      await page.locator('.shelf-search').fill('Make something for round 5 zzz');
      check(await page.locator('.works-none').innerText() === S.noMatch, 'finding nothing says nothing');
      await shop.shot(join(out, 'thousand-none.png'));
      await page.locator('.shelf-search').fill('');

      await page.locator('.kind-chip', { hasText: S.kinds.album }).click();
      check((await page.locator('.works-count').innerText()) === S.found.replace('{n}', String(commissions.filter((c) => c.form.template === 'album').length)), 'the album chip counts wrong');
      check(await page.locator('.kind-chip[aria-pressed=true]').count() === 1, 'more than one chip is pressed');
      await page.locator('.works-more button').click();
      check(await works() === 80, `the next page holds ${await works()} works`);
      const moved = await page.evaluate(() => document.activeElement?.closest('li.work') === document.querySelectorAll('li.work')[40]);
      check(moved, 'the keyboard does not land on the first of the new works');
      const spills = await page.locator('.shelf-card').evaluate((c) => c.scrollWidth > c.clientWidth + 1);
      check(!spills, 'the chips push the shelf sideways');
      await shop.shot(join(out, 'thousand-album.png'));
      await page.keyboard.press('Escape');
      await sleep(300);

      times.notebook = await opening(3, '.notebook');
      const entries = () => page.locator('.notebook-pages section:not(.notebook-days) > ul > li:not(.notebook-more)').count();
      check(await entries() === 20, `the notebook draws ${await entries()} commissions at first`);
      await page.locator('.notebook-more button').click();
      check(await entries() === 40, `the next page holds ${await entries()} commissions`);
      const landed = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.notebook-pages section:not(.notebook-days) > ul > li')];
        return rows.indexOf(document.activeElement?.closest('li'));
      });
      check(landed === 20, `after showing more, the keyboard is on row ${landed} instead of the first new one`);
      await shop.shot(join(out, 'thousand-notebook.png'));
      await page.keyboard.press('Escape');
      await sleep(300);

      // One more: the whole notebook is saved again, and it should still feel like nothing.
      await timed('oneMore', async () => {
        await shop.order({ template: 'demo' });
        await shop.submit();
        check((await shop.workUntilDone()).ok, 'the thousand and first commission did not finish');
      });
      await page.keyboard.press('Escape');
      await sleep(300);
      await openShelf();
      const top = await page.locator('.shelf-card li.work').first().innerText();
      check(top.includes(locale(lang).ui.templates.demo.split(/[:：]/).at(-1).trim()), `the newest is not first: ${top}`);
    } finally {
      await shop.close();
    }

    const again = Date.now();
    shop = await launch({ lang, home, size: 'small', debug: true });
    times.relaunch = Date.now() - again;
    await shop.close();
    const bare = Date.now();
    shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), size: 'small', debug: true });
    times.launchEmpty = Date.now() - bare;
    await shop.close();
    const saved = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    check(saved.commissions.length === 1001, `${saved.commissions.length} commissions kept`);
    console.log(`  thousand ${lang} ${JSON.stringify(times)}`);
    writeFileSync(join(out, `thousand-${lang}.json`), JSON.stringify(times, null, 2));
    check(times.shelf < 1000, `the shelf took ${times.shelf} ms to open`);
    check(times.notebook < 1000, `the notebook took ${times.notebook} ms to open`);
    check(times.search < 1000, `typing a search took ${times.search} ms`);
  },

  /** The lines said once in a shop's life: heard whole, one at a time, and not while nobody can hear them. */
  async grownline(lang, out) {
    const L = locale(lang);
    const painting = lang === 'en' ? ["There's a little painting on the wall.", 'Bought it the day we finished the first job.'] : ['墙上挂了幅小画。', '第一单做完那天买的。'];
    const sprout = lang === 'en' ? ["There's a sprout in the beds out back.", 'Planted the day the first job was done.'] : ['后院菜地冒芽了。', '第一单做完那天种的。'];
    const ripe = lang === 'en' ? 'First vegetable out back is ripe.' : '后院第一棵菜熟了。';
    const seed = (done) => ({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify({ commissions: [], stuckNotes: [], greeted: 'c1', shop: { done, told: [], grown: [], met: [] } }) });
    const finishOne = async (shop) => {
      await sleep(2000);
      // Everything said from now on, as it appears over people's heads.
      await shop.page.evaluate(() => {
        window.heard = [];
        setInterval(() => {
          const now = document.getElementById('labels').innerText;
          if (window.heard.at(-1) !== now) window.heard.push(now);
        }, 200);
      });
      await shop.order({ template: 'demo' });
      await shop.submit();
      check((await shop.workUntilDone()).ok, 'the commission did not finish');
    };
    const heard = (shop, words) => shop.page.evaluate((words) => window.heard.some((h) => h.includes(words)), words);
    const hearUntil = async (shop, words, ms) => {
      for (const start = Date.now(); Date.now() - start < ms; await sleep(500)) if (await heard(shop, words)) return true;
      return false;
    };

    // The first work brings two such lines. Adeng is out when the first falls due, and the result card is open before that.
    let shop = await launch({ lang, home: freshHome(seed(0)), debug: true, speed: 100 });
    try {
      await finishOne(shop);
      await sleep(12_000);
      check(!(await heard(shop, painting[0])), 'a line that comes once was said while the result card was open');
      await shop.page.evaluate(() => {
        const scene = window.lamplightDebug.scene;
        const real = scene.anchorOf.bind(scene);
        scene.anchorOf = (who) => (window.adengOut && who === 'adeng' ? null : real(who));
        window.adengOut = true;
      });
      await shop.page.keyboard.press('Escape');
      await sleep(5000);
      check(!(await heard(shop, painting[0])), 'the line was said with the speaker out');
      await shop.page.evaluate(() => { window.adengOut = false; });
      check(await hearUntil(shop, painting[0], 8000), 'the line about what grew was never said');
      check(await hearUntil(shop, painting[1], 15_000), 'the line about what grew was cut short');
      check(await hearUntil(shop, sprout[0], 15_000), 'the line about the beds was never said');
      check(await hearUntil(shop, sprout[1], 15_000), 'the line about the beds was cut short');
      await shop.shot(join(out, 'grownline.png'));
    } finally {
      await shop.close();
    }

    // Out in the back garden nobody hears what is said indoors: it waits until they come back.
    shop = await launch({ lang, home: freshHome(seed(3)), debug: true, speed: 100 });
    try {
      await finishOne(shop);
      await shop.page.keyboard.press('Escape');
      await sleep(300);
      await shop.hotspot(L.ui.access.hotspotGarden);
      await sleep(14_000);
      check(await shop.page.evaluate(() => window.lamplightDebug.scene.view === 'garden'), 'never got to the garden');
      check(!(await heard(shop, ripe)), 'the line about the beds was said indoors with nobody in to hear it');
      await shop.hotspot(L.ui.access.hotspotShop);
      check(await hearUntil(shop, ripe, 20_000), 'the line about the beds was lost to the garden');
    } finally {
      await shop.close();
    }

    // Everything forgotten: nobody then mentions what has gone.
    shop = await launch({ lang, home: freshHome(seed(0)), debug: true, speed: 100 });
    try {
      await finishOne(shop);
      const { title } = JSON.parse(readFileSync(join(shop.home.data, 'memory.json'), 'utf8')).commissions[0];
      await shop.page.locator('.toolbar button.tool-btn').nth(3).click();
      await shop.page.waitForSelector('.notebook');
      await shop.page.locator('.notebook .actions button').click();
      await shop.page.locator('.notebook .actions button', { hasText: L.ui.notebook.forgetYes }).click();
      await shop.page.waitForSelector('.notebook-empty');
      await shop.page.keyboard.press('Enter');
      await sleep(16_000);
      check(!(await heard(shop, painting[0])), 'the painting was mentioned after everything was forgotten');
      // And it is really gone from the disk: what was asked for, in any file the shop wrote.
      const written = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? written(join(dir, e.name)) : [join(dir, e.name)]));
      const left = written(shop.home.data).filter((f) => /\.(json|jsonl|log)$/.test(f) && readFileSync(f, 'utf8').includes(title));
      check(left.length === 0, `still holding the title after forgetting: ${left.join(', ')}`);
    } finally {
      await shop.close();
    }
  },

  /**
   * A hundred works on (road-to-1.1.md A9): nothing drops off the shelf or the notebook, the shop's days read right, and
   * every piece the shop gathers is out, in the cafe and in the study.
   */
  async days(lang, out) {
    const N = locale(lang).ui.notebook;
    const day = (i) => Date.UTC(2026, 0, 1 + i);
    const title = (i) => (i === 99 ? 'A very long name '.repeat(20).trim() : `work ${i + 1}`);
    const commissions = Array.from({ length: 100 }, (_, i) => ({
      id: `c${day(i)}`, title: title(i), date: new Date(day(i)).toISOString().slice(0, 10), result: 'done', choices: {}, folder: 'C:/nowhere', form: { want: 'x', template: 'page' },
    }));
    const grown = COUNTED_PIECES.map(([id, at]) => ({ id, date: new Date(day(at - 1)).toISOString().slice(0, 10) }));
    const memory = { commissions, stuckNotes: [], greeted: 'c1', shop: { done: 100, told: [], grown, met: [{ id: 'baker', date: '2026-01-03' }] } };
    const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory) }), size: 'small', debug: true });
    const notebook = async () => {
      await shop.page.locator('.toolbar button.tool-btn').nth(3).click();
      await shop.page.waitForSelector('.notebook');
      await sleep(300);
    };
    try {
      await sleep(2500);
      await shop.page.locator('.toolbar button.tool-btn').nth(2).click();
      await shop.page.waitForSelector('.shelf-card');
      // The shelf shows forty at a time; the rest come with "more".
      while (await shop.page.locator('.shelf-card li.works-more button').count()) await shop.page.locator('.shelf-card li.works-more button').click();
      const shelved = await shop.page.locator('.shelf-card ul.works > li.work').count();
      check(shelved === 100, `${shelved} of 100 works on the shelf`);
      await shop.page.keyboard.press('Escape');
      await sleep(300);

      await notebook();
      const days = await shop.page.locator('.notebook-days').innerText();
      for (const line of [
        N.firstWork.replace('{title}', 'work 1'), N.nthWork.replace('{n}', '10').replace('{title}', 'work 10'), N.nthWork.replace('{n}', '25').replace('{title}', 'work 25'),
        N.nthWork.replace('{n}', '50').replace('{title}', 'work 50'),
        N.bedRipe, N.bedFull, N.metLine.replace('{name}', locale(lang).guests.baker),
        ...COUNTED_PIECES.filter(([, at]) => at > 50).map(([id]) => N.grewLine.replace('{item}', locale(lang).growth[id])),
      ]) check(days.includes(line), `not in the shop's days: ${line}`);
      check(await shop.page.locator('.notebook-pages').evaluate((p) => p.scrollTop) === 0, 'the notebook opens scrolled past the shop\'s days');
      const spills = await shop.page.locator('.notebook-pages').evaluate((p) => p.scrollWidth > p.clientWidth + 1);
      check(!spills, 'a long name pushes the notebook sideways');
      await shop.shot(join(out, 'days.png'));
      await shop.page.keyboard.press('Escape');
      await sleep(300);
      const missing = await shop.page.evaluate((ids) => ids.filter((id) => !window.lamplightDebug.scene.growth.shows(id)), COUNTED_PIECES.map(([id]) => id));
      check(missing.length === 0, `not out in the shop at a hundred: ${missing}`);

      // Someone new comes in: the page says so next time.
      await shop.page.evaluate('void window.lamplightDebug.scene.guestVisit("postman", [])');
      await shop.page.waitForFunction(() => window.lamplightDebug.scene.guest, null, { timeout: 12_000 });
      await sleep(500);
      await notebook();
      check((await shop.page.locator('.notebook-days').innerText()).includes(N.metLine.replace('{name}', locale(lang).guests.postman)), 'the postman is not in the days');
      // Keep and Forget take away the button that was pressed: the keyboard must not fall out of the card.
      const focused = () => shop.page.evaluate(() => document.activeElement?.textContent ?? '');
      await shop.page.locator('.notebook .actions button').click();
      check(await focused() === N.keep, 'asking to forget does not put the focus on Keep');
      await shop.shot(join(out, 'forget.png'));
      await shop.page.keyboard.press('Enter');
      check(await focused() === N.forget, 'Keep leaves the keyboard nowhere');
      await shop.page.keyboard.press('Enter');
      await shop.page.locator('.notebook .actions button', { hasText: N.forgetYes }).click();
      await shop.page.waitForSelector('.notebook-empty');
      check(await focused() === '\u2713', 'Forget leaves the keyboard nowhere');
      await shop.page.keyboard.press('Enter');
      await shop.page.waitForSelector('.notebook', { state: 'detached', timeout: 3000 });
    } finally {
      await shop.close();
    }

    // A shop that has made nothing has no such page.
    const fresh = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }) });
    try {
      await sleep(2500);
      await fresh.page.locator('.toolbar button.tool-btn').nth(3).click();
      await fresh.page.waitForSelector('.notebook');
      check(await fresh.page.locator('.notebook-days').count() === 0, 'an empty shop has days');
    } finally {
      await fresh.close();
    }

    // The shop at a hundred, in both rooms, by daylight and with nothing up for a festival.
    for (const scene of ['cafe', 'study']) {
      const full = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang, { scene }), 'memory.json': JSON.stringify(memory) }), size: 'large', debug: true });
      try {
        await full.page.waitForFunction(() => window.lamplightDebug?.scene?.growth?.shows('plaque'));
        await full.page.evaluate(() => {
          const { scene } = window.lamplightDebug;
          scene.setWeather('clear', null, false);
          scene.setPeriod('day', true);
        });
        await sleep(600);
        await full.shot(join(out, `days-100-${scene}.png`));
      } finally {
        await full.close();
      }
    }
  },

  /**
   * The vegetable beds come up with the works finished, say so three times, and a round of changes does not count. Once
   * full they follow the season (road-to-1.1.md A9), all the way to a hundred works.
   */
  async beds(lang, out) {
    const seed = (done) => ({
      'settings.json': onboarded(lang),
      'memory.json': JSON.stringify({ commissions: [], stuckNotes: [], shop: { done, told: [], grown: [] } }),
    });
    // Works done, season -> beds by stage. Before they are full the season makes no difference.
    const expected = [
      [0, 'autumn', {}], [1, 'winter', { sprout: 1 }], [4, 'spring', { ripe: 1, sprout: 1 }], [12, 'autumn', { ripe: 3, sprout: 1 }],
      [25, 'summer', { ripe: 8 }], [60, 'spring', { young: 8 }], [100, 'summer', { ripe: 8 }], [100, 'autumn', { harvest: 8 }], [100, 'winter', { rest: 8 }],
    ];
    const WORDS = { ripe: 'bedsRipe', sprout: 'bedsSprout', young: 'bedsYoung', harvest: 'bedsHarvest', rest: 'bedsRest' };
    for (const [done, season, stages] of expected) {
      const shop = await launch({ lang, home: freshHome(seed(done)), size: 'large', debug: true });
      try {
        await sleep(2500);
        await shop.page.evaluate((season) => {
          const { scene } = window.lamplightDebug;
          scene.setWeather('clear', null, false);
          scene.setSeason(season);
          scene.setPeriod('day', true);
        }, season);
        const beds = await shop.page.evaluate(() => window.lamplightDebug.scene.garden.beds);
        const seen = Object.fromEntries(Object.keys(WORDS).map((k) => [k, beds.filter((b) => b === k).length]).filter(([, n]) => n));
        check(JSON.stringify(seen) === JSON.stringify(stages), `${done} works in ${season}: ${JSON.stringify(seen)} instead of ${JSON.stringify(stages)}`);
        await shop.hotspot(shop.L.ui.access.hotspotGarden);
        await sleep(900);
        await shop.hotspot(shop.L.ui.access.hotspotBeds);
        await sleep(200);
        const A = shop.L.ui.access;
        const says = Object.entries(stages).map(([stage, n]) => A[WORDS[stage]].replace('{n}', n)).join(A.bedsAnd);
        const label = done === 0 ? A.bedsBare : `${A.hotspotBeds}${A.bedsSay}${says}`;
        check((await shop.page.locator('body').innerText()).includes(label), `${done} works: no "${label}" over the beds`);
        await shop.page.screenshot({ path: join(out, `beds-${done}-${season}.png`) });
        // Opening the shop again is not news: nobody brings the beds up.
        if (done === 12) {
          await shop.hotspot(shop.L.ui.access.hotspotShop);
          await sleep(13_000);
          await shop.page.locator('.toolbar button.tool-btn').nth(4).click();
          await shop.page.waitForSelector('.caption-card');
          const log = await shop.page.locator('.caption-card').innerText();
          check(!log.includes(lang === 'en' ? 'First vegetable' : '第一棵菜熟了'), 'the beds were news again on opening the shop');
        }
      } finally {
        await shop.close();
      }
    }

    // The fourth work: the first plant is ripe, and Laoshi says so.
    const home = freshHome(seed(3));
    const shop = await launch({ lang, home, speed: 100, debug: true });
    try {
      await sleep(2500);
      check((await runOne(shop, { template: 'letter', want: W[lang].letter }, { answers: demoAnswers })).ok, 'the fourth work did not finish');
      await shop.page.keyboard.press('Escape');
      const beds = await shop.page.evaluate(() => window.lamplightDebug.scene.garden.beds);
      check(beds[0] === 'ripe', `after the fourth work the first bed is ${beds[0]}`);
      const words = lang === 'en' ? 'First vegetable' : '第一棵菜熟了';
      await shop.page.waitForFunction((words) => document.body.innerText.includes(words), words, { timeout: 45_000 });
    } finally {
      await shop.close();
    }
  },

  /** Neighbours and Xiaoju are seen through the windows on their way to and from the door, in both scenes. */
  async passers(lang, out) {
    for (const sceneName of ['cafe', 'study']) {
      const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang, { scene: sceneName }) }), debug: true, size: 'large' });
      const { page } = shop;
      const shape = () => page.evaluate(() => {
        const s = window.lamplightDebug.scene.children.list.find((o) => o.depth === 0.55);
        return s ? { x: s.x, tinted: s.isTinted, masked: Boolean(s.mask) } : null;
      });
      const visit = () => page.evaluate('void window.lamplightDebug.scene.guestVisit("baker", [])');
      const guest = () => page.evaluate(() => Boolean(window.lamplightDebug.scene.guest));
      try {
        await sleep(2500);
        // Coming in: along the wall from the far end, nobody in the shop until they reach the door.
        await visit();
        await sleep(600);
        const a = await shape();
        check(a?.tinted && a.masked, `${sceneName}: nobody behind the glass: ${JSON.stringify(a)}`);
        check(!(await guest()), `${sceneName}: the neighbour is indoors before reaching the door`);
        const shots = [];
        for (const at of [24, 62, 208]) {
          await page.waitForFunction((at) => {
            const s = window.lamplightDebug.scene.children.list.find((o) => o.depth === 0.55);
            return !s || s.x >= at;
          }, at, { timeout: 8000 });
          shots.push(await shop.shot(join(out, `passers-${sceneName}-${at}.png`)));
        }
        await page.waitForFunction(() => window.lamplightDebug.scene.guest, null, { timeout: 8000 });
        check(!(await shape()), `${sceneName}: still behind the glass once indoors`);
        await page.waitForFunction(() => !window.lamplightDebug.scene.guest, null, { timeout: 30000 });
        // Going out: back along the wall.
        await sleep(300);
        const b = await shape();
        check(b && b.x < 296, `${sceneName}: nobody walking away: ${JSON.stringify(b)}`);
        await page.waitForFunction(() => !window.lamplightDebug.scene.children.list.some((o) => o.depth === 0.55), null, { timeout: 8000 });

        // A commission comes in while they are on the way: they walk on by.
        await visit();
        await sleep(400);
        await page.evaluate(() => { window.lamplightDebug.scene.sendGuestAway(); });
        await page.waitForFunction(() => !window.lamplightDebug.scene.children.list.some((o) => o.depth === 0.55), null, { timeout: 8000 });
        await sleep(600);
        check(!(await guest()), `${sceneName}: came in although a commission started`);

        // Less motion: no one goes by, and the door still works.
        await page.evaluate(() => window.lamplightDebug.scene.setReducedMotion(true));
        await visit();
        await sleep(300);
        check(!(await shape()), `${sceneName}: walking past with less motion asked for`);
        await page.waitForFunction(() => window.lamplightDebug.scene.guest, null, { timeout: 8000 });
      } finally {
        await shop.close();
      }
    }
  },

  /** A whole commission without touching the mouse: every stop shows where the focus is, and cards keep it inside. */
  async keyboard(lang, out) {
    const shop = await launch({ lang, home: freshHome(), speed: 250, size: 'small', debug: true });
    const { page, L } = shop;
    const faults = [];
    const here = () => page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const typing = e.matches('input, textarea');
      return {
        name: e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 24) || e.className,
        shows: typing || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none',
        inView: r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight,
        inCard: Boolean(e.closest('.card, .dialog, .serious, .backdrop, .welcome, .settings')),
      };
    });
    const tab = async () => {
      await page.keyboard.press('Tab');
      await sleep(60);
      const f = await here();
      if (f && !f.shows) faults.push(`no focus ring on "${f.name}"`);
      if (f && !f.inView) faults.push(`focus off screen on "${f.name}"`);
      return f;
    };
    /** Tab until the focus is on something by this name; how many presses it took is part of the result. */
    const tabTo = async (name, most = 60) => {
      for (let i = 1; i <= most; i++) {
        if ((await tab())?.name === name) return i;
      }
      throw new Error(`Tab never reached "${name}"`);
    };
    const tabToButton = async (selector, most = 40) => {
      for (let i = 1; i <= most; i++) {
        await tab();
        if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return i;
      }
      throw new Error(`Tab never reached ${selector}`);
    };
    const staysInside = async (what, presses = 25) => {
      for (let i = 0; i < presses; i++) {
        const f = await tab();
        if (!f?.inCard) {
          faults.push(`${what}: Tab left the card, to "${f?.name ?? 'nothing'}"`);
          return;
        }
      }
    };
    try {
      // The welcome.
      await shop.maybe('.welcome input[type=text]', 8000);
      await page.keyboard.type(lang === 'en' ? 'Sam' : '小林');
      await staysInside('welcome');
      for (let i = 0; i < 3; i++) {
        await tabToButton('.welcome .actions button.default');
        await page.keyboard.press('Enter');
        await sleep(400);
      }
      await sleep(1500);

      // The commission slip.
      await tabTo(L.ui.toolbar.order);
      await page.keyboard.press('Enter');
      await page.waitForSelector('form.commission');
      await sleep(300);
      check(await page.evaluate(() => document.activeElement?.matches('form.commission textarea, form.commission input')), 'the slip does not start in a field');
      await page.keyboard.type(W[lang].letter);
      await staysInside('slip');
      await tabToButton('form.commission button.default');
      await shop.shot(join(out, 'keyboard-slip.png'));
      await page.keyboard.press('Enter');
      await sleep(1500);

      // While it runs: the progress card opens and gives the focus back.
      await tabTo(L.ui.toolbar.progress);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.running-card');
      await staysInside('progress', 12);
      await shop.shot(join(out, 'keyboard-progress.png'));
      await page.keyboard.press('Escape');
      await sleep(300);
      const back = await here();
      if (back?.name !== L.ui.toolbar.progress) faults.push(`closing the progress card left the focus on "${back?.name ?? 'nothing'}"`);

      const r = await shop.workUntilDone();
      check(r.ok, 'the commission did not finish on Enter alone');
      await staysInside('result', 12);
      await shop.shot(join(out, 'keyboard-result.png'));
      await page.keyboard.press('Escape');
      await sleep(400);

      // A long summary scrolls by itself, and the browser makes that a stop too: the buttons after it stay in reach.
      await page.evaluate((summary) => window.lamplightDebug.ui.showResult({ ok: true, workDir: 'C:/w', files: ['C:/w/page.html'], main: 'C:/w/page.html', costUsd: 0.42, summary, id: 'c1015', round: 2, canRestore: true }), 'long summary line. '.repeat(120));
      await sleep(300);
      await tabToButton('.result-card .result-report', 12);
      await tabToButton('.result-card .actions button.default', 12);
      await page.keyboard.press('Escape');
      await sleep(300);

      // The shelf and the notebook.
      await tabTo(L.ui.shelf.title);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.shelf-card');
      await staysInside('shelf', 8);
      await page.keyboard.press('Escape');
      await tabTo(L.ui.notebook.title);
      await page.keyboard.press('Enter');
      await sleep(400);
      await staysInside('notebook', 8);
      await page.keyboard.press('Escape');

      // Out to the garden through the back door and back in.
      await tabTo(L.ui.access.hotspotGarden);
      await page.keyboard.press('Enter');
      await sleep(900);
      check(await page.evaluate(() => window.lamplightDebug.scene.view) === 'garden', 'Enter on the back door did not go to the garden');
      await tabTo(L.ui.access.hotspotShop);
      await page.keyboard.press('Enter');
      await sleep(900);
      check(await page.evaluate(() => window.lamplightDebug.scene.view) === 'shop', 'Enter on the door did not come back');

      // Settings, every tab.
      await tabTo(L.ui.toolbar.settings);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.settings .tabs');
      await staysInside('settings', 30);
      await shop.shot(join(out, 'keyboard-settings.png'));

      // The legal sheet lies over settings: Tab stays on the sheet.
      await page.evaluate(() => window.lamplightDebug.ui.showLegal('terms'));
      await page.waitForSelector('#legal');
      for (let i = 0; i < 6; i++) {
        await tab();
        if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('#legal'))))) {
          faults.push('legal sheet: Tab left the sheet');
          break;
        }
      }
      await page.keyboard.press('Escape');
      await sleep(200);
      await page.keyboard.press('Escape');
    } finally {
      await shop.close();
    }
    check(!faults.length, [...new Set(faults)].join('; '));
  },

  /** The computer loses power, a process dies, a folder disappears: the shop opens again and nothing delivered is lost. */
  async crash(lang, out) {
    const open = async (home, opts = {}) => {
      const shop = await launch({ lang, home, speed: 120, ...opts });
      await sleep(2500);
      return shop;
    };
    const start = async (shop) => {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      await sleep(5000);
      return pendingRounds(shop.home)[0].workDir;
    };
    const pull = async (shop) => {
      // The app's own process: what Playwright started may be only a wrapper around it.
      process.kill(await shop.app.evaluate(() => process.pid), 'SIGKILL');
      await sleep(3000);
    };
    const finished = (home) => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.filter((c) => c.result === 'done');

    // The plug is pulled halfway through: the shop offers to carry on, and it counts as one work.
    let home = freshHome({ 'settings.json': onboarded(lang) });
    const log = join(home.home, 'stand-in.log');
    let shop = await open(home, { speed: 600, simEnv: { SIM_LOG: log } });
    const workDir = await start(shop);
    await pull(shop);
    const size = statSync(log).size;
    await sleep(5000);
    check(statSync(log).size === size, 'the stand-in kept working after the app died');
    shop = await open(home);
    const resume = await shop.maybe('.pending-card button.default', 8000);
    check(resume, 'pulled plug: the unfinished commission was not offered');
    await shop.shot(join(out, 'crash-pending.png'));
    await resume.click();
    check((await shop.workUntilDone({ answers: demoAnswers })).ok, 'pulled plug: it did not finish when carried on');
    await shop.page.keyboard.press('Escape');
    await sleep(1000);
    check(finished(home).length === 1, `pulled plug: ${finished(home).length} works counted`);
    check(readdirSync(workDir).length > 0, 'pulled plug: nothing in the commission folder');

    // Pulled with the result still on the table: the work is safe, and nothing is left to carry on.
    check((await runOne(shop, { template: 'letter', want: W[lang].letter }, { answers: demoAnswers })).ok, 'second commission');
    await pull(shop);
    shop = await open(home);
    check(!(await shop.maybe('.pending-card', 3000)), 'finished work: offered to carry on');
    check(finished(home).length === 2, `finished work: ${finished(home).length} works counted`);
    await shop.close();

    // Half-written files from a write that never finished are ignored.
    for (const name of ['settings.json', 'memory.json', 'pending.json', 'spend.json']) writeFileSync(join(home.data, `${name}.tmp`), '{"half');
    shop = await open(home, { speed: 600 });
    check(finished(home).length === 2, 'half-written files: works lost');
    check(!(await shop.maybe('.pending-card', 2000)), 'half-written files: offered to carry on');

    // The commission's folder is emptied while it runs (Windows will not delete a folder in use): the shop says
    // something and takes the next one.
    let gone = await start(shop);
    for (const name of readdirSync(gone)) rmSync(join(gone, name), { recursive: true, force: true });
    const during = await shop.workUntilDone({ answers: demoAnswers, timeout: 90_000 });
    check(!during.timeout, 'folder emptied: the shop never said anything');
    await shop.shot(join(out, 'crash-folder-gone.png'));
    await shop.page.keyboard.press('Escape');
    await sleep(800);
    check(await shop.page.locator('button.hotspot').count() > 0, 'folder emptied: the shop is gone');
    await shop.close();

    // Deleted while the shop is closed, then carried on.
    home = freshHome({ 'settings.json': onboarded(lang) });
    shop = await open(home, { speed: 600 });
    gone = await start(shop);
    await pull(shop);
    // Windows keeps the folder locked until the stand-in has seen the pipe close and gone.
    rmSync(gone, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
    shop = await open(home);
    const again = await shop.maybe('.pending-card button.default', 8000);
    check(again, 'folder gone: the unfinished commission was not offered');
    await again.click();
    const after = await shop.workUntilDone({ answers: demoAnswers, timeout: 90_000 });
    check(!after.timeout, 'folder gone: carrying on never ended');
    await shop.shot(join(out, 'crash-carried-on-gone.png'));
    await shop.close();

    // Claude Code itself falls over: a plain card, and the shop stays open.
    shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), speed: 300, scenario: 'crash' });
    await sleep(2500);
    await shop.order({ template: 'page', want: W[lang].page });
    await shop.submit();
    const fell = await shop.workUntilDone({ answers: demoAnswers, timeout: 60_000 });
    await shop.shot(join(out, 'crash-standin.png'));
    check(fell.stopped?.title === shop.L.ui.run.failedTitle, `Claude Code fell over: ${JSON.stringify(fell).slice(0, 200)}`);
    // What it did manage is one click away, and the plan is still up in case it carries on.
    check(await shop.page.locator('#ui > .card button', { hasText: shop.L.ui.run.seeSoFar }).count() === 1, 'nothing leads to what was done so far');
    check(await shop.page.locator('#board').evaluate((b) => b.childElementCount) > 0, 'the plan went while the card still offers to carry on');
    // Put away, the card takes the plan off the blackboard with it: nothing is going on any more.
    await shop.page.keyboard.press('Escape');
    await sleep(300);
    check(await shop.page.locator('#board').evaluate((b) => b.childElementCount) === 0, 'the blackboard still shows the plan of a commission that stopped');
    await shop.close();

    // Another card takes its place: that puts it away too.
    shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), speed: 300, scenario: 'crash' });
    await sleep(2500);
    await shop.order({ template: 'page', want: W[lang].page });
    await shop.submit();
    check((await shop.workUntilDone({ answers: demoAnswers, timeout: 60_000 })).stopped, 'no card when it fell over');
    await shop.hotspot(shop.L.ui.access.hotspotCounter);
    await sleep(400);
    check(await shop.page.locator('#board').evaluate((b) => b.childElementCount) === 0, 'the blackboard kept the plan when another card replaced the stop card');
    await shop.close();

    // Called off: the plan goes from the blackboard, no card about it.
    shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), speed: 800 });
    await sleep(2500);
    await shop.order({ template: 'page', want: W[lang].page });
    await shop.submit();
    await sleep(6000);
    check(await shop.page.locator('#board').evaluate((b) => b.childElementCount) > 0, 'no plan on the blackboard to call off');
    // Called off from the running card, asked twice (B5: by its run id, which the card knows).
    await shop.hotspot(shop.L.ui.access.hotspotCounter);
    await shop.page.locator('.running-card .progress-cancel').click();
    await shop.page.locator('.running-card .progress-cancel').click();
    await sleep(2500);
    check(await shop.page.locator('#board').evaluate((b) => b.childElementCount) === 0, 'the blackboard kept the plan of a commission called off');
    await shop.close();

    // Carried on from the card: it finishes, and the notebook has one entry for it.
    const stopped = freshHome({ 'settings.json': onboarded(lang) });
    shop = await launch({ lang, home: stopped, speed: 300, scenario: 'crash' });
    await sleep(2500);
    await shop.order({ template: 'page', want: W[lang].page });
    await shop.submit();
    check((await shop.workUntilDone({ answers: demoAnswers, timeout: 60_000 })).stopped, 'no card when it fell over');
    await shop.retry();
    check((await shop.workUntilDone({ answers: demoAnswers, timeout: 90_000 })).ok, 'carrying on did not finish');
    const entries = JSON.parse(readFileSync(join(stopped.data, 'memory.json'), 'utf8')).commissions;
    check(entries.length === 1 && entries[0].result === 'done', `the notebook has ${entries.map((c) => c.result)} for one commission`);
    await shop.close();
  },

  /** Everything fixed in the shop answers: a name on hover, a key to reach it, and a word or a light, for nothing. */
  async objects(lang, out) {
    for (const scene of ['cafe', 'study']) {
      const home = freshHome({ 'settings.json': onboarded(lang, { scene, budgetUsd: 5 }) });
      const shop = await launch({ lang, home, size: 'medium', speed: Math.max(SPEED, 1500) });
      try {
        await sleep(1500);
        const O = shop.L.ui.objects;
        // Press until the answer shows: a line the shop was about to say anyway can take the bubble first.
        const ask = async (name, lines) => {
          for (let i = 0; i < 5; i++) {
            await shop.hotspot(name);
            const shown = await shop.page.waitForFunction((lines) => lines.some((l) => document.body.innerText.includes(l)), lines, { timeout: 1500 }).then(() => true, () => false);
            if (shown) return;
          }
          await shop.shot(join(out, 'objects-stuck.png'));
          throw new Error(`nobody said ${lines[0]}`);
        };
        await ask(O.names.clock, [O.clock.split('{')[0]]);
        await ask(O.names.frontdoor, Object.values(O.door));
        await ask(O.names.window, [O.window.split('{')[0]]);
        for (const [name, lines] of [['table', O.table], ['workbench', O.workbench], ['plant', O.plant], ['cup', O.cup], ['shelf', O.shelf]]) {
          await ask(O.names[name], lines);
        }
        await shop.shot(join(out, `objects-${scene}-idle.png`));
        const lamp = () => shop.page.evaluate(() => window.lamplightDebug.scene.floorLamp.base);
        const before = await lamp();
        await shop.hotspot(O.names.lamp);
        check((await lamp()) !== before, `${scene}: the lamp did not switch`);
        await shop.hotspot(O.names.lamp);
        check((await lamp()) === before, `${scene}: the lamp did not switch back`);
        // A name on hover, where the mouse is.
        const named = await shop.page.evaluate(async (name) => {
          const { scene } = window.lamplightDebug;
          scene.highlight('clock');
          await new Promise((r) => setTimeout(r, 200));
          const seen = document.body.innerText.includes(name);
          scene.highlight(null);
          return seen;
        }, O.names.clock);
        check(named, `${scene}: no name for the clock`);
        // At work: the clock opens the running card, the table says nothing was handed in.
        await shop.order({ template: 'page', want: W[lang].page });
        await shop.submit();
        await shop.page.waitForFunction(() => document.querySelectorAll('.board .step').length >= 3);
        await sleep(2500);
        await ask(O.names.table, [O.tableNothing]);
        await shop.hotspot(O.names.clock);
        await shop.page.locator('.running-card').waitFor();
        await shop.page.keyboard.press('Escape');
        await shop.shot(join(out, `objects-${scene}-busy.png`));
      } finally { await shop.close(); }
    }
  },

  /** Furniture stands in the room: someone behind the table is hidden by it, someone in front is not. */
  async behind(lang, out) {
    for (const scene of ['cafe', 'study']) {
      const home = freshHome({ 'settings.json': onboarded(lang, { scene }) });
      const shop = await launch({ lang, home, size: 'medium' });
      try {
        await sleep(1500);
        const placed = await shop.page.evaluate(() => {
          const { scene } = window.lamplightDebug;
          const adeng = scene.actors.get('adeng');
          const qingdai = scene.actors.get('qingdai');
          scene.tweens.killTweensOf(adeng.sprite);
          scene.tweens.killTweensOf(qingdai.sprite);
          adeng.sprite.setPosition(150, 82).setDepth(82);
          qingdai.sprite.setPosition(232, 74).setDepth(74);
          const pieces = scene.children.list.filter((o) => o.texture?.key === 'pieces');
          return pieces.map((p) => ({ name: p.frame.name, depth: p.depth }));
        });
        check(placed.length === 11, `${scene}: ${placed.length} pieces in the room`);
        check(placed.find((p) => p.name === 'table').depth > 82, `${scene}: the table is not in front of someone behind it`);
        await sleep(300);
        await shop.shot(join(out, `behind-${scene}.png`));
        // A meeting: all four sit down at the table, wherever they come from.
        await shop.page.evaluate(() => {
          const { scene } = window.lamplightDebug;
          return Promise.all(['adeng', 'xiaoju', 'laoshi', 'qingdai'].map((a) => scene.walkTo(a, 'table')));
        });
        await sleep(400);
        await shop.shot(join(out, `behind-${scene}-seated.png`));
        // What lies on the furniture stays on top of it.
        for (const holiday of ['christmas', 'halloween']) {
          await shop.page.evaluate((holiday) => {
            const { scene } = window.lamplightDebug;
            scene.growth.setGrown(['painting', 'plant', 'lights', 'fruit', 'guitar', 'bonsai', 'easel', 'trophy']);
            scene.setWeather('clear', holiday, false);
          }, holiday);
          await sleep(300);
          await shop.shot(join(out, `behind-${scene}-${holiday}.png`));
        }
      } finally { await shop.close(); }
    }
  },

  /**
   * Every season and every festival in a shop past a hundred works (road-to-1.1.md A9; the street and the shops along it,
   * road-to-1.4.md D6, in seasonsOnTheStreet): the season's vase on the big
   * table and the beds out back, each festival's decorations, and what the baker brings up for each of them.
   */
  async seasons(lang, out) {
    const memory = { commissions: [], stuckNotes: [], greeted: 'c1', shop: { done: 100, told: [], grown: COUNTED_PIECES.map(([id]) => ({ id, date: '2026-10-20' })) } };
    const says = lang === 'en'
      ? { spring: 'green rice cakes', summer: 'plum juice', autumn: 'beds out back', winter: 'sweet potatoes', lantern: 'dumplings', dragon_boat: 'Zongzi', mid_autumn: 'Mooncakes' }
      : { spring: '青团', summer: '酸梅汤', autumn: '后院的菜', winter: '红薯', lantern: '汤圆', dragon_boat: '粽子', mid_autumn: '月饼' };
    const bakerSays = async (shop, words, what) => {
      await shop.page.evaluate(() => window.lamplightDebug.scene.sendGuestAway());
      await shop.page.waitForFunction(() => !window.lamplightDebug.scene.hasGuest());
      await shop.page.evaluate(() => window.lamplightDebug.welcome('baker'));
      const said = await shop.page.waitForFunction((words) => window.lamplightDebug.scene.guest?.speech?.includes(words), words, { timeout: 15_000 }).then(() => true, () => false);
      check(said, `the baker said nothing about ${what}`);
    };
    for (const scene of ['cafe', 'study']) {
      const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang, { scene }), 'memory.json': JSON.stringify(memory) }), size: 'large', debug: true });
      try {
        await shop.page.waitForFunction(() => window.lamplightDebug?.scene?.growth?.shows('plaque'));
        await sleep(1500);
        for (const season of ['spring', 'summer', 'autumn', 'winter']) {
          await shop.page.evaluate((season) => {
            const { scene } = window.lamplightDebug;
            scene.setWeather('clear', null, false);
            scene.setSeason(season);
            scene.setPeriod('day', true);
          }, season);
          if (scene === 'cafe') await bakerSays(shop, says[season], season);
          await sleep(400);
          await shop.shot(join(out, `seasons-${scene}-${season}.png`));
          if (scene !== 'cafe') continue;
          await shop.hotspot(shop.L.ui.access.hotspotGarden);
          await sleep(1200);
          await shop.shot(join(out, `seasons-garden-${season}.png`));
          await shop.hotspot(shop.L.ui.access.hotspotShop);
          await sleep(1200);
        }
        // The old festivals in the cafe; the three lunar ones (Q-A5) in both rooms.
        const festivals = scene === 'cafe' ? ['halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn'] : ['lantern', 'dragon_boat', 'mid_autumn'];
        for (const holiday of festivals) {
          await shop.page.evaluate((holiday) => window.lamplightDebug.scene.setWeather('clear', holiday, false), holiday);
          if (says[holiday]) await bakerSays(shop, says[holiday], holiday);
          await sleep(400);
          await shop.shot(join(out, `seasons-${scene}-${holiday}.png`));
        }
        if (scene === 'cafe') await seasonsOnTheStreet(shop, out);
      } finally {
        await shop.close();
      }
    }
  },

  /** Thirty commissions on: the shop has come to look like what was made in it, and the neighbours ask about it. */
  async history(lang, out) {
    const common = ['painting', 'plant', 'lights', 'fruit', 'guitar', 'bonsai', 'easel', 'trophy', 'portrait'];
    const shops = [
      { name: 'albums', scene: 'cafe', kinds: ['album', 'plan'], has: ['album', 'calendar'], lacks: ['books', 'letters', 'ledger', 'monitor'] },
      { name: 'reports', scene: 'cafe', kinds: ['research', 'letter', 'sheet', 'page'], has: ['books', 'letters', 'ledger', 'monitor'], lacks: ['album', 'calendar'] },
      { name: 'reports', scene: 'study', kinds: ['research', 'letter', 'sheet', 'page'], has: ['books', 'letters', 'ledger', 'monitor'], lacks: ['album', 'calendar'] },
      { name: 'odd-jobs', scene: 'cafe', kinds: ['resume', 'notes', 'travel', 'tool'], has: ['briefcase', 'readinglamp', 'postcards', 'toolbox'], lacks: ['album', 'calendar', 'books', 'letters', 'ledger', 'monitor'] },
    ];
    for (const { name, scene, kinds, has, lacks } of shops) {
      const title = kinds[0] === 'album' ? W[lang].page.slice(0, 4) : 'Q3';
      const commissions = Array.from({ length: 20 }, (_, i) => ({
        id: `c${1000 + i}`, title: i === 19 ? title : `w${i}`, date: '2026-10-20', result: 'done', choices: {}, folder: 'C:/nowhere',
        form: { want: 'x', template: kinds[i % kinds.length] },
      }));
      const memory = {
        commissions, stuckNotes: [], greeted: 'c1019',
        shop: { done: 30, told: [], grown: [...common, ...has].map((id) => ({ id, date: '2026-10-20' })) },
      };
      const home = freshHome({ 'settings.json': onboarded(lang, { scene }), 'memory.json': JSON.stringify(memory) });
      const shop = await launch({ lang, home, size: 'large' });
      try {
        await shop.page.waitForFunction(() => window.lamplightDebug?.scene?.growth?.shows('painting'));
        const shows = (ids) => shop.page.evaluate((ids) => ids.filter((id) => window.lamplightDebug.scene.growth.shows(id)), ids);
        check((await shows(has)).length === has.length, `${name}: missing from the shop: ${has} / ${await shows(has)}`);
        check((await shows(lacks)).length === 0, `${name}: should not be in the shop: ${await shows(lacks)}`);
        await shop.page.evaluate(() => window.lamplightDebug.scene.setWeather('clear', null, false));
        await sleep(600);
        await shop.shot(join(out, `history-${scene}-${name}.png`));
        // A piece says where it came from.
        const O = shop.L.ui.objects;
        let told = false;
        for (let i = 0; i < 6 && !told; i++) {
          await shop.hotspot(O.grown[has[0]]);
          told = await shop.page.waitForFunction(([by, line]) => window.lamplightDebug.scene.isSaying(by, line), ['adeng', O.grownMade[has[0]]], { timeout: 2500 }).then(() => true, () => false);
        }
        check(told, `${name}: the ${has[0]} says nothing`);
        // A neighbour asks after the latest work, by name.
        let asked = false;
        for (let i = 0; i < 6 && !asked; i++) {
          const guest = i % 2 ? 'postman' : 'baker';
          await shop.page.evaluate(() => window.lamplightDebug.scene.sendGuestAway());
          await shop.page.waitForFunction(() => !window.lamplightDebug.scene.hasGuest());
          await shop.page.evaluate((guest) => window.lamplightDebug.welcome(guest), guest);
          asked = await shop.page.waitForFunction((title) => window.lamplightDebug.scene.guest?.speech?.includes(title), title, { timeout: 15000 }).then(() => true, () => false);
          if (asked) await shop.shot(join(out, `history-${scene}-${name}-asks.png`));
        }
        check(asked, `${name}: no neighbour asked after "${title}"`);
        // Whoever the work has brought drops in, with something to say.
        for (const guest of name === 'albums' ? ['granny'] : ['mechanic', 'student']) {
          await shop.page.evaluate(() => window.lamplightDebug.scene.sendGuestAway());
          await shop.page.waitForFunction(() => !window.lamplightDebug.scene.hasGuest());
          await shop.page.evaluate((guest) => window.lamplightDebug.welcome(guest), guest);
          await shop.page.waitForFunction((guest) => {
            const g = window.lamplightDebug.scene.guest;
            return g?.id === guest && g.speech;
          }, guest, { timeout: 15000 });
          await shop.shot(join(out, `history-${scene}-${guest}.png`));
        }
      } finally { await shop.close(); }
    }
  },

  /** Staff with something in hand, turning to whoever talks, and a cat that really walks. */
  async hands(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, size: 'large' });
    try {
      const read = (id) => shop.page.evaluate((id) => {
        const a = window.lamplightDebug.scene.actors.get(id);
        return { x: a.sprite.x, y: a.sprite.y, facing: a.facing, moving: !!a.tween?.isPlaying(), anim: a.sprite.anims.getName(), flip: a.sprite.flipX,
          prop: a.prop ? { key: a.prop.texture.key, x: a.prop.x, y: a.prop.y, visible: a.prop.visible } : null };
      }, id);
      await shop.page.evaluate(() => {
        const { scene } = window.lamplightDebug;
        return Promise.all([scene.walkTo('adeng', 'table'), scene.walkTo('laoshi', 'corner'), scene.walkTo('qingdai', 'board')]);
      });
      await shop.page.evaluate(() => {
        const { scene } = window.lamplightDebug;
        scene.play('adeng', 'sit', 'pencil');
        scene.play('laoshi', 'lift', 'hammer');
        scene.play('qingdai', 'idle', 'cup');
      });
      await sleep(400);
      for (const [id, key] of [['adeng', 'prop-pencil'], ['laoshi', 'prop-hammer'], ['qingdai', 'prop-cup']]) {
        const a = await read(id);
        check(a.prop?.key.startsWith(key) && a.prop.visible, `${id} holds nothing: ${JSON.stringify(a.prop)}`);
        check(Math.abs(a.prop.x - a.x) <= 16 && a.y - a.prop.y >= 4 && a.y - a.prop.y <= 24, `${id}: the ${key} is not at the hand: ${JSON.stringify(a)}`);
      }
      await shop.shot(join(out, 'hands-props.png'));
      // Off with the thing in hand, on the way somewhere else.
      await shop.page.evaluate(() => window.lamplightDebug.scene.walkTo('adeng', 'counter'));
      check((await read('adeng')).prop === null, 'the pencil walked off with Adeng');
      // Whoever listens turns to whoever talks.
      await shop.page.evaluate(() => Promise.all(['laoshi', 'qingdai'].map((a) => window.lamplightDebug.scene.walkTo(a, 'shelf'))));
      await shop.page.evaluate(() => {
        const { scene } = window.lamplightDebug;
        scene.play('laoshi', 'idle');
        scene.lookAt('laoshi', 'adeng');
      });
      const [laoshi, adeng] = [await read('laoshi'), await read('adeng')];
      const expected = Math.abs(adeng.x - laoshi.x) >= Math.abs(adeng.y - laoshi.y)
        ? (adeng.x > laoshi.x ? 'right' : 'left') : (adeng.y > laoshi.y ? 'down' : 'up');
      check(laoshi.facing === expected, `Laoshi faces ${laoshi.facing}, Adeng is ${expected}`);
      // The cat gets up and walks, both ways, and lies down again.
      for (const anchor of ['counter', 'window']) {
        const walking = shop.page.evaluate((anchor) => window.lamplightDebug.scene.walkTo('cat', anchor), anchor);
        await sleep(350);
        const cat = await read('cat');
        check(cat.anim === 'cat-walk', `the cat is not walking to the ${anchor}: ${cat.anim}`);
        check(cat.flip === (cat.facing === 'left'), `the cat walks backwards: ${JSON.stringify(cat)}`);
        await shop.shot(join(out, `hands-cat-${anchor}.png`));
        await walking;
        const lying = await read('cat');
        check(lying.anim === 'cat-lie' && !lying.flip, `the cat did not lie down at the ${anchor}: ${JSON.stringify(lying)}`);
      }
    } finally { await shop.close(); }
  },

  /** The card for work under way: from the counter and the blackboard, a word in the middle, and calling it off. */
  async progress(lang, out) {
    for (const size of ['small', 'large', 'medium']) {
      const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 5 }) });
      const shop = await launch({ lang, home, size, speed: Math.max(SPEED, 1500) });
      try {
        // The smallest window also gets a long request: the title must not push the buttons off the card.
        await shop.order({ template: 'page', want: size === 'small' ? W[lang].page.repeat(8) : W[lang].page });
        await shop.submit();
        await shop.page.waitForFunction(() => document.querySelectorAll('.board .step').length >= 3);
        await sleep(2500);
        const A = shop.L.ui.access;
        const card = shop.page.locator('.running-card');
        await shop.hotspot(A.hotspotCounter);
        await card.waitFor();
        const seen = await card.evaluate((c) => {
          const box = c.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: innerWidth, height: innerHeight, text: c.innerText,
            steps: c.querySelectorAll('.plan-list li').length, staff: c.querySelectorAll('.progress-staff button').length };
        });
        check(seen.top >= 0 && seen.left >= 0 && seen.bottom <= seen.height && seen.right <= seen.width, `${size}: the card does not fit: ${JSON.stringify(seen)}`);
        check(seen.text.includes('$5.00'), `${size}: no limit on the card: ${JSON.stringify(seen.text)}`);
        check(seen.steps >= 3, `${size}: only ${seen.steps} steps on the card`);
        check(seen.staff === 4, `${size}: ${seen.staff} of the staff on the card`);
        await shop.shot(join(out, `progress-${size}.png`));
        if (size !== 'medium') continue;
        await shop.page.keyboard.press('Escape');
        await shop.hotspot(A.hotspotBoard);
        await card.waitFor();
        await card.locator('.progress-meet').click();
        await shop.page.waitForSelector('form.meeting');
        await shop.page.keyboard.press('Escape');
        await sleep(600);
        await shop.hotspot(A.hotspotCounter);
        await card.locator('.progress-cancel').click();
        await shop.shot(join(out, 'progress-confirm.png'));
        await card.locator('.progress-cancel').click();
        await shop.page.waitForFunction((label) => [...document.querySelectorAll('button.hotspot')].every((b) => b.getAttribute('aria-label') !== label || b.hidden), A.hotspotBell);
        check(await shop.page.locator('.running-card').count() === 0, 'the card stayed open after calling it off');
        await shop.hotspot(A.hotspotCounter);
        await shop.page.waitForSelector('form.commission');
      } finally { await shop.close(); }
    }
  },

  /** The fixed demo: research, a failing check, a colour question, the serious delete ("not now"), review. */
  async demo(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      const r = await runOne(shop, { template: 'demo' }, { answers: demoAnswers });
      check(r.ok, `did not finish: ${JSON.stringify(r)}`);
      check(r.seen.some((c) => c.serious), 'no serious card for the delete');
      const dir = latestCommission(home);
      check(existsSync(join(dir, 'draft-1.html')), 'drafts were deleted although the user said not now');
      check(/data-ledger-version="1"/.test(readFileSync(join(dir, 'index.html'), 'utf8')), 'check fix missing');
      await shop.shot(join(out, 'demo-result.png'));
    } finally { await shop.close(); }
  },

  /** The real plan on the blackboard: a long to-do list, "N more", the plan card, the corner window line. */
  async board(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: Math.max(SPEED, 900) });
    try {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      let boardText = '';
      let planCard = false;
      const r = await shop.workUntilDone({ onTick: async (ms) => {
        if (!boardText && ms > 6000) {
          boardText = await shop.page.evaluate(() => document.getElementById('board')?.innerText ?? '');
          const cut = await shop.page.evaluate(() => [...document.querySelectorAll('#board .step')].every((s) => getComputedStyle(s).textOverflow === 'ellipsis'));
          check(cut, 'a long line on the blackboard is cut without an ellipsis');
          await shop.shot(join(out, 'board.png'));
          await shop.hotspot(shop.L.ui.access.hotspotBoard);
          planCard = await shop.page.locator('.plan-card').isVisible();
          await shop.shot(join(out, 'plan-card.png'));
          await shop.page.keyboard.press('Escape');
        }
      } });
      check(r.ok, 'did not finish');
      check(planCard, 'the blackboard did not open the plan card');
      const more = shop.L.ui.board?.more ?? '';
      check(boardText.split('\n').filter(Boolean).length >= 3, `blackboard had no plan: ${JSON.stringify(boardText)}`);
      void more;
    } finally { await shop.close(); }
  },

  /** Handing over files: copies in the materials folder, originals untouched, the agent reads them. */
  /**
   * Connections (road-to-1.3.md C4), with the test connection only a development build has: its authorisation card from
   * the notebook ("not now" is the default), connected, ticked on a slip (none is ticked to begin with), read once by the
   * staff without a card, then disconnected. The secret it was made with, which the stand-in repeats out loud and in its
   * call, is nowhere in the log or the recordings.
   */
  async connect(lang, out) {
    const SECRET = `nook-test-secret-${Date.now().toString(36)}-must-not-be-kept`;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, testSecret: SECRET, simEnv: { SIM_ECHO_SECRET: SECRET } });
    const { page, L } = shop;
    const K = L.ui.connections;
    const saved = () => JSON.parse(readFileSync(join(home.data, 'connections.json'), 'utf8')).connections;
    const openNotebook = async () => {
      await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
      await page.waitForSelector('.notebook .notebook-connections');
      await sleep(400);
    };
    const slipLists = async () => {
      await shop.order({});
      await sleep(500);
      const n = await page.locator('form.commission .connection-row:not([hidden]) input[type=checkbox]').count();
      await page.keyboard.press('Escape');
      await sleep(300);
      return n;
    };
    try {
      check(await slipLists() === 0, 'the slip lists connections before there are any');
      await openNotebook();
      check((await page.locator('.notebook-connections').innerText()).includes(K.none), 'the connections page does not say there are none');
      await page.locator('.notebook-connections .connection-add[data-kind="test"]').click();
      await page.waitForSelector('.grant-card');
      await sleep(400);
      const card = await page.locator('.grant-card').innerText();
      for (const part of [K.reads, K.does, K.never, K.howDisconnect, K.connect, K.notNow]) check(card.includes(part), `the authorisation card has no "${part}"`);
      check((await page.locator('.grant-card button.default').innerText()).trim() === K.notNow, 'the card does not default to "not now"');
      await shop.shot(join(out, 'connect-grant.png'));
      // Enter does what the default does: nothing is connected.
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notebook .notebook-connections');
      await sleep(400);
      check(!existsSync(join(home.data, 'connections.json')), '"not now" made a connection');

      // On the smallest window, connected this time.
      await shop.resize([640, 360]);
      await page.locator('.notebook-connections .connection-add[data-kind="test"]').click();
      await page.waitForSelector('.grant-card');
      await sleep(400);
      await shop.shot(join(out, 'connect-grant-small.png'));
      await page.locator('.grant-card .grant-connect').click();
      await page.waitForSelector('.notebook .connection');
      await sleep(500);
      await shop.shot(join(out, 'connect-page-small.png'));
      await shop.resize('medium');
      await page.locator('.notebook .connection-grant summary').click();
      await sleep(400);
      await shop.shot(join(out, 'connect-page.png'));
      const made = saved();
      check(made.length === 1 && made[0].kind === 'test' && made[0].hasSecret && /^k\d+$/.test(made[0].id), `connections.json: ${JSON.stringify(made)}`);
      check(existsSync(join(home.data, 'connections.bin')), 'the secret was not kept in connections.bin');
      for (const f of ['connections.json', 'connections.bin']) check(!readFileSync(join(home.data, f)).toString('utf8').includes(SECRET), `${f} holds the secret as written`);
      await page.keyboard.press('Escape');
      await sleep(300);

      // The slip lists it, unticked; ticked, the staff read it once, with no card to answer.
      await shop.order({ want: W[lang].page });
      const tick = page.locator('form.commission .connection-row input[type=checkbox]');
      await tick.first().waitFor({ state: 'visible', timeout: 5000 });
      check(await tick.count() === 1, `the slip lists ${await tick.count()} connections`);
      check(!(await tick.first().isChecked()), 'the connection is ticked before the user ticks it');
      check((await page.locator('form.commission .connection-row').innerText()).includes(K.slipLine), 'the slip does not say what may be used');
      await tick.first().check();
      await shop.shot(join(out, 'connect-slip.png'));
      await shop.resize([640, 360]);
      await page.locator('form.commission .connection-row').scrollIntoViewIfNeeded();
      await shop.shot(join(out, 'connect-slip-small.png'));
      await shop.resize('medium');
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      check(!r.seen.length, `reading a ticked connection asked: ${r.seen.map((c) => c.text).join(' | ')}`);
      const dir = latestCommission(home);
      const file = join(dir, lang === 'zh-CN' ? '连接里读到的.txt' : 'from-connection.txt');
      check(existsSync(file) && readFileSync(file, 'utf8').includes('Test note'), 'the note did not come through the connection');
      const memo = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.at(-1);
      check(memo.form?.connections?.[0] === made[0].id, 'the commission did not keep its connection for later rounds');
      check(Boolean(saved()[0].lastUsed), 'the connection does not say when it was last used');
      await page.keyboard.press('Escape');
      await sleep(1500);

      // Disconnected: secret and settings gone, and the slip lists nothing again.
      await openNotebook();
      await page.locator('.notebook .connection-disconnect').click();
      await sleep(300);
      check(await page.locator('.notebook .connection-keep.default').count() === 1, 'disconnecting is not asked first');
      await page.locator('.notebook .connection-disconnect-yes').click();
      await page.waitForFunction(() => !document.querySelector('.notebook .connection'), null, { timeout: 5000 });
      check(saved().length === 0, 'the connection is still in connections.json');
      check(!existsSync(join(home.data, 'connections.bin')), 'its secret is still in connections.bin');
      await page.keyboard.press('Escape');
      await sleep(300);
      check(await slipLists() === 0, 'the slip still lists a connection that is gone');
    } finally { await shop.close(); }
    // Said out loud and passed in a call: the log and the recordings keep none of it, and the call is in them.
    const recDir = join(home.data, 'recordings');
    const recorded = readdirSync(recDir).map((f) => readFileSync(join(recDir, f), 'utf8')).join('\n');
    check(!logLines(home).join('\n').includes(SECRET) && !recorded.includes(SECRET), 'the secret is in the log or a recording');
    check(recorded.includes('[redacted]'), 'the stand-in never repeated the secret, so nothing was looked for');
    check(/mcp__nook-k\d+__read_note/.test(recorded), 'the recording has no call of the connection\'s tool');
  },

  /**
   * A synced folder (C5): its card, then the folder picked; a commission reads the Word file in it and saves a copy of its
   * summary back, declined once and allowed once; the notebook undoes the copy. The user's files are untouched.
   */
  async folderlink(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const root = join(home.home, 'OneDrive');
    mkdirSync(join(root, 'Docs'), { recursive: true });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'office', 'sample.docx'), join(root, 'Docs', 'report.docx'));
    writeFileSync(join(root, 'notes.md'), 'Tea on Friday.\n');
    writeFileSync(join(root, 'api-key.txt'), 'sk-not-for-the-staff');
    const before = filesIn(root);
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CONNECTION_PLAY: 'folderlink' } });
    const { page, L } = shop;
    const K = L.ui.connections.kinds.folder;
    const lines = () => readFileSync(join(home.data, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    try {
      await connectKind(shop, 'folder', { folder: root, shot: async () => {
        check((await page.locator('.grant-card').innerText()).includes(K.pickHint), 'the card does not say a folder is picked next');
        await shop.shot(join(out, 'folder-grant.png'));
        await shop.resize([640, 360]);
        await sleep(400);
        await shop.shot(join(out, 'folder-grant-small.png'));
        await shop.resize('medium');
      } });
      const made = JSON.parse(readFileSync(join(home.data, 'connections.json'), 'utf8')).connections;
      check(made.length === 1 && made[0].kind === 'folder' && made[0].config.path === root && made[0].config.saveTo === K.saveTo, `connections.json: ${JSON.stringify(made)}`);
      check((await page.locator('.notebook .connection').innerText()).includes('OneDrive'), 'the connections page does not name the folder');
      await shop.shot(join(out, 'folder-page.png'));
      await page.keyboard.press('Escape');
      await sleep(300);
      await orderWithConnection(shop, W[lang].notes);
      let cards = 0;
      const r = await shop.workUntilDone({ answers: () => (cards++ === 0 ? null : 1) });
      check(r.ok, 'did not finish');
      check(r.seen.length === 2 && r.seen.every((c) => c.serious && c.text.includes(K.saveCopyUndo)), `the saves were not asked on the serious card: ${r.seen.map((c) => c.text).join(' | ')}`);
      const summary = lang === 'zh-CN' ? '摘要.md' : 'summary.md';
      check(existsSync(join(latestCommission(home), summary)), 'the Word file was not read into a summary');
      const saved = join(root, K.saveTo, summary);
      check(existsSync(saved) && readdirSync(join(root, K.saveTo)).length === 1, `the copy is not alone in "${K.saveTo}": ${existsSync(join(root, K.saveTo)) ? readdirSync(join(root, K.saveTo)) : 'no folder'}`);
      const [declined, done, ...more] = lines().filter((l) => l.tool === 'save_copy');
      check(!more.length && declined.decision === 'denied' && done.decision === 'allowed' && done.undo?.path?.endsWith(join(K.saveTo, summary)), `actions.jsonl: ${JSON.stringify(lines())}`);
      check(lines().some((l) => l.tool === 'read' && l.decision === 'given'), 'reading through the connection was not written down');
      await page.keyboard.press('Escape');
      await sleep(1500);
      await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
      await page.waitForSelector('.notebook .notebook-actions');
      const section = page.locator('.notebook .notebook-actions');
      await section.scrollIntoViewIfNeeded();
      await section.locator('.action-undo').click();
      await page.waitForSelector('.notebook .notebook-actions .action-undone', { timeout: 5000 });
      await sleep(400);
      await shop.shot(join(out, 'folder-undone.png'));
      check(!existsSync(saved), 'the undo left the copy in the synced folder');
      check(JSON.stringify(filesIn(root)) === JSON.stringify(before), `the user's files changed: ${JSON.stringify(filesIn(root))}`);
    } finally { await shop.close(); }
    const recDir = join(home.data, 'recordings');
    const recorded = readdirSync(recDir).map((f) => readFileSync(join(recDir, f), 'utf8')).join('\n');
    check(!recorded.includes('sk-not-for-the-staff'), 'a file named like a key reached the staff');
  },

  /**
   * A read-only calendar (C5): its secret address is typed on the card and served by a little local server. The staff
   * read a week of it without a card; the address is nowhere in the log, the recordings, the data folder as written, or
   * on the page.
   */
  async calendar(lang, out) {
    const token = `private-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const title = lang === 'zh-CN' ? '看牙医' : 'Dentist';
    const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:a', `DTSTART:${day(1)}T100000`, `DTEND:${day(1)}T110000`, `SUMMARY:${title}`, 'LOCATION:Main St 1', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:b', `DTSTART;VALUE=DATE:${day(3)}`, `DTEND;VALUE=DATE:${day(4)}`, 'SUMMARY:Holiday', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    let asked = 0;
    const server = createServer((req, res) => {
      asked++;
      if (req.url !== `/${token}/basic.ics`) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8' }).end(ics);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const address = `http://127.0.0.1:${server.address().port}/${token}/basic.ics`;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CONNECTION_PLAY: 'calendar' } });
    const { page, L } = shop;
    const K = L.ui.connections;
    let pageText = '';
    try {
      // A web address that is not https is refused on the card's way in, and nothing is made.
      await connectKind(shop, 'calendar', { address: 'http://calendar.example.com/a.ics', keep: true });
      check((await page.locator('.notebook .connection-note').innerText()).includes(K.address), 'an http address was not refused with a reason');
      check(!existsSync(join(home.data, 'connections.json')), 'an http address made a connection');
      await page.keyboard.press('Escape');
      await sleep(300);
      await connectKind(shop, 'calendar', { address, shot: async () => {
        check((await page.locator('.grant-card').innerText()).includes(K.kinds.calendar.addressWarn), 'the card does not warn that the address is a secret');
        await shop.shot(join(out, 'calendar-grant.png'));
        await shop.resize([640, 360]);
        await sleep(400);
        await shop.shot(join(out, 'calendar-grant-small.png'));
        await shop.resize('medium');
      } });
      await page.locator('.notebook .connection-grant summary').click();
      await sleep(400);
      await shop.shot(join(out, 'calendar-page.png'));
      pageText += await page.evaluate(() => document.body.innerText);
      for (const f of ['connections.json', 'connections.bin']) check(!readFileSync(join(home.data, f)).toString('utf8').includes(token), `${f} holds the address as written`);
      await page.keyboard.press('Escape');
      await sleep(300);
      await orderWithConnection(shop, W[lang].plan);
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      check(!r.seen.length, `reading the calendar asked: ${r.seen.map((c) => c.text).join(' | ')}`);
      const plan = readFileSync(join(latestCommission(home), lang === 'zh-CN' ? '一周计划.md' : 'week-plan.md'), 'utf8');
      check(plan.includes(title) && plan.includes('10:00-11:00') && /all day Holiday/.test(plan), `the plan does not hold the week's events: ${plan}`);
      pageText += await page.evaluate(() => document.body.innerText);
      await shop.shot(join(out, 'calendar-result.png'));
    } finally {
      await shop.close();
      server.close();
    }
    check(asked >= 1, 'the calendar was never fetched');
    const recDir = join(home.data, 'recordings');
    const recorded = readdirSync(recDir).map((f) => readFileSync(join(recDir, f), 'utf8')).join('\n');
    check(!logLines(home).join('\n').includes(token), 'the calendar address is in the log');
    check(!recorded.includes(token), 'the calendar address is in a recording');
    check(!pageText.includes(token), 'the calendar address is on the page');
    check(/mcp__nook-k\d+__events/.test(recorded), 'the recording has no call of the calendar');
  },

  /**
   * Email drafts (C5): a letter with its draft ticked. The .eml is in the folder, the card's main button opens it in the
   * mail program (recorded, nothing opens), and nothing was sent anywhere.
   */
  async maildraft(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CONNECTION_PLAY: 'maildraft' } });
    const { page, L } = shop;
    try {
      await recordOpens(shop);
      await connectKind(shop, 'maildraft', { shot: () => shop.shot(join(out, 'maildraft-grant.png')) });
      await shop.shot(join(out, 'maildraft-page.png'));
      await page.keyboard.press('Escape');
      await sleep(300);
      await orderWithConnection(shop, W[lang].letter);
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      const eml = join(latestCommission(home), lang === 'zh-CN' ? '信.eml' : 'letter.eml');
      check(existsSync(eml) && /^X-Unsent: 1\r$/m.test(readFileSync(eml, 'utf8')), 'the draft is not in the folder, or not marked unsent');
      const open = page.locator('.result-card .actions button.default');
      check((await open.innerText()).trim() === L.ui.openInMail, `the card's button says "${await open.innerText()}"`);
      await sleep(400);
      await shop.shot(join(out, 'maildraft-result.png'));
      await open.click();
      await sleep(500);
      const o = await opened(shop);
      check(o.opened.at(-1) === eml, `the button did not open the draft: ${JSON.stringify(o)}`);
    } finally { await shop.close(); }
  },

  /**
   * The back room and the post (road-to-1.3.md C8). With a calendar, a synced folder and email drafts connected, one
   * commission reads the calendar (Axin brings it to the letter holder), makes a Word file at the table and puts it away
   * in the filing cabinet, saves a copy (Axin takes it), looks in the folder again (Axin has come twice, so Adeng goes to
   * the holder alone), and leaves a draft in the outbox. Each moment is shot in the cafe and the study, by day and by night.
   */
  async backroom(lang, out) {
    const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:a', `DTSTART:${day(1)}T100000`, `DTEND:${day(1)}T110000`, 'SUMMARY:Book club', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const server = createServer((req, res) => {
      if (req.url !== '/c8-token/basic.ics') { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8' }).end(ics);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const address = `http://127.0.0.1:${server.address().port}/c8-token/basic.ics`;
    try {
      for (const room of ['cafe', 'study']) {
        const home = freshHome({ 'settings.json': onboarded(lang, room === 'study' ? { scene: 'study' } : {}) });
        const root = join(home.home, 'OneDrive');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'notes.md'), 'Tea on Friday.\n');
        // Slower than the other scenarios, so each walk and visit is there to be seen.
        const shop = await launch({ lang, home, speed: 700, simEnv: { SIM_CONNECTION_PLAY: 'backroom' } });
        const { page } = shop;
        try {
          for (const [kind, opts] of [['calendar', { address }], ['folder', { folder: root }], ['maildraft', {}]]) {
            await connectKind(shop, kind, opts);
            await page.keyboard.press('Escape');
            await sleep(300);
          }
          // The light settles first: a change of light still under way would take back the night set for a picture.
          await sleep(4500);
          await shop.order({ want: W[lang].letter });
          const ticks = page.locator('form.commission .connection-row input[type=checkbox]');
          await ticks.first().waitFor({ state: 'visible', timeout: 5000 });
          for (const tick of await ticks.all()) await tick.check();
          await shop.submit();
          const look = () => page.evaluate(() => {
            const sc = window.lamplightDebug.scene;
            const lead = sc.actors.get('adeng');
            return {
              postman: sc.guest?.id === 'postman', // At the letter holder (guests.ts, POST_SPOT), done walking.
              postmanStill: sc.guest?.id === 'postman' && !sc.guest.tween?.isPlaying() && Math.abs(sc.guest.sprite.x - 314) <= 2 && Math.abs(sc.guest.sprite.y - 56) <= 2,
              at: sc.anchorOf('adeng'), settled: !lead.tween?.isPlaying(), letter: sc.letter.visible, envelope: sc.envelope.visible,
            };
          });
          const shoot = async (name) => {
            for (const period of ['day', 'night']) {
              await page.evaluate((p) => window.lamplightDebug.scene.setPeriod(p, true), period);
              await sleep(250);
              await shop.shot(join(out, `backroom-${room}-${period}-${name}.png`));
            }
            await page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
          };
          const shot = new Set();
          let visits = 0;
          let wasHere = false;
          let alone = false;
          const trail = [];
          const r = await shop.workUntilDone({ answers: () => 1, timeout: 300_000, onTick: async () => {
            const v = await look();
            if (trail.at(-1) !== v.at) trail.push(v.at);
            if (v.postman && !wasHere) visits++;
            wasHere = v.postman;
            const moment = v.postmanStill && visits === 1 ? 'deliver' : v.postmanStill && visits === 2 ? 'collect'
              : v.at === 'cabinet' && v.settled ? 'cabinet' : v.at === 'mailslot' && v.settled && !v.postman && visits === 2 ? 'alone'
                : v.envelope ? 'outbox' : null;
            if (moment === 'alone') alone = true;
            if (moment && !shot.has(moment)) {
              shot.add(moment);
              await shoot(moment);
            }
          } });
          check(r.ok, `did not finish in the ${room}`);
          check(visits === 2, `Axin came ${visits} times in the ${room}, not twice`);
          for (const m of ['deliver', 'cabinet', 'collect', 'outbox']) check(shot.has(m), `never saw "${m}" in the ${room}; Adeng went ${trail.join(' > ')}`);
          check(alone, `Adeng did not go to the letter holder alone after Axin's two visits in the ${room}`);
          check((await look()).envelope, `the draft is not in the outbox once the work is done in the ${room}`);
          check(existsSync(join(root, shop.L.ui.connections.kinds.folder.saveTo)), `the copy was not saved in the ${room}`);
        } finally { await shop.close(); }
      }
    } finally { server.close(); }
  },

  /**
   * An outside action (road-to-1.3.md C6): the stand-in saves a note through the test connection twice. The first card is
   * declined (it is the default), the second allowed; then the notebook's outside actions page undoes it. Three lines in
   * actions.jsonl: declined, done with its undo, the undo.
   */
  async outside(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CONNECTION_PLAY: 'outside' } });
    const { page, L } = shop;
    const T = L.ui.connections.kinds.test;
    const outsideDir = join(home.data, 'test-outside');
    const lines = () => readFileSync(join(home.data, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    try {
      await connectTest(shop);
      await orderWithConnection(shop, W[lang].page);
      let cards = 0;
      let shot = false;
      const r = await shop.workUntilDone({
        answers: () => (cards++ === 0 ? null : 1),
        onTick: async () => {
          if (shot || !(await page.locator('.backdrop .serious').isVisible().catch(() => false))) return;
          shot = true;
          await sleep(1200);
          await shop.shot(join(out, 'outside-card.png'));
          await shop.resize([640, 360]);
          await sleep(400);
          await shop.shot(join(out, 'outside-card-small.png'));
          await shop.resize('medium');
          await sleep(400);
        },
      });
      check(r.ok, 'did not finish');
      check(r.seen.length === 2, `${r.seen.length} cards, not 2: ${r.seen.map((c) => c.text).join(' | ')}`);
      for (const c of r.seen) {
        check(c.serious, 'the outside action was not asked on the serious card');
        check(c.text.includes(T.saveNote) && c.text.includes(T.saveNoteUndo), `the card does not say what is done and how it is undone: ${c.text}`);
        check(c.buttons.length === 2, `the card offers more than allow or not: ${c.buttons.join(' | ')}`);
      }
      check(readdirSync(outsideDir).length === 1, `the test folder holds ${readdirSync(outsideDir).length} notes, not 1`);
      const [declined, done] = lines();
      check(lines().length === 2, `actions.jsonl has ${lines().length} lines, not 2`);
      check(declined.tool === 'save_note' && declined.decision === 'denied' && !declined.ok, `first line: ${JSON.stringify(declined)}`);
      check(done.decision === 'allowed' && done.ok && done.undo?.path && !done.undo.done, `second line: ${JSON.stringify(done)}`);
      await page.keyboard.press('Escape');
      await sleep(1500);

      // The notebook's outside actions page: both lines, "Undo" on the one that was done.
      await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
      await page.waitForSelector('.notebook .notebook-actions');
      const section = page.locator('.notebook .notebook-actions');
      await section.scrollIntoViewIfNeeded();
      await sleep(400);
      check(await section.locator('li.action').count() === 2, 'the outside actions page does not list both lines');
      check(await section.locator('.action-undo').count() === 1, 'the page does not offer one undo');
      await shop.shot(join(out, 'outside-actions.png'));
      await shop.resize([640, 360]);
      await section.scrollIntoViewIfNeeded();
      await sleep(400);
      await shop.shot(join(out, 'outside-actions-small.png'));
      await shop.resize('medium');
      await section.locator('.action-undo').click();
      await page.waitForSelector('.notebook .notebook-actions .action-undone', { timeout: 5000 });
      await section.scrollIntoViewIfNeeded();
      await sleep(400);
      await shop.shot(join(out, 'outside-undone.png'));
      check(await section.locator('.action-undo').count() === 0, 'it can still be undone after the undo');
      check(readdirSync(outsideDir).length === 0, 'the undo left the note in the test folder');
      const all = lines();
      check(all.length === 3 && all[2].undid === done.id && all[2].ok, `the undo is not its own line: ${JSON.stringify(all[2])}`);
      check(Boolean(all[1].undo?.done), 'the done line does not say when it was undone');
    } finally { await shop.close(); }
  },

  /**
   * Web and commands after a read (road-to-1.3.md C6): the stand-in reads the ticked test connection, then fetches a page
   * and runs node -v. Both would go ahead on their own; after the read each is asked about, naming the connection. The
   * mark is kept with the session for a later round.
   */
  async outsideweb(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CONNECTION_PLAY: 'outsideweb' } });
    const { page, L } = shop;
    try {
      await connectTest(shop);
      const label = JSON.parse(readFileSync(join(home.data, 'connections.json'), 'utf8')).connections[0].label;
      await orderWithConnection(shop, W[lang].page);
      let shot = false;
      const r = await shop.workUntilDone({
        answers: () => 1,
        onTick: async () => {
          if (shot || !(await page.locator('.backdrop').isVisible().catch(() => false))) return;
          shot = true;
          await sleep(1200);
          await shop.shot(join(out, 'outsideweb-card.png'));
          await shop.resize([640, 360]);
          await sleep(400);
          await shop.shot(join(out, 'outsideweb-card-small.png'));
          await shop.resize('medium');
          await sleep(400);
        },
      });
      check(r.ok, 'did not finish');
      const said = r.seen.map((c) => c.text).join(' | ');
      check(r.seen.length === 2, `${r.seen.length} cards, not 2: ${said}`);
      check(said.includes(L.risk.webAfterConnection.replace('{label}', label)), `no card says why the web lookup asks: ${said}`);
      check(said.includes(L.risk.shellAfterConnection.replace('{label}', label)), `no card says why the command asks: ${said}`);
      check(r.seen.every((c) => !c.serious), 'a lookup after a read was asked on the serious card');
      const reads = JSON.parse(readFileSync(join(home.data, 'connection-reads.json'), 'utf8'));
      check(Object.values(reads).length === 1 && Object.values(reads)[0] === label, `connection-reads.json: ${JSON.stringify(reads)}`);
      const [line] = readFileSync(join(home.data, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      check(line.tool === 'read_note' && line.decision === 'given' && line.ok, `actions.jsonl: ${JSON.stringify(line)}`);
    } finally { await shop.close(); }
  },

  /**
   * The shop's office tools (road-to-1.3.md C1): the stand-in makes a Word document, a workbook with a SUM, a two-slide
   * deck, and a page saved as a PDF, none of them asked about. The files are what Office would open without a second
   * thought; the result card shows a thumbnail a moment after it, and a click on it opens the main file (written down
   * here, not opened). Shots of the card in both sizes.
   */
  async office(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const F = OFFICE_FILES[lang === 'zh-CN' ? 'zh' : 'en'];
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_PLAY: 'office' } });
    try {
      await recordOpens(shop);
      await shop.order({ template: 'document', want: W[lang].document });
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      check(!r.seen.length, `making files in the folder was asked about: ${r.seen.map((c) => c.text).join(' | ')}`);
      const dir = latestCommission(home);
      for (const name of Object.values(F)) check(existsSync(join(dir, name)), `${name} is not in the commission folder`);
      const scratch = join(home.home, 'unpacked');
      looksSafe(join(dir, F.docx), scratch);
      const xlsx = looksSafe(join(dir, F.xlsx), scratch);
      const sheet = readFileSync(join(xlsx.dir, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');
      check(/<f>SUM\(D2:D3\)<\/f>/.test(sheet), `the workbook lost its SUM: ${sheet.slice(0, 300)}`);
      const pptx = looksSafe(join(dir, F.pptx), scratch);
      check(pptx.parts.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length === 2, 'the deck does not have two slides');
      const pdf = readFileSync(join(dir, F.pdf));
      const { text } = readPdf(pdf);
      check(pdf.subarray(0, 5).toString() === '%PDF-' && pdfSays(text, lang === 'zh-CN' ? '小灯屋春季菜单' : 'Lamplight Nook spring menu'), `the PDF does not carry its page: ${text.slice(0, 200)}`);

      const thumb = await cardThumb(shop);
      check(thumb.src.startsWith('data:image/png;base64,'), 'the thumbnail is not a PNG');
      check(thumb.src.length * 0.75 <= 200 * 1024, `the thumbnail is ${Math.round(thumb.src.length * 0.75 / 1024)} KB`);
      const width = await shop.page.locator('.result-card .result-thumb img').evaluate((i) => i.naturalWidth);
      check(width === 280, `the thumbnail is ${width} wide, not 280`);
      console.log(`  [${lang}] ${logged(home, "result thumbnail").at(-1) ?? "no thumbnail line in the log"}`);
      await sleep(400);
      await shop.shot(join(out, 'office-result.png'));
      await shop.resize([640, 360]);
      await sleep(400);
      await shop.shot(join(out, 'office-result-small.png'));
      await shop.resize('medium');
      await sleep(400);
      await shop.page.locator('.result-card .result-thumb').click();
      await sleep(500);
      const main = await shop.page.locator('.result-card .result-file').innerText();
      const o = await opened(shop);
      check(o.opened.length === 1 && o.opened[0].endsWith(main.trim()), `the thumbnail did not open the main file ${main}: ${JSON.stringify(o)}`);
    } finally { await shop.close(); }
  },

  /**
   * Reading Office files (road-to-1.3.md C1): a Word document and a workbook are handed over, the stand-in reads each with
   * read_document and writes what came back into a text file, which must hold the samples' text as the tests read it.
   */
  async officeread(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const dir = join(home.home, 'samples');
    mkdirSync(dir, { recursive: true });
    const handed = ['sample.docx', 'sample.xlsx'].map((name) => {
      cpSync(join(ROOT, 'tests', 'fixtures', 'office', name), join(dir, name));
      return join(dir, name);
    });
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_PLAY: 'officeread' } });
    try {
      await shop.order({ template: 'document', want: W[lang].document, files: handed });
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      check(!r.seen.length, `reading the handed-over files was asked about: ${r.seen.map((c) => c.text).join(' | ')}`);
      const text = readFileSync(join(latestCommission(home), OFFICE_READ_FILE[lang === 'zh-CN' ? 'zh' : 'en']), 'utf8');
      // tests/__snapshots__/office.test.ts.snap, what readDocument gives for these two.
      for (const said of ['# Quarterly report', 'This paragraph has bold words in it.', '- Second point', '| Apples | 3 | Fresh |', '这是一行中文。',
        '## Sales', 'Item,Amount', 'Tea,12.5', '"Jam, small",4', 'Total,46.5', '## Notes', 'Open,TRUE']) check(text.includes(said), `what was read lacks "${said}": ${text.slice(0, 400)}`);
      await shop.shot(join(out, 'officeread-result.png'));
    } finally { await shop.close(); }
  },

  /**
   * Changing a file the user handed over (road-to-1.3.md C3): a Word document, a deck and a workbook are each picked for
   * the edit template and changed by number, and a PDF comes back as Word. The user's file and the shop's original copy
   * stay byte for byte as they were, the revised copy holds the change (a tracked change in Word), the Office cards have a
   * thumbnail, and the PDF's card says it became Word. Shots of each card, and of the Word one at 640x360.
   */
  async officeedit(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const F = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).ui.files;
    const dir = join(home.home, 'samples');
    mkdirSync(dir, { recursive: true });
    for (const name of ['sample.docx', 'sample.pptx', 'sample.xlsx']) cpSync(join(ROOT, 'tests', 'fixtures', 'office', name), join(dir, name));
    // Nothing reads the PDF but the stand-in, which does not: a small one is enough.
    writeFileSync(join(dir, 'menu.pdf'), '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const scratch = join(home.home, 'unpacked');
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await recordOpens(shop);
      for (const name of ['sample.docx', 'sample.pptx', 'sample.xlsx', 'menu.pdf']) {
        const users = readFileSync(join(dir, name));
        await shop.order({ template: 'edit', want: W[lang].edit });
        await shop.pickFiles([join(dir, name)]);
        await shop.page.locator('form.commission .source-row button').first().click();
        await sleep(400);
        await shop.submit();
        const r = await shop.workUntilDone();
        check(r.ok, `${name} did not finish`);
        check(!r.seen.length, `${name}: changing the copy was asked about: ${r.seen.map((c) => c.text).join(' | ')}`);
        const work = latestCommission(home);
        check(readFileSync(join(dir, name)).equals(users), `${name}: the user's own file changed`);
        check(readFileSync(join(work, `${F.originalPrefix}${name}`)).equals(users), `${name}: the shop's original copy changed`);
        const revised = join(work, `${F.revisedPrefix}${name.replace(/\.pdf$/, '.docx')}`);
        check(existsSync(revised), `${name}: no revised copy ${revised}`);
        const pkg = looksSafe(revised, scratch);
        const part = (re) => pkg.parts.filter((p) => re.test(p)).map((p) => readFileSync(join(pkg.dir, p), 'utf8')).join('\n');
        if (name.endsWith('.docx')) {
          const doc = part(/^word\/document\.xml$/);
          check(/<w:del [^>]*><w:r>.*?<w:delText xml:space="preserve">bold<\/w:delText>/.test(doc) && /<w:ins [^>]*><w:r>.*?<w:t xml:space="preserve">plain<\/w:t>/.test(doc), `the Word copy has no tracked change: ${doc.slice(0, 400)}`);
        }
        if (name.endsWith('.pptx')) check(part(/^ppt\/slides\/slide\d+\.xml$/).includes('Iced tea'), 'the deck lacks the new line');
        if (name.endsWith('.xlsx')) check(/<c r="B3"[^>]*><v>40<\/v><\/c>/.test(part(/^xl\/worksheets\/sheet1\.xml$/)), 'the workbook lacks the changed cell');
        if (name.endsWith('.pdf')) {
          check(part(/^word\/document\.xml$/).includes(lang === 'zh-CN' ? '柠檬挞' : 'Lemon tart'), 'the PDF did not come back as Word');
          const note = await shop.page.locator('.result-card .result-converted').innerText();
          check(note.trim() === shop.L.ui.resultConverted.pdfToWord, `the card does not say the PDF became Word: ${note}`);
        } else {
          check((await shop.page.locator('.result-card .result-converted').count()) === 0, `${name}: a converted note on the card`);
        }
        await cardThumb(shop).catch(() => check(false, `${name}: no thumbnail on the card`));
        await sleep(400);
        const kind = name.slice(name.lastIndexOf('.') + 1);
        await shop.shot(join(out, `officeedit-${kind}.png`));
        if (kind === 'docx') {
          await shop.resize([640, 360]);
          await sleep(400);
          await shop.shot(join(out, 'officeedit-docx-small.png'));
          await shop.resize('medium');
          await sleep(400);
        }
        await shop.page.keyboard.press('Escape');
        await sleep(1500);
      }
    } finally { await shop.close(); }
  },

  /**
   * A research write-up's sources on its card (road-to-1.3.md C7): the stand-in writes one point without a number, cites
   * one page this round never searched or fetched, and names one conclusion it found no source for. The card marks all
   * three, and a click on a source opens its address in the browser (written down here, not opened).
   */
  async cite(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CITE: 'flawed' } });
    try {
      await shop.app.evaluate(({ shell }) => {
        globalThis.external = [];
        shell.openExternal = async (url) => { globalThis.external.push(url); };
      });
      await shop.order({ template: 'research', want: W[lang].research });
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      const C = shop.L.ui.citations;
      const card = shop.page.locator('.result-card');
      await card.locator('.result-sources').waitFor({ timeout: 5000 });
      const states = await card.locator('.result-source-list li').evaluateAll((lis) => lis.map((li) => [li.dataset.n, li.querySelector('.result-source-state').textContent]));
      check(JSON.stringify(states) === JSON.stringify([['1', C.opened], ['2', C.opened], ['3', C.notOpened]]), `the sources are not marked as this round saw them: ${JSON.stringify(states)}`);
      const unnumbered = await card.locator('.result-unnumbered').innerText();
      check(unnumbered.trim() === C.unnumbered.replace('{n}', '1'), `the point without a number is not said: ${unnumbered}`);
      const unsourced = await card.locator('.result-unsourced li').allInnerTexts();
      check(unsourced.length === 1 && unsourced[0].trim() === (lang === 'zh-CN' ? '阳台上能种一整年' : 'Tomatoes grow all year on a balcony'), `the conclusion without a source is not listed: ${JSON.stringify(unsourced)}`);
      check((await card.locator('.result-missing').count()) === 0, 'a number was said to be missing');
      await sleep(400);
      await shop.shot(join(out, 'cite-result.png'));
      await shop.resize([640, 360]);
      await sleep(400);
      await shop.shot(join(out, 'cite-result-small.png'));
      await shop.resize('medium');
      await sleep(400);
      await card.locator('.result-source-list li[data-n="3"] .result-source').click();
      await card.locator('.result-source-list li[data-n="1"] .result-source').click();
      await sleep(500);
      const external = await shop.app.evaluate(() => globalThis.external);
      check(JSON.stringify(external) === JSON.stringify(['https://example.org/never', 'https://example.org/a']), `clicking the sources opened ${JSON.stringify(external)}`);
    } finally { await shop.close(); }
  },

  /**
   * A chart from a table handed over (C2): the stand-in draws chart.html and saves chart.png through render_png. The
   * card's thumbnail is that picture, and a click on it opens the PNG, not the page.
   */
  async chart(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const s = samples(home);
    const csv = join(s.dir, 'sales.csv');
    writeFileSync(csv, lang === 'zh-CN' ? '月份,杯数\n一月,120\n二月,180\n三月,90\n四月,150\n' : 'Month,Cups\nJanuary,120\nFebruary,180\nMarch,90\nApril,150\n');
    const F = shopFiles(lang);
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await recordOpens(shop);
      await shop.order({ template: 'chart', want: W[lang].chart, files: [csv] });
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      const dir = latestCommission(home);
      check(existsSync(join(dir, F.chartPage)), `${F.chartPage} missing`);
      check(JSON.stringify(pngSize(join(dir, F.chartPng))) === JSON.stringify([1200, 800]), `${F.chartPng} is ${JSON.stringify(pngSize(join(dir, F.chartPng)))}, not 1200x800`);
      check(readFileSync(join(dir, F.chartPage), 'utf8').includes('>180<'), 'a number from the request is not on the chart');
      await cardThumb(shop).catch(() => check(false, 'no thumbnail on the card'));
      await sleep(400);
      await shop.shot(join(out, 'chart-result.png'));
      await shop.resize([640, 360]);
      await sleep(400);
      await shop.shot(join(out, 'chart-result-small.png'));
      await shop.resize('medium');
      await sleep(400);
      await shop.page.locator('.result-card .result-thumb').click();
      await sleep(500);
      const o = await opened(shop);
      check(o.opened.at(-1)?.endsWith(F.chartPng), `the thumbnail did not open the picture: ${JSON.stringify(o)}`);
    } finally { await shop.close(); }
  },

  /** An A4 poster (C2): a PNG of 794x1123 and a PDF beside it, the PNG on the card. */
  async poster(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const F = shopFiles(lang);
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await shop.order({ template: 'poster', want: W[lang].poster });
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      const dir = latestCommission(home);
      check(existsSync(join(dir, F.posterPage)), `${F.posterPage} missing`);
      check(JSON.stringify(pngSize(join(dir, F.posterPng))) === JSON.stringify([794, 1123]), `${F.posterPng} is ${JSON.stringify(pngSize(join(dir, F.posterPng)))}, not A4`);
      check(readFileSync(join(dir, F.posterPdf)).subarray(0, 5).toString() === '%PDF-', 'the A4 poster has no PDF beside it');
      // Drawn at its own size, not squeezed into the screen and stretched back: the sun is round, and the date and the
      // place at the foot of the page are in the picture.
      const look = await shop.app.evaluate(({ nativeImage }, file) => {
        const img = nativeImage.createFromPath(file);
        const { width, height } = img.getSize();
        const px = img.toBitmap();
        let [x0, y0, x1, y1, light] = [width, height, -1, -1, 0];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const [b, g, r] = [px[i], px[i + 1], px[i + 2]];
            if (Math.abs(r - 246) < 12 && Math.abs(g - 174) < 12 && Math.abs(b - 45) < 12) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
            if (y > height * 0.8 && r > 230 && g > 230 && b > 210) light++;
          }
        }
        return { sun: [x1 - x0 + 1, y1 - y0 + 1], light };
      }, join(dir, F.posterPng));
      check(Math.abs(look.sun[0] - look.sun[1]) <= 3, `the poster was stretched: its sun is ${look.sun.join('x')}`);
      check(look.light > 200, `the foot of the poster is missing from the picture (${look.light} light pixels)`);
      await cardThumb(shop).catch(() => check(false, 'no thumbnail on the card'));
      await sleep(400);
      await shop.shot(join(out, 'poster-result.png'));
      copyFileSync(join(dir, F.posterPng), join(out, 'poster-made.png'));
    } finally { await shop.close(); }
  },

  /**
   * An album with a BMP among the photos (C2): it is taken, and a PNG copy the staff can look at lands beside it. A HEIC
   * is refused on the slip, saying why.
   */
  async album(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const s = samples(home);
    const bmp = join(s.dir, 'scan.bmp');
    writeFileSync(bmp, bmpOf(40, 30));
    const heic = join(s.dir, 'phone.heic');
    writeFileSync(heic, 'not really a heic');
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await shop.order({ template: 'album', want: W[lang].album, files: [...s.photos, bmp, heic] });
      const tags = await shop.page.locator('form.commission .material-tag').count();
      check(tags === s.photos.length + 1, `expected ${s.photos.length + 1} handed-over files, saw ${tags}`);
      const note = await shop.page.locator('form.commission .material-note').innerText();
      check(note.includes('phone.heic') && note.includes('HEIC'), `the HEIC was not refused with a reason: ${note}`);
      await shop.shot(join(out, 'album-slip.png'));
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      const mat = join(latestCommission(home), shop.L.ui.files.materials);
      check(existsSync(join(mat, 'scan.bmp')), 'the BMP was not handed over');
      check(JSON.stringify(pngSize(join(mat, 'scan.png'))) === JSON.stringify([40, 30]), `the BMP has no 40x30 PNG copy: ${JSON.stringify(pngSize(join(mat, 'scan.png')))}`);
      check(!existsSync(join(mat, 'phone.heic')), 'the HEIC was copied in');
      await shop.shot(join(out, 'album-result.png'));
    } finally { await shop.close(); }
  },

  async materials(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const s = samples(home);
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await shop.order({ template: 'letter', want: W[lang].letter, files: [s.note, s.photos[0]] });
      const tags = await shop.page.locator('form.commission .material-tag').count();
      check(tags === 2, `expected 2 handed-over files, saw ${tags}`);
      await shop.shot(join(out, 'materials-slip.png'));
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      const dir = latestCommission(home);
      const mat = join(dir, shop.L.ui.files.materials);
      check(existsSync(join(mat, 'notes.txt')) && existsSync(join(mat, 'photo-1.png')), 'materials were not copied');
      check(readFileSync(s.note, 'utf8').startsWith('Saturday'), 'the original was changed');
    } finally { await shop.close(); }
  },

  /**
   * All fourteen templates, one after another in the same shop; each leaves its file and a shelf item. The ones whose main
   * file is a page or a file the office tools made get a thumbnail on their card (C1); a click on the Word document's opens it.
   */
  async templates(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const s = samples(home);
    const F = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).ui.files;
    const list = [
      ['page', W[lang].page, 'index.html'],
      ['research', W[lang].research, F.summary],
      ['letter', W[lang].letter, F.letter],
      ['sheet', W[lang].sheet, F.sheet],
      ['plan', W[lang].plan, F.plan],
      ['album', W[lang].album, 'index.html', s.photos],
      ['edit', W[lang].edit, `${F.revisedPrefix}letter-draft.txt`, null, s.doc],
      ['tidy', W[lang].tidy, F.tidyPlan, null, s.messy],
      ['resume', W[lang].resume, F.resume, [s.note]],
      ['notes', W[lang].notes, F.notes, [s.note]],
      ['travel', W[lang].travel, 'index.html'],
      ['tool', W[lang].tool, F.tool],
      ['document', W[lang].document, F.document],
      ['slides', W[lang].slides, F.slides],
    ];
    // Kinds whose card shows a picture: a page or a file the office tools made this round.
    const pictured = new Set(['page', 'sheet', 'album', 'resume', 'travel', 'tool', 'document', 'slides']);
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await recordOpens(shop);
      for (const [template, want, file, files, source] of list) {
        await shop.order({ template, want, files });
        if (source) {
          await shop.pickFiles([source]);
          await shop.page.locator('form.commission .source-row button').first().click();
          await sleep(400);
        }
        await shop.submit();
        const r = await shop.workUntilDone();
        check(r.ok, `${template} did not finish`);
        const dir = latestCommission(home);
        check(existsSync(join(dir, file)), `${template}: ${file} missing`);
        if (['sheet', 'document', 'slides'].includes(template)) check(readFileSync(join(dir, file)).subarray(0, 2).toString() === 'PK', `${template}: ${file} is not an Office package`);
        if (template === 'resume') check(readFileSync(join(dir, F.resumePdf)).subarray(0, 5).toString() === '%PDF-', 'the résumé has no PDF beside it');
        if (pictured.has(template)) await cardThumb(shop).catch(() => check(false, `${template}: no thumbnail on the card`));
        if (template === 'document') {
          await shop.page.locator('.result-card .result-thumb').click();
          await sleep(500);
          const o = await opened(shop);
          check(o.opened.at(-1)?.endsWith(file), `the Word document's thumbnail did not open it: ${JSON.stringify(o)}`);
        }
        // The small tool made a page, so there is no script or launcher, and nothing ran on the computer.
        if (template === 'tool') check(![F.toolScript, F.toolLauncher].some((f) => existsSync(join(dir, f))), 'the tool wrote a script it did not need');
        await shop.shot(join(out, `template-${template}.png`));
        await shop.page.keyboard.press('Escape');
        await sleep(1500);
      }
      await shop.hotspot(shop.L.ui.access.hotspotWorks);
      await sleep(300);
      await shop.shot(join(out, 'shelf.png'));
    } finally { await shop.close(); }
  },

  /**
   * A small tool that has to change files comes as a script and a launcher. One that previews first and never deletes
   * passes quietly; one that deletes at once gets a warning on the result card, naming the script.
   */
  async scripts(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const F = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).ui.files;
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      for (const [want, careless] of [[W[lang].toolRename, false], [W[lang].toolWipe, true]]) {
        const r = await runOne(shop, { template: 'tool', want });
        check(r.ok, `${want} did not finish`);
        const dir = latestCommission(home);
        check([F.toolScript, F.toolLauncher].every((f) => existsSync(join(dir, f))), 'no script and launcher');
        const warning = shop.page.locator('.result-card .result-script');
        check((await warning.count()) === (careless ? 1 : 0), careless ? 'no warning for a script that deletes' : 'a careful script got a warning');
        if (careless) check((await warning.textContent()).includes(F.toolScript), 'the warning does not name the script');
        await shop.shot(join(out, `scripts-${careless ? 'careless' : 'careful'}.png`));
        await shop.page.keyboard.press('Escape');
        await sleep(1500);
      }
    } finally { await shop.close(); }
  },

  /** Change it again: a second round in the same folder, then back to the last version and forward again. */
  async revise(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      check((await runOne(shop, { template: 'page', want: W[lang].page })).ok, 'first round did not finish');
      const dir = latestCommission(home);
      const before = readFileSync(join(dir, 'index.html'), 'utf8');
      await shop.page.locator('.result-revise').click();
      await shop.page.fill('form.revise textarea', W[lang].ask);
      await shop.page.locator('form.revise button.default').click();
      const r = await shop.workUntilDone();
      check(r.ok, 'second round did not finish');
      check(latestCommission(home) === dir, 'second round went to a new folder');
      const after = readFileSync(join(dir, 'index.html'), 'utf8');
      check(after !== before && after.includes(W[lang].ask), 'the change is not in the file');
      await shop.shot(join(out, 'revise-result.png'));
      await shop.page.locator('.result-restore').click();
      await sleep(800);
      check(readFileSync(join(dir, 'index.html'), 'utf8') === before, 'going back did not restore the last version');
      await shop.page.locator('.result-restore').click();
      await sleep(800);
      check(readFileSync(join(dir, 'index.html'), 'utf8') === after, 'going forward again lost the change');
    } finally { await shop.close(); }
  },

  /**
   * Work in a folder the user already has (road-to-1.1.md A6). Their home folder is refused as too much, and a folder
   * over the cap is refused when picked and, if it grows past it after that, before the work starts. In a small site the
   * staff change two of the user's files without a card each time and add one; undo puts the two back byte for byte,
   * takes the new one away, and leaves the user's other files alone.
   */
  async inplace(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const site = join(home.home, 'site');
    mkdirSync(join(site, 'img'), { recursive: true });
    writeFileSync(join(site, 'index.html'), '<!doctype html>\r\n<html><body><main><h1>Our street fair</h1></main></body></html>\r\n');
    writeFileSync(join(site, 'style.css'), 'body { background: #fffaf0; }\n');
    writeFileSync(join(site, 'notes.txt'), 'Not part of the site.\n');
    cpSync(join(ROOT, 'assets', 'ui', 'icon.png'), join(site, 'img', 'logo.png'));
    const files = ['index.html', 'style.css', 'notes.txt', 'img/logo.png'];
    const before = Object.fromEntries(files.map((f) => [f, readFileSync(join(site, f))]));
    /** A folder with one file bigger than the cap (100 MB). */
    const huge = (dir) => {
      mkdirSync(dir, { recursive: true });
      const fd = openSync(join(dir, 'video.bin'), 'w');
      ftruncateSync(fd, 101 * 1024 * 1024);
      closeSync(fd);
    };
    const big = join(home.home, 'big');
    huge(big);
    const L = shop => shop.L.ui.lent;
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      const want = lang === 'en' ? 'Add a contact page to this little site, and tidy up the home page and the styles.' : '帮我给这个小网站加一页联系方式，首页和样式也顺一顺。';
      await shop.order({ template: 'page', want });
      const hint = shop.page.locator('form.commission .lent-hint');
      for (const [folder, says, name] of [[home.home, L(shop).broad, 'broad'], [big, L(shop).tooBig, 'too-big']]) {
        await shop.pickFiles([folder]);
        await shop.page.locator('form.commission .lent-pick').click();
        await sleep(400);
        check((await hint.textContent()) === says, `${name} folder: the slip says "${await hint.textContent()}"`);
        await shop.shot(join(out, `inplace-${name}.png`));
      }
      await shop.pickFiles([site]);
      await shop.page.locator('form.commission .lent-pick').click();
      await sleep(400);
      check((await shop.page.locator('form.commission .lent-name').textContent()).includes('site'), 'the slip does not name the folder');
      check(await shop.page.locator('form.commission .material-row').isHidden(), 'handing over files is still offered for a lent folder');
      await shop.shot(join(out, 'inplace-form.png'));
      await shop.submit();
      const agree = shop.page.locator('form.commission .lent-confirm');
      check(await agree.isVisible(), 'no question before working in the folder');
      check((await agree.textContent()).includes(L(shop).confirmUndo), 'the question does not promise the undo');
      await shop.shot(join(out, 'inplace-confirm.png'));
      await agree.locator('button.default').click();
      const r = await shop.workUntilDone();
      check(r.ok, 'did not finish');
      check(!r.seen.some((c) => c.serious), `a card asked about changing the user's files: ${r.seen.map((c) => c.text).join(' | ')}`);
      const changed = files.filter((f) => !readFileSync(join(site, f)).equals(before[f]));
      check(changed.join() === 'index.html,style.css', `changed ${changed.join(', ') || 'nothing'}`);
      check(existsSync(join(site, 'pages', 'contact.html')), 'the new page is missing');
      const listed = await shop.page.locator('.result-card .result-lent').innerText();
      check(['index.html', 'style.css', 'pages/contact.html'].every((f) => listed.includes(f)), `the result card lists: ${listed}`);
      check(!listed.includes('notes.txt'), 'the result card lists a file that was not touched');
      await shop.shot(join(out, 'inplace-result.png'));
      await shop.page.locator('.result-undo').click();
      await sleep(300);
      check(files.every((f) => !readFileSync(join(site, f)).equals(before[f]) === (f === 'index.html' || f === 'style.css')), 'the first click on undo already changed something');
      await shop.shot(join(out, 'inplace-undo-ask.png'));
      await shop.page.locator('.result-undo').click();
      await sleep(800);
      const wrong = files.filter((f) => !readFileSync(join(site, f)).equals(before[f]));
      check(!wrong.length, `not put back byte for byte: ${wrong.join(', ')}`);
      check(!existsSync(join(site, 'pages')), 'the new page (or its folder) is still there');
      check((await shop.page.locator('.result-card .result-restored').textContent()) === L(shop).undone, 'the card does not say it was undone');
      // The page it would open was the new one, now gone.
      check(!(await shop.page.locator('.result-card .actions button', { hasText: shop.L.ui.openInBrowser }).count()), 'the card still offers to open the page that was taken away');
      await shop.shot(join(out, 'inplace-undone.png'));
      await shop.page.keyboard.press('Escape');
      await sleep(1500);

      // Picked while small, grown past the cap since: refused before anything in it changes.
      const grows = join(home.home, 'grows');
      mkdirSync(grows);
      writeFileSync(join(grows, 'index.html'), '<p>small</p>');
      await shop.order({ template: 'page', want });
      await shop.pickFiles([grows]);
      await shop.page.locator('form.commission .lent-pick').click();
      await sleep(400);
      huge(grows);
      await shop.submit();
      await shop.page.locator('form.commission .lent-confirm button.default').click();
      const title = shop.L.ui.run.tooBigTitle;
      await shop.page.waitForFunction((title) => [...document.querySelectorAll('#ui .card .card-title')].some((e) => e.textContent === title), title, { timeout: 20_000 });
      check(readFileSync(join(grows, 'index.html'), 'utf8') === '<p>small</p>', 'the grown folder was changed');
      await shop.shot(join(out, 'inplace-grown.png'));
    } finally {
      await shop.close();
      // A hundred megabytes each: not left behind in the temporary folder.
      rmSync(big, { recursive: true, force: true });
      rmSync(join(home.home, 'grows'), { recursive: true, force: true });
    }
  },

  /**
   * Taking a work away from the shelf (road-to-1.1.md A8): a page made in the shop's folder goes as a zip that unpacks to
   * its files byte for byte, and as a PDF with its words on it; one done in a lent folder zips only the files it touched.
   * The save dialog is answered here, and a cancelled save writes nothing.
   */
  async export(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const S = locale(lang).ui.shelf;
    const takeTo = join(home.home, 'taken');
    mkdirSync(takeTo);
    const shop = await launch({ lang, home, speed: SPEED });
    /** Answer the next save dialog with this path (null cancels it), and see what was shown in its folder. */
    const saveAt = (path) => shop.app.evaluate(({ dialog, shell }, path) => {
      globalThis.shown ??= [];
      shell.showItemInFolder = (p) => { globalThis.shown.push(p); };
      dialog.showSaveDialog = async (_win, opts) => { globalThis.offered = opts.defaultPath; return path ? { canceled: false, filePath: path } : { canceled: true }; };
    }, path);
    const openShelf = async () => {
      await shop.hotspot(shop.L.ui.access.hotspotWorks);
      await shop.page.waitForSelector('.shelf-card li.work');
      return shop.page.locator('.shelf-card li.work').first();
    };
    try {
      // A page made in the shop's own folder, given a stylesheet and a picture beside it, as a bigger work would have.
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, 'the page did not finish');
      await shop.page.keyboard.press('Escape');
      await sleep(1500);
      const work = latestCommission(home);
      mkdirSync(join(work, 'look'));
      writeFileSync(join(work, 'look', 'look.css'), 'h1::after { content: " FROMTHESTYLESHEET"; }\n');
      cpSync(join(ROOT, 'assets', 'ui', 'icon.png'), join(work, 'look', 'logo.png'));
      // One from elsewhere on the computer, and one from the network, must not reach the PDF.
      const outside = join(home.home, 'outside.css');
      writeFileSync(outside, 'h1::before { content: "FROMOUTSIDE "; }\n');
      const links = ['look/look.css', pathToFileURL(outside).href, 'http://127.0.0.1:9/far.css'].map((href) => `<link rel="stylesheet" href="${href}">`).join('');
      const page = readFileSync(join(work, 'index.html'), 'utf8');
      writeFileSync(join(work, 'index.html'), page.replace('</head>', `${links}</head>`).replace('<main>', '<main><img src="look/logo.png" alt="">'));
      const title = /<h1>([^<]*)<\/h1>/.exec(page)[1];

      let row = await openShelf();
      await saveAt(join(takeTo, 'page.zip'));
      await row.locator('.work-take').click();
      await row.locator('.work-note .take-zip').waitFor();
      check((await row.locator('.work-note').innerText()).includes(S.takeAs), 'a page does not offer the PDF beside the zip');
      await shop.shot(join(out, 'export-choose.png'));
      await row.locator('.work-note .take-zip').click();
      await sleep(800);
      check((await row.locator('.work-note').innerText()) === S.taken, `after the zip the shelf says "${await row.locator('.work-note').innerText()}"`);
      const offered = await shop.app.evaluate(() => globalThis.offered);
      check(offered.endsWith('.zip') && !/[\\/:*?"<>|]/.test(offered.split(/[\\/]/).at(-1)), `the dialog offers the name ${offered}`);
      const unpacked = unzipped(join(takeTo, 'page.zip'));
      const want = filesIn(work);
      check(want.includes('look/look.css') && JSON.stringify(filesIn(unpacked)) === JSON.stringify(want), `the zip holds ${filesIn(unpacked).join(', ')}, the work ${want.join(', ')}`);
      const differ = want.filter((f) => !readFileSync(join(unpacked, f)).equals(readFileSync(join(work, f))));
      check(!differ.length, `not the same bytes: ${differ.join(', ')}`);
      await shop.shot(join(out, 'export-saved.png'));

      const windows = await shop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
      await saveAt(join(takeTo, 'page.pdf'));
      await row.locator('.work-take').click();
      await row.locator('.work-note .take-pdf').click();
      await shop.page.waitForFunction((said) => document.querySelector('.shelf-card li.work .work-note')?.textContent === said, S.taken, { timeout: 20_000 });
      const pdf = readFileSync(join(takeTo, 'page.pdf'));
      const { pages, text } = readPdf(pdf);
      check(pdf.subarray(0, 5).toString() === '%PDF-' && pages >= 1 && pages <= 3, `the PDF has ${pages} pages`);
      check(pdfSays(text, title) && pdfSays(text, 'FROMTHESTYLESHEET'), `the PDF does not carry the page's words or its stylesheet: ${text.slice(0, 300)}`);
      check(!pdfSays(text, 'FROMOUTSIDE'), 'a stylesheet from outside the work reached the PDF');
      check(await shop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length) === windows, 'the window that printed the page is still open');
      const shown = await shop.app.evaluate(() => globalThis.shown);
      check(shown.length === 2 && shown[1].endsWith('page.pdf'), `shown in its folder: ${shown}`);

      // Cancelled: nothing is written, and the choice is still there to make.
      await saveAt(null);
      await row.locator('.work-take').click();
      await row.locator('.work-note .take-zip').click();
      await sleep(500);
      check(readdirSync(takeTo).join() === 'page.pdf,page.zip,page.zip-out', `a cancelled save wrote something: ${readdirSync(takeTo)}`);
      check(await row.locator('.work-note .take-zip').isVisible(), 'the choice went away after a cancelled save');
      await shop.page.keyboard.press('Escape');
      await sleep(500);

      // In a folder the user lent: only what this commission changed and made goes in the zip.
      const site = join(home.home, 'site');
      mkdirSync(join(site, 'img'), { recursive: true });
      writeFileSync(join(site, 'index.html'), '<!doctype html>\r\n<html><body><main><h1>Our street fair</h1></main></body></html>\r\n');
      writeFileSync(join(site, 'style.css'), 'body { background: #fffaf0; }\n');
      writeFileSync(join(site, 'notes.txt'), 'Not part of the site.\n');
      cpSync(join(ROOT, 'assets', 'ui', 'icon.png'), join(site, 'img', 'logo.png'));
      const asked = lang === 'en' ? 'Add a contact page to this little site, and tidy up the home page and the styles.' : '帮我给这个小网站加一页联系方式，首页和样式也顺一顺。';
      await shop.order({ template: 'page', want: asked });
      await shop.pickFiles([site]);
      await shop.page.locator('form.commission .lent-pick').click();
      await sleep(400);
      await shop.submit();
      await shop.page.locator('form.commission .lent-confirm button.default').click();
      check((await shop.workUntilDone()).ok, 'the work in the lent folder did not finish');
      await shop.page.keyboard.press('Escape');
      await sleep(1500);
      row = await openShelf();
      await saveAt(join(takeTo, 'site.zip'));
      await row.locator('.work-take').click();
      await row.locator('.work-note .take-zip').click();
      await sleep(800);
      const lentOut = unzipped(join(takeTo, 'site.zip'));
      const touched = ['index.html', 'pages/contact.html', 'style.css'];
      check(JSON.stringify(filesIn(lentOut)) === JSON.stringify(touched), `the lent work's zip holds ${filesIn(lentOut).join(', ')}`);
      check(touched.every((f) => readFileSync(join(lentOut, f)).equals(readFileSync(join(site, f)))), 'the lent work\'s files are not the same bytes');
      await shop.shot(join(out, 'export-lent.png'));
    } finally { await shop.close(); }
  },

  /** A meeting during the run: the note reaches the work. */
  async meeting(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: Math.max(SPEED, 900) });
    try {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      let sent = false;
      const r = await shop.workUntilDone({ onTick: async (ms) => {
        if (sent || ms < 3000) return;
        sent = true;
        await shop.hotspot(shop.L.ui.access.hotspotBell);
        await shop.page.waitForSelector('form.meeting textarea', { timeout: 5000 });
        await shop.page.fill('form.meeting textarea', W[lang].note);
        await shop.shot(join(out, 'meeting.png'));
        await shop.page.locator('form.meeting button.default').click();
      } });
      check(r.ok, 'did not finish');
      check(readFileSync(join(latestCommission(home), 'index.html'), 'utf8').includes(W[lang].note), 'the meeting note did not reach the page');
    } finally { await shop.close(); }
  },

  /**
   * The apprentice (road-to-1.1.md A5): not there before the tenth work, walks in with it and is introduced; then with
   * three errands at once, Xiaoju takes the first, Xiaodou the second, and the third waits its turn.
   */
  async apprentice(lang, out) {
    const intro = lang === 'en' ? "We've an apprentice now. This is Bean." : '店里来了个学徒，叫小豆。';
    const queued = lang === 'en' ? "That can wait till Clem's back." : '等小橘回来再去。';
    const seed = (done) => ({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify({ commissions: [], stuckNotes: [], greeted: 'c1', shop: { done, told: [], grown: [], met: [] } }) });
    const apprentice = (shop) => shop.page.evaluate(() => {
      const { scene } = window.lamplightDebug;
      const a = scene.actors.get('xiaodou');
      return { visible: a.sprite.visible, alpha: a.sprite.alpha, at: scene.anchorOf('xiaodou'), outside: !!a.outside, moving: !!a.tween?.isPlaying(), talking: scene.speech.has('xiaodou') };
    });
    // Everything anyone says, by whom, and who is out of the front door at the same time.
    const listen = (shop) => shop.page.evaluate(() => {
      const { scene } = window.lamplightDebug;
      const say = scene.say.bind(scene);
      window.said = [];
      scene.say = (id, text, bubble) => { if (text) window.said.push([id, text]); return say(id, text, bubble); };
      window.outTogether = [];
      setInterval(() => {
        const out = ['xiaoju', 'xiaodou'].filter((id) => scene.actors.get(id).outside).join('+');
        if (window.outTogether.at(-1) !== out) window.outTogether.push(out);
      }, 100);
    });
    const said = (shop) => shop.page.evaluate(() => window.said);

    // Nine works done: nobody new yet. The tenth brings the apprentice in at the front door.
    let shop = await launch({ lang, home: freshHome(seed(9)), speed: 100 });
    try {
      await sleep(2000);
      const before = await apprentice(shop);
      check(!before.visible && before.at === null, `the apprentice is there before the tenth work: ${JSON.stringify(before)}`);
      await listen(shop);
      await shop.order({ template: 'demo' });
      await shop.submit();
      check((await shop.workUntilDone()).ok, 'the tenth work did not finish');
      await shop.page.keyboard.press('Escape');
      let arriving = null;
      for (let i = 0; i < 40 && !arriving; i++, await sleep(150)) {
        const a = await apprentice(shop);
        if (a.visible && a.alpha === 1 && a.moving) arriving = a;
      }
      check(arriving, 'the apprentice never walked in');
      await shop.shot(join(out, 'apprentice-arrive.png'));
      for (let i = 0; i < 60 && !(await said(shop)).some(([, text]) => text === intro); i++) await sleep(500);
      check((await said(shop)).some(([, text]) => text === intro), 'nobody introduced the apprentice');
      await sleep(600);
      await shop.shot(join(out, 'apprentice-intro.png'));
      const reply = async () => (await said(shop)).some(([who]) => who === 'xiaodou');
      for (let i = 0; i < 40 && !(await reply()); i++) await sleep(500);
      check(await reply(), 'the apprentice said nothing on coming in');
      await shop.shot(join(out, 'apprentice-reply.png'));
      const here = await apprentice(shop);
      check(here.at === 'counter' && !here.moving, `the apprentice is not at the counter: ${JSON.stringify(here)}`);
    } finally { await shop.close(); }

    // From then on the apprentice is simply there, and takes the errand Xiaoju is too busy for.
    shop = await launch({ lang, home: freshHome(seed(10)), speed: 700, scenario: 'errands' });
    try {
      await sleep(2000);
      const there = await apprentice(shop);
      check(there.visible && there.at === 'counter' && !there.moving, `the apprentice did not open the shop at the counter: ${JSON.stringify(there)}`);
      await shop.shot(join(out, 'apprentice-shop.png'));
      await listen(shop);
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      const shots = new Set();
      const r = await shop.workUntilDone({ onTick: async () => {
        const a = await apprentice(shop);
        // Answering Adeng before setting off; then both out of the front door at once.
        if (!shots.has('go') && a.talking && !a.outside) {
          shots.add('go');
          await shop.shot(join(out, 'apprentice-errand-go.png'));
        }
        if (!shots.has('both') && (await shop.page.evaluate(() => window.outTogether)).includes('xiaoju+xiaodou')) {
          shots.add('both');
          await shop.shot(join(out, 'apprentice-errand-out.png'));
        }
      } });
      check(r.ok, 'the commission with three errands did not finish');
      const together = await shop.page.evaluate(() => window.outTogether);
      check(together.includes('xiaoju+xiaodou'), `Xiaoju and the apprentice were never out together: ${JSON.stringify(together)}`);
      check(shots.has('go') && shots.has('both'), `missing pictures: ${[...shots]}`);
      check((await said(shop)).some(([who, text]) => who === 'adeng' && text === queued), 'the third errand did not wait its turn');
      // Back in from the street with something to say, however long the walk back takes.
      await shop.page.keyboard.press('Escape');
      let back = false;
      for (let i = 0; i < 60 && !back; i++) {
        const a = await apprentice(shop);
        back = !a.outside && a.talking && (await said(shop)).filter(([who]) => who === 'xiaodou').length >= 2;
        if (!back) await sleep(250);
      }
      check(back, `the apprentice never came back in with a word: ${JSON.stringify(await said(shop))}`);
      await shop.shot(join(out, 'apprentice-errand-back.png'));
      for (let i = 0; i < 40 && ((await apprentice(shop)).moving || (await apprentice(shop)).at !== 'counter'); i++) await sleep(250);
      const home = await apprentice(shop);
      check(home.at === 'counter' && !home.outside, `the apprentice did not come back to the counter: ${JSON.stringify(home)}`);
      await shop.shot(join(out, 'apprentice-after.png'));
    } finally { await shop.close(); }
  },

  /** Over the spending cap: the plain stop card, "carry on" more than once, and it still finishes. */
  async budget(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 1 }) });
    const shop = await launch({ lang, home, speed: SPEED, scenario: 'budget' });
    try {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      let stops = 0;
      let r = await shop.workUntilDone();
      while (!r.ok && r.stopped && stops < 12) {
        check(r.stopped.title === shop.L.ui.run.budgetTitle, `unexpected stop: ${r.stopped.title}`);
        if (stops === 0) await shop.shot(join(out, 'budget-stop.png'));
        // A resumed session reports its running total; the card talks about this round only.
        const said = Number(/\$(\d+(?:\.\d+)?)/.exec(r.stopped.text)?.[1]);
        check(said > 0 && said < 1.5, `round ${stops + 1} of a $1 cap says it spent ${said}: ${JSON.stringify(r.stopped.text)}`);
        stops++;
        await shop.retry();
        r = await shop.workUntilDone();
      }
      check(stops >= 2, `expected to hit the cap at least twice, hit it ${stops} times`);
      check(r.ok, 'did not finish after carrying on');
    } finally { await shop.close(); }
  },

  /**
   * The monthly cap (road-to-1.2.md B8): $10 a month and about $3.25 a commission. The third takes the month past eight
   * tenths and Adeng says so once; the slip then says what is left, and the fourth is stopped before it starts, with a way
   * to settings. In the next month work starts again. A shop from before the cap that spent more starts one step up and is
   * told so once.
   */
  async monthcap(lang, out) {
    const L = locale(lang);
    const R = L.ui.run;
    const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 5, monthCapUsd: 10 }) });
    // 11.2 units of the stand-in's cost for a page: about $3.25 each.
    const simEnv = { SIM_COST: '0.29' };
    const ledger = () => JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8'));
    let shop = await launch({ lang, home, speed: SPEED, simEnv, clock: '2026-11-20T10:00' });
    try {
      for (let i = 1; i <= 3; i++) {
        await shop.order({ template: 'page', want: W[lang].page });
        await shop.submit();
        const r = await shop.workUntilDone();
        check(r.ok, `commission ${i} did not finish: ${JSON.stringify(r.stopped ?? r)}`);
        const notes = await shop.page.locator('.result-card .result-budget').allInnerTexts();
        check(notes.length === (i === 3 ? 1 : 0), `after commission ${i} Adeng said ${JSON.stringify(notes)}`);
        if (i === 3) {
          check(notes[0].includes('$10.00'), `the warning does not name the cap: ${notes[0]}`);
          await shop.shot(join(out, 'monthcap-warn.png'));
        }
        await shop.page.keyboard.press('Escape');
        await sleep(800);
      }
      check(ledger().every((e) => e.month === '2026-11'), `the spending is not in the shop's November: ${JSON.stringify(ledger())}`);
      check(JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).budgetSaid?.includes('2026-11'), 'the notebook does not remember the warning');
      await shop.order({ template: 'page', want: W[lang].page });
      const slip = await shop.page.locator('form.commission .budget-note').innerText();
      check(slip.includes(L.ui.budgetLeft.split('{left}')[0]) && slip.includes('$10.00'), `the slip does not say what is left: ${slip}`);
      await shop.page.locator('form.commission .budget-note').scrollIntoViewIfNeeded();
      await shop.shot(join(out, 'monthcap-slip.png'));
      await shop.submit();
      const r = await shop.workUntilDone({ timeout: 20_000 });
      check(!r.ok && r.stopped?.title === R.monthCapTitle, `the fourth was not stopped by the month: ${JSON.stringify(r).slice(0, 300)}`);
      const buttons = await shop.page.locator('#ui .card.serious .actions button').allInnerTexts();
      check(buttons.includes(R.capSettings) && !buttons.includes(R.budgetRetry), `the stop card offers ${JSON.stringify(buttons)}`);
      check(ledger().length === 3, 'the stopped commission spent something');
      await shop.shot(join(out, 'monthcap-stop.png'));
      await shop.page.locator('#ui .card.serious button.cap-go').click();
      await shop.page.waitForSelector('.settings select.month-cap');
      await sleep(300);
      check(await shop.page.locator('.settings select.month-cap').inputValue() === '10', 'settings do not show the monthly cap');
      await shop.page.locator('.settings select.month-cap').scrollIntoViewIfNeeded();
      const spills = await shop.page.locator('.card.settings').evaluate((c) => c.scrollWidth > c.clientWidth + 1);
      check(!spills, 'the monthly cap pushes the settings sideways');
      await shop.shot(join(out, 'monthcap-settings.png'));
    } finally { await shop.close(); }

    // A new month: the cap starts afresh.
    shop = await launch({ lang, home, speed: SPEED, simEnv, clock: '2026-12-02T10:00' });
    try {
      await sleep(1500);
      await shop.page.keyboard.press('Escape');
      const r = await runOne(shop, { template: 'page', want: W[lang].page });
      check(r.ok, `December's commission did not finish: ${JSON.stringify(r.stopped ?? r)}`);
      check(await shop.page.locator('.result-card .result-budget').count() === 0, 'Adeng warned at a third of the cap');
      check(ledger().some((e) => e.month === '2026-12'), 'December spent nothing');
    } finally { await shop.close(); }

    // A shop from before the cap that spent $26 last month starts at $50, and is told so once.
    const old = freshHome({ 'settings.json': onboarded(lang), 'spend.json': JSON.stringify([{ key: 'C:/w/a|s', usd: 26, month: '2026-10' }]) });
    shop = await launch({ lang, home: old, speed: SPEED, clock: '2026-11-20T10:00' });
    try {
      await shop.page.waitForSelector('.month-cap-news', { timeout: 20_000 });
      const said = await shop.page.locator('.month-cap-news').innerText();
      check(said.includes('$50.00') && said.includes('$20.00'), `the news reads ${said}`);
      check(JSON.parse(readFileSync(join(old.data, 'settings.json'), 'utf8')).monthCapUsd === 50, 'the raised cap was not saved');
      await shop.shot(join(out, 'monthcap-news.png'));
    } finally { await shop.close(); }
    shop = await launch({ lang, home: old, speed: SPEED, clock: '2026-11-20T10:00' });
    try {
      await sleep(6000);
      check(await shop.page.locator('.month-cap-news').count() === 0, 'the news came again');
    } finally { await shop.close(); }
  },

  /**
   * A project's cap (road-to-1.2.md B8), set in the notebook: a round of changes gets only what is left of it and stops at
   * it, carrying on is stopped again, and a commission in another project goes ahead.
   */
  async projectcap(lang, out) {
    const L = locale(lang);
    const R = L.ui.run;
    const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 5, monthCapUsd: 0 }) });
    // About $4.50 a page, so a $5 project has just enough left for a round of changes to start.
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_COST: '0.4' } });
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    try {
      check((await runOne(shop, { template: 'page', want: W[lang].page })).ok, 'the first work did not finish');
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      await shop.page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
      await shop.page.waitForSelector('.notebook select.project-cap');
      await shop.page.locator('.notebook select.project-cap').selectOption('5');
      await sleep(400);
      check(notebook().projects[0].capUsd === 5, `the cap was not kept: ${JSON.stringify(notebook().projects[0])}`);
      const spills = await shop.page.locator('.card.notebook').evaluate((c) => c.scrollWidth > c.clientWidth + 1);
      check(!spills, 'the project cap pushes the notebook sideways');
      await shop.page.locator('.notebook select.project-cap').scrollIntoViewIfNeeded();
      await shop.shot(join(out, 'projectcap-notebook.png'));
      await shop.page.locator('.notebook .notebook-revise').first().click();
      await shop.page.fill('form.revise textarea', W[lang].ask);
      await shop.page.locator('form.revise button.default').click();
      let r = await shop.workUntilDone();
      check(!r.ok && r.stopped?.title === R.projectCapTitle, `the round of changes did not stop at the project cap: ${JSON.stringify(r).slice(0, 300)}`);
      const buttons = await shop.page.locator('#ui .card.serious .actions button').allInnerTexts();
      check(buttons.includes(R.capNotebook) && buttons.includes(R.budgetRetry), `the stop card offers ${JSON.stringify(buttons)}`);
      await shop.shot(join(out, 'projectcap-stop.png'));
      await shop.retry();
      r = await shop.workUntilDone({ timeout: 20_000 });
      check(!r.ok && r.stopped?.title === R.projectCapTitle, `carrying on was not stopped again: ${JSON.stringify(r).slice(0, 300)}`);
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      r = await runOne(shop, { template: 'page', want: W[lang].page });
      check(r.ok, 'a commission in another project was held up');
      check(notebook().projects.length === 2, `${notebook().projects.length} projects`);
    } finally { await shop.close(); }
  },

  /**
   * Talking it over with Adeng first (road-to-1.2.md B4): three lines of chat, "write it up" fills the slip, the slip goes in
   * and the work starts, the talk goes on the project, and the notebook's ledger has it on a line of its own. Then the same
   * at the smallest window.
   */
  async consult(lang, out) {
    const L = locale(lang);
    const C = L.ui.consult;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED });
    const said = lang === 'en' ? [W.en.page, 'Mostly my aunts and uncles.', 'I have a few old photos.'] : [W['zh-CN'].page, '主要给家里的长辈看。', '有几张老照片。'];
    const ledger = () => JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8'));
    try {
      await talk(shop, said);
      const lines = await shop.page.locator('.consult-log .consult-line.adeng:not(.waiting)').allInnerTexts();
      check(lines.length === 4 && lines.every((l) => l.length > 6), `Adeng said ${JSON.stringify(lines)}`);
      await noSpill(shop, 'the talk');
      await shop.shot(join(out, 'consult-chat.png'));
      const talks = ledger().filter((e) => e.key.startsWith('consult:'));
      check(talks.length === 1 && /^consult:t\d+\|sim-/.test(talks[0].key), `the ledger has ${JSON.stringify(talks)}`);
      await writeUp(shop);
      const slip = await slipValues(shop);
      check(slip.want === said[0], `the slip wants ${slip.want}`);
      check(slip.audience === (lang === 'en' ? 'Regulars at the cafe' : '店里的熟客'), `the slip is for ${slip.audience}`);
      check(slip.details.includes(said[1]) && slip.details.includes(said[2]), `the details read ${slip.details}`);
      check(slip.chip === L.ui.templates.page, `the sticker picked is ${slip.chip}`);
      check(slip.note === C.filled, `the slip says ${slip.note}`);
      await noSpill(shop, 'the filled slip');
      await shop.shot(join(out, 'consult-form.png'));
      const id = ledger().find((e) => e.key.startsWith('consult:')).key.split('|')[0].slice('consult:'.length);
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, `the commission from the talk did not finish: ${JSON.stringify(r.stopped ?? r)}`);
      const notebook = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
      check(JSON.stringify(notebook.projects[0].consults) === JSON.stringify([id]), `the project has ${JSON.stringify(notebook.projects[0].consults)}`);
      check(notebook.commissions[0].form.want === said[0], 'the commission is not the slip the talk wrote');
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      await shop.page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.notebook.title}"]`).click();
      await shop.page.waitForSelector('.notebook-ledger');
      const page = await shop.page.locator('.notebook-ledger').innerText();
      const talked = ledger().filter((e) => e.key.startsWith('consult:')).reduce((s, e) => s + e.usd, 0);
      check(page.includes(L.ui.notebook.ledgerConsults.replace('{n}', '1').replace('{cost}', `$${talked.toFixed(2)}`)), `the ledger page reads ${page}`);
      await shop.shot(join(out, 'consult-notebook.png'));
      await shop.page.keyboard.press('Escape');
      await sleep(400);

      // The smallest window: the talk and the slip it fills still fit.
      await shop.resize([640, 360]);
      await talk(shop, said.slice(0, 1));
      await noSpill(shop, 'the talk at the smallest window');
      await shop.shot(join(out, 'consult-small-chat.png'));
      await writeUp(shop);
      await noSpill(shop, 'the slip at the smallest window');
      await shop.shot(join(out, 'consult-small-form.png'));
    } finally { await shop.close(); }
  },

  /** A talk that reaches its cap: Adeng says to write the slip, and it is filled from the talk with no more paid turns. */
  async consultcap(lang, out) {
    const L = locale(lang);
    const C = L.ui.consult;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    // $0.045 a line: the third line is over the talk's $0.10.
    const shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_COST: '0.045' } });
    const said = lang === 'en' ? [W.en.page, 'Mostly my aunts and uncles.', 'I have a few old photos.'] : [W['zh-CN'].page, '主要给家里的长辈看。', '有几张老照片。'];
    const spent = () => JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8')).filter((e) => e.key.startsWith('consult:')).reduce((s, e) => s + e.usd, 0);
    try {
      await talk(shop, said.slice(0, 2));
      await shop.page.fill('.consult-say', said[2]);
      await shop.page.locator('.consult-send').click();
      await shop.page.waitForSelector(`.consult-line.adeng:has-text("${C.cap}")`, { timeout: 20_000 });
      await shop.shot(join(out, 'consultcap-chat.png'));
      await shop.page.waitForSelector('.consult', { state: 'hidden', timeout: 10_000 });
      const slip = await slipValues(shop);
      check(slip.want === said[0], `the slip wants ${slip.want}`);
      check(said.every((s) => slip.details.includes(s)) && slip.details.includes(L.actors.adeng), `the details read ${slip.details}`);
      check(slip.note === C.filledChat, `the slip says ${slip.note}`);
      const atCap = spent();
      check(atCap > 0.1 && atCap < 0.2, `the talk cost ${atCap}`);
      await shop.shot(join(out, 'consultcap-form.png'));
      // Past the cap, another word and "write it up" cost nothing more.
      await shop.page.locator('form.commission .consult-open').click();
      await shop.page.fill('.consult-say', said[1]);
      await shop.page.locator('.consult-send').click();
      await shop.page.waitForSelector('.consult', { state: 'hidden', timeout: 10_000 });
      check(spent() === atCap, `the talk went on spending: ${spent()}`);
      await shop.submit();
      const r = await shop.workUntilDone();
      check(r.ok, `the commission from the talk did not finish: ${JSON.stringify(r.stopped ?? r)}`);
    } finally { await shop.close(); }
  },

  /** A dropped connection: the stop card, try again, and the work continues from where it was. */
  async neterror(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, scenario: 'neterror' });
    try {
      await shop.order({ template: 'research', want: W[lang].research });
      await shop.submit();
      let r = await shop.workUntilDone();
      check(!r.ok && r.stopped?.title === shop.L.ui.run.netTitle, `expected the network card, got ${JSON.stringify(r).slice(0, 200)}`);
      await shop.shot(join(out, 'net-stop.png'));
      await shop.retry();
      r = await shop.workUntilDone();
      check(r.ok, 'did not finish after trying again');
    } finally { await shop.close(); }
  },

  /**
   * The computer sleeps mid-commission (road-to-1.2.md B7), played through the debug hook only an unpackaged build has. On
   * waking the connection the round was using is dead and it fails for the network, with no card: it carries on by itself,
   * once, in the same session, and finishes. While it runs the computer is kept from sleeping by itself.
   */
  async sleepwake(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const down = join(home.home, 'net-down');
    const shop = await launch({ lang, home, speed: SPEED, scenario: 'sleepwake', simEnv: { SIM_NET_DOWN: down } });
    const power = (what) => shop.app.evaluate((_e, what) => globalThis.__lamplightPower[what](), what);
    try {
      await shop.order({ template: 'research', want: W[lang].research });
      await shop.submit();
      check(await waitForLog(home, 'run start', 1, 15_000), 'the commission did not start');
      check(await waitForLog(home, 'keep awake {"on":true}', 1, 5000), 'the computer was not kept awake while the round ran');
      await power('suspend');
      await sleep(1500);
      await power('resume');
      check(logged(home, 'run end').length === 0, 'the round stopped with the sleep');
      // Awake again, the stand-in finds its connection gone.
      writeFileSync(down, '');
      check(await waitForLog(home, 'run end', 1, 30_000), 'the round did not stop when the connection went');
      check(logged(home, 'run end')[0].includes('"error":"net"'), `the round ended ${logged(home, 'run end')[0]}`);
      const r = await shop.workUntilDone();
      check(r.ok, `it did not finish after waking: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
      await shop.shot(join(out, 'sleepwake-done.png'));
      check(logged(home, 'auto resume').length === 1, `carried on ${logged(home, 'auto resume').length} times`);
      check(logged(home, 'run start').length === 2 && logged(home, 'run start').at(-1).includes('"resumed":true'), 'the second round did not continue the session');
      check(pendingRounds(home).length === 0, 'a finished round is still offered');
      check(await waitForLog(home, 'keep awake {"on":false}', 1, 5000), 'the computer was still kept awake after the round');
    } finally { await shop.close(); }
  },

  /**
   * Windows shuts down with two rounds under way (B7), played through the debug hook: no question card, both are written
   * down as interrupted and the shop goes. Next time one card lists both; "carry on with all" finishes them, each in its
   * own session, and the ledger has each session's total once, beside an estimate for the stretch cut off.
   */
  async shutdown(lang, out) {
    const R = locale(lang).ui.run;
    const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 5 }) });
    const hold = join(home.home, 'hold');
    writeFileSync(hold, '');
    const opts = { lang, home, speed: SPEED, scenario: 'hold', simEnv: { SIM_HOLD: hold, SIM_TOKENS: '1' } };
    let shop = await launch(opts);
    let went = false;
    try {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      check(await waitForLog(home, 'run start', 1, 10_000), 'the first commission did not start');
      await another(shop, { template: 'research', want: W[lang].research });
      check(await waitForLog(home, 'run start', 2, 10_000), 'the second commission did not start beside the first');
      await sleep(3000);
      const exit = new Promise((r) => shop.app.process().once('exit', () => r(true)));
      await shop.app.evaluate(() => globalThis.__lamplightPower.shutdown()).catch(() => {});
      went = await Promise.race([exit, sleep(15_000).then(() => false)]);
    } finally { await shop.close().catch(() => {}); }
    check(went, 'the shop did not close when the computer shut down (a question card would hold it up)');
    check(logged(home, 'session end').length === 1, 'the shutdown was not seen');
    const cut = pendingRounds(home);
    check(cut.length === 2 && cut.every((j) => j.state === 'interrupted' && j.sessionId), `after the shutdown: ${JSON.stringify(cut.map((j) => [j.state, j.sessionId]))}`);
    rmSync(hold);

    shop = await launch(opts);
    try {
      const card = await shop.maybe('.interrupted-card', 10_000);
      check(card, 'no card lists the interrupted rounds');
      const listed = await shop.page.locator('.interrupted-card li').allInnerTexts();
      check(listed.length === 2, `the card lists ${JSON.stringify(listed)}`);
      check((await card.innerText()).includes(R.resumeAll) && (await card.innerText()).includes(R.oneByOne) && (await card.innerText()).includes(R.dropAll), 'the card lacks a button');
      await shop.shot(join(out, 'shutdown-card.png'));
      await shop.resize([640, 360]);
      await shop.shot(join(out, 'shutdown-card-small.png'));
      await shop.resize('medium');
      await shop.page.locator('.interrupted-card button.default').click();
      for (let i = 0; i < 2; i++) {
        const r = await shop.workUntilDone();
        check(r.ok, `round ${i + 1} did not finish: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
        await shop.page.evaluate(() => { document.querySelector('.result-card').dataset.seen = '1'; });
        for (let k = 0; k < 10 && await shop.page.locator('.result-card[data-seen]').count(); k++) {
          await shop.page.keyboard.press('Escape');
          await sleep(600);
        }
        await sleep(800);
      }
      check(logged(home, 'run start').length === 4 && logged(home, 'run start').slice(2).every((l) => l.includes('"resumed":true')), 'the two did not continue their sessions');
      check(pendingRounds(home).length === 0, 'finished rounds are still offered');
      // Each session's reported total is in the ledger once, as the stand-in last reported it.
      const ledger = JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8'));
      for (const j of cut) {
        const key = `${j.workDir}|${j.sessionId}`;
        const reported = ledger.filter((e) => e.key === key && !e.estimated);
        const total = JSON.parse(readFileSync(join(home.home, '.sim', `${j.sessionId}.json`), 'utf8')).paid;
        check(reported.length === 1 && Math.abs(reported[0].usd - total) < 0.001, `${key}: ledger ${JSON.stringify(reported)}, the session's total ${total}`);
        check(ledger.some((e) => e.key === key && e.estimated && e.usd > 0), `${key}: no estimate for the stretch the shutdown cut off`);
      }
    } finally { await shop.close(); }
  },

  /**
   * Two commissions at once (road-to-1.2.md B5). The second is taken from the running card while the first is under way, and
   * the stand-in runs both beside each other; a question asked while both are at work names its project. A third waits in
   * the queue, the board says behind whom, and it starts by itself once one of the two is done. Each result card names its
   * project, each project has its own folder, and the ledger has a line for each.
   */
  async parallel(lang, out) {
    const L = locale(lang);
    const P = L.ui.projects;
    const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 5 }) });
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const ledger = () => JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8'));
    // The stand-in's page asks its colour question in this play (plays.mjs), so a question comes while both are at work.
    const shop = await launch({ lang, home, speed: Math.max(SPEED, 700), scenario: 'projectmemo' });
    try {
      // Two orders in two shops (road-to-1.4.md D3): the page in the workshop, the research at home. The view follows each.
      const where = () => shop.page.evaluate(() => ({ room: window.lamplightDebug.scene.room, rooms: [...window.lamplightDebug.rooms.keys()] }));
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      check(await waitForLog(home, 'run start', 1, 10_000), 'the first commission did not start');
      await sleep(3500);
      check((await where()).room === 'workshop', `the view did not follow the page to the workshop: ${JSON.stringify(await where())}`);
      await another(shop, { template: 'research', want: W[lang].research });
      check(await waitForLog(home, 'run start', 2, 10_000), 'the second commission did not start beside the first');
      check(logged(home, 'run end').length === 0, 'the first had ended before the second started');
      await sleep(1500);
      const both = await where();
      check(both.room === 'cafe' && both.rooms.includes('workshop'), `the two are not each in their shop: ${JSON.stringify(both)}`);
      await shop.shot(join(out, 'parallel-two.png'));
      // A question from the workshop, out of sight, lights its front on the toolbar (D3).
      const workshopName = L.ui.town.shops.workshop;
      const lit = () => shop.page.evaluate(() => { const b = document.querySelector('.tool-btn.calling'); return b && !b.hidden ? b.textContent : null; });
      const calls = [];
      // The page's colour question, asked while both are at work, names its project before the question.
      const asked = await shop.maybe('.backdrop .question', 30_000);
      check(asked && logged(home, 'run end').length === 0, 'no question came while both were at work');
      const q = await asked.innerText();
      check(q.includes(' · '), `a question while two are at work does not name its project: ${q}`);
      calls.push(await lit());
      await shop.shot(join(out, 'parallel-ask.png'));
      await shop.page.keyboard.press('1');
      await sleep(600);
      // The other round asks too, one card at a time, and is answered the other way: each answer must reach its own round.
      const next = await shop.maybe('.backdrop .question', 20_000);
      check(next, 'no question came from the other round');
      const q2 = await next.innerText();
      check(q2 !== q && q2.includes(' · '), `the second question reads ${q2}`);
      calls.push(await lit());
      if (calls[1]) await shop.shot(join(out, 'parallel-calling.png'));
      check(calls.filter(Boolean).length === 1 && calls.find(Boolean) === workshopName, `the workshop's front lit for ${JSON.stringify(calls)}`);
      await shop.page.keyboard.press('2');
      await sleep(600);
      check(await lit() === null, 'the front stayed lit after the answer');
      await another(shop, { template: 'letter', want: W[lang].letter });
      check(await waitForLog(home, 'run queued', 1, 10_000), 'the third commission did not wait in the queue');
      check(logged(home, 'run start').length === 2, 'a third round started beside two');
      const rows = await boardRows(shop);
      const queued = rows.filter((r) => r.status === P.status.queued);
      check(queued.length === 1 && queued[0].callOff && queued[0].waits.startsWith(P.waitSlot.split('{list}')[0]), `the board shows ${JSON.stringify(rows)}`);
      check(rows.filter((r) => r.status === P.status.running || r.status === P.status.waiting).length === 2, `the board does not show the two at work: ${JSON.stringify(rows)}`);
      await shop.shot(join(out, 'parallel-board.png'));
      await shop.page.keyboard.press('Escape');
      await sleep(500);
      // The three results, one card after another, each naming its project.
      const named = [];
      for (let i = 0; i < 3; i++) {
        const r = await shop.workUntilDone();
        check(r.ok, `result ${i + 1} did not come: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
        named.push(await shop.page.locator('.result-card .result-project').innerText());
        if (i === 0) await shop.shot(join(out, 'parallel-result.png'));
        // Put away. A question from the round still at work may come up over it first: that is answered with its first
        // option (the colour question has no default, so Enter would do nothing) and the card put away after; the next
        // result may come straight after, so wait for this one to go.
        await shop.page.evaluate(() => { document.querySelector('.result-card').dataset.seen = '1'; });
        for (let k = 0; k < 10 && await shop.page.locator('.result-card[data-seen]').count(); k++) {
          await shop.page.keyboard.press(await shop.page.locator('.backdrop').count() ? '1' : 'Escape');
          await sleep(600);
        }
        check(await shop.page.locator('.result-card[data-seen]').count() === 0, 'the result card would not go');
        await sleep(800);
      }
      check(new Set(named).size === 3, `the result cards name ${JSON.stringify(named)}`);
      // The third started by itself, after one of the two had ended.
      const lines = logLines(home);
      const at = (what, n) => lines.findIndex((l, i) => l.includes(` ${what}`) && lines.slice(0, i + 1).filter((x) => x.includes(` ${what}`)).length === n);
      check(at('run start', 3) > at('run end', 1), 'the third started before a place was free');
      const projects = notebook().projects;
      check(projects.length === 3 && new Set(projects.map((p) => p.folder)).size === 3, `${projects.length} projects: ${JSON.stringify(projects.map((p) => p.folder))}`);
      for (const p of projects) check(ledger().some((e) => e.key.startsWith(p.folder + '|') && e.usd > 0), `no line in the ledger for ${p.folder}`);
      check(named.every((n) => projects.some((p) => n.includes(p.title))), `the cards name ${JSON.stringify(named)}, the projects are ${JSON.stringify(projects.map((p) => p.title))}`);
      // The answers did not cross: each commission remembers the colour picked on the card that named it.
      const colours = lang === 'en' ? ['Cream', 'Mint'] : ['奶油白', '浅薄荷'];
      const memos = notebook().commissions;
      const picked = (question) => Object.values(memos.find((c) => question.includes(c.title))?.choices ?? {});
      check(JSON.stringify([picked(q), picked(q2)]) === JSON.stringify([[colours[0]], [colours[1]]]), `the answers went to ${JSON.stringify(memos.map((c) => [c.title, c.choices]))}`);
    } finally { await shop.close(); }
  },

  /**
   * An order carried to its shop (road-to-1.4.md D3): a notice, done in the print shop, with a picture in it. Adeng takes
   * the slip out of the home shop and the view follows him into the print shop, where he hands it over and goes home again.
   * For the picture Aqian sets off for the studio, where Umber paints it, and Umber walks into the print shop with it and
   * goes back. Done, the studio is taken down, the print shop stays on screen and Adeng is at the home counter again. Also
   * at the smallest window.
   */
  async dispatch(lang, out) {
    for (const size of [undefined, [640, 360]]) {
      const small = size ? '-640' : '';
      const home = freshHome({ 'settings.json': onboarded(lang) });
      const shop = await launch({ lang, home, speed: 900, scenario: 'dispatch', ...(size ? { size } : {}) });
      const { page } = shop;
      const state = () => page.evaluate(() => {
        const d = window.lamplightDebug;
        const at = (room, who) => d.rooms.get(room)?.scene.anchorOf(who) ?? null;
        return {
          room: d.scene.room,
          rooms: [...d.rooms.keys()],
          home: at('cafe', 'adeng'),
          print: { adeng: at('print', 'adeng'), aqian: at('print', 'aqian'), xiaozhe: at('print', 'xiaozhe') },
          studio: at('studio', 'xiaozhe'),
          // Who is still walking in the print shop: an anchor is set as a walk starts, so a moment waits for them to arrive.
          walking: ['adeng', 'aqian', 'xiaozhe'].filter((a) => d.rooms.get('print')?.scene.actors.get(a)?.tween?.isPlaying()),
          says: [...d.scene.speech].map(([id, s]) => [id, s.text]),
        };
      });
      const seen = new Map();
      // What was seen at each look, kept beside the screenshots: a moment never seen is worked out from it.
      const trace = [];
      const watch = async (moment, ok) => {
        if (seen.has(moment)) return;
        const s = await state();
        trace.push({ at: Date.now(), moment, room: s.room, rooms: s.rooms, home: s.home, print: s.print, studio: s.studio, walking: s.walking });
        if (!ok(s)) return;
        seen.set(moment, s);
        await sleep(400);
        await checkBubbles(shop);
        await shop.shot(join(out, `dispatch-${moment}${small}.png`));
      };
      // The moments, each looked at once: Adeng carrying the slip out of the home shop; handing it over in the print shop;
      // Aqian gone to the studio while Umber paints; Umber in the print shop with the picture.
      const moments = async () => {
        await watch('slip', (s) => s.room === 'cafe' && s.home === 'door');
        await watch('handover', (s) => s.room === 'print' && s.print.adeng === 'counter' && !s.walking.includes('adeng'));
        // Aqian says where she is going first, then heads out: on her way to the door counts.
        await watch('studio', (s) => s.room === 'print' && (s.print.aqian === null || s.print.aqian === 'door') && s.studio === 'board');
        await watch('back', (s) => s.room === 'print' && s.print.xiaozhe === 'counter' && !s.walking.includes('xiaozhe'));
      };
      try {
        await sleep(2500);
        await shop.order({ template: 'document', want: W[lang].document });
        await shop.submit();
        check(await waitForLog(home, 'run start', 1, 10_000), 'the commission did not start');
        for (const end = Date.now() + 8000; Date.now() < end && !seen.has('handover'); await sleep(150)) await moments();
        const r = await shop.workUntilDone({ onTick: moments });
        // The picture may come back as the round ends: Umber is still on his way in. A few more looks.
        for (const end = Date.now() + 10_000; Date.now() < end && !seen.has('back'); await sleep(200)) await moments();
        writeFileSync(join(out, `dispatch-trace${small}.json`), JSON.stringify(trace, null, 1));
        check(r.ok, `the commission did not finish: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
        for (const m of ['handover', 'studio', 'back']) check(seen.has(m), `never saw "${m}": ${JSON.stringify([...seen.keys()])}`);
        // Umber says his line at the counter, then goes back to the studio.
        let after = await state();
        for (const end = Date.now() + 15_000; Date.now() < end && (after.print.xiaozhe !== null || after.print.adeng !== null); await sleep(300)) after = await state();
        check(after.room === 'print', `the view left the print shop: ${after.room}`);
        check(!after.rooms.includes('studio'), `the studio is still up with nothing to do: ${after.rooms}`);
        check(after.print.xiaozhe === null && after.print.adeng === null, `someone from another shop stayed: ${JSON.stringify(after.print)}`);
        // The picture was really made, beside the notice.
        const folder = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.at(-1)?.folder;
        check(folder && existsSync(join(folder, 'figure.png')), `no picture in ${folder}`);
        await shop.page.keyboard.press('Escape');
        let homeAgain = null;
        for (const end = Date.now() + 20_000; Date.now() < end && homeAgain !== 'counter'; await sleep(500)) homeAgain = (await state()).home;
        check(homeAgain === 'counter', `Adeng is not back at the home counter: ${homeAgain}`);
        // Back home: the print shop has nothing left to do and is taken down.
        await page.evaluate(() => window.lamplightDebug.street.onFront('cafe', true));
        await sleep(2500);
        const last = await state();
        check(last.room === 'cafe' && !last.rooms.includes('print'), `going home left ${JSON.stringify(last.rooms)}`);
        await shop.shot(join(out, `dispatch-home${small}.png`));
      } finally { await shop.close(); }
    }
  },

  /**
   * The month has room for one round (road-to-1.2.md B5 rule 5): a second commission taken while it runs waits in the queue
   * for money, the board says so and it can be called off; once the first has spent what it spent and let the rest go, the
   * second starts by itself. Also at the smallest window.
   */
  async parallelcap(lang, out) {
    const L = locale(lang);
    const P = L.ui.projects;
    // $10 a month with $6.80 spent: the first round holds $3, which leaves less than the fifty cents a round needs.
    const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 3, monthCapUsd: 10 }), 'spend.json': JSON.stringify([{ key: 'C:/w/earlier|s', usd: 6.8, month: '2026-11' }]) });
    const ledger = () => JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8'));
    const shop = await launch({ lang, home, speed: Math.max(SPEED, 900), clock: '2026-11-20T10:00' });
    try {
      await shop.order({ template: 'research', want: W[lang].research });
      await shop.submit();
      check(await waitForLog(home, 'run start', 1, 10_000), 'the first commission did not start');
      await another(shop, { template: 'letter', want: W[lang].letter });
      check(await waitForLog(home, 'run queued', 1, 10_000), 'the second did not wait in the queue');
      check(logged(home, 'run start').length === 1, 'the second started with no money for it');
      check(await shop.stopCard() === null, 'the second was turned away with a card instead of waiting');
      const rows = await boardRows(shop);
      const waiting = rows.find((r) => r.status === P.status.queued);
      check(waiting && waiting.waits === P.waitMoney && waiting.callOff, `the board shows ${JSON.stringify(rows)}`);
      await shop.shot(join(out, 'parallelcap-board.png'));
      await shop.resize([640, 360]);
      await sleep(600);
      const spill = await shop.page.locator('.project-card').evaluate((c) => {
        const box = c.getBoundingClientRect();
        return c.scrollWidth > c.clientWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1;
      });
      check(!spill, 'the board does not fit the smallest window');
      await shop.shot(join(out, 'parallelcap-board-small.png'));
      await shop.resize('medium');
      await shop.page.keyboard.press('Escape');
      await sleep(500);
      let r = await shop.workUntilDone();
      check(r.ok, `the first did not finish: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
      await shop.page.keyboard.press('Escape');
      await sleep(800);
      // What the first did not spend went back: the second starts by itself.
      check(await waitForLog(home, 'run start', 2, 15_000), 'the second did not start once the money was there');
      r = await shop.workUntilDone();
      check(r.ok, `the second did not finish: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
      check(ledger().filter((e) => e.month === '2026-11').length === 3, `the ledger has ${JSON.stringify(ledger())}`);
    } finally { await shop.close(); }
  },

  /**
   * Two crews at once (road-to-1.2.md B9): Adeng's and Qingdai's, each under its project's flag, the blackboard in two
   * columns; both after the same errand runner; a meeting for one project while the other crew carries on. In the cafe
   * and the study, each moment by day and by night.
   */
  async crowd(lang, out) {
    const P = locale(lang).ui.projects;
    // Bits of the lines a lead says when an errand has to wait for a runner (lines/cafe.yaml sub_queue).
    const queued = lang === 'en' ? ["can wait till Clem's back", 'has one on the go', 'hold it till'] : ['等小橘回来再去', '手上还有一件', '先放着，等'];
    // The apprentice is in: four pairs of hands for two crews, and three errands for each round (plays.mjs errands).
    const memory = { commissions: [], stuckNotes: [], greeted: 'c1', shop: { done: 10, told: [], grown: [], met: [] } };
    for (const room of ['cafe', 'study']) {
      const home = freshHome({ 'settings.json': onboarded(lang, { scene: room }), 'memory.json': JSON.stringify(memory) });
      const shop = await launch({ lang, home, speed: 1200, scenario: 'errands' });
      const look = () => shop.page.evaluate(() => {
        const { scene, stage } = window.lamplightDebug;
        const who = ['adeng', 'qingdai', 'xiaoju', 'xiaodou', 'laoshi'];
        return {
          together: stage.together,
          crew: Object.fromEntries(who.map((a) => [a, stage.crewOf(a) ?? null])),
          at: Object.fromEntries(who.map((a) => [a, scene.anchorOf(a)])),
          moving: who.filter((a) => scene.actors.get(a).tween?.isPlaying()),
          flags: scene.flagBoxes().length,
          columns: document.querySelectorAll('#board .board-col').length,
          says: [...scene.speech].map(([id, s]) => [id, s.text]),
        };
      });
      // Each moment by day and by night: the period changes at once, the work goes on.
      const shoot = async (name) => {
        for (const period of ['day', 'night']) {
          await shop.page.evaluate((p) => window.lamplightDebug.scene.setPeriod(p, true), period);
          await sleep(250);
          await checkBubbles(shop);
          await shop.shot(join(out, `crowd-${room}-${period}-${name}.png`));
        }
        await shop.page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
      };
      // A question card that comes up is answered with its first option, so the work goes on.
      const answer = async () => { if (await shop.page.locator('.backdrop').count()) { await shop.page.keyboard.press('1'); await sleep(500); } };
      try {
        // The light settles first: a change of light still under way would take back the night set for a picture.
        await sleep(4500);
        // Two home kinds of work, so both crews are in the home shop (road-to-1.4.md D3: a page goes to the workshop).
        await shop.order({ template: 'letter', want: W[lang].letter });
        await shop.submit();
        check(await waitForLog(home, 'run start', 1, 10_000), 'the first commission did not start');
        await another(shop, { template: 'research', want: W[lang].research }, room === 'study' ? locale(lang).sceneText.study.ui.access.hotspotCounter : undefined);
        check(await waitForLog(home, 'run start', 2, 10_000), 'the second commission did not start beside the first');
        await shop.page.keyboard.press('Escape');
        const seen = new Set();
        for (let i = 0; i < 240 && seen.size < 2; i++, await sleep(250)) {
          await answer();
          const s = await look();
          const { adeng, qingdai } = s.crew;
          // Both crews at work, each under its own flag, a column each on the blackboard.
          if (!seen.has('working') && s.together && adeng && qingdai && adeng !== qingdai && s.flags >= 2 && s.columns === 2 && !s.moving.includes('qingdai')) {
            seen.add('working');
            await shoot('working');
          }
          // One crew's errand has to wait: the runner it wants is out for the other.
          if (!seen.has('errand') && s.together && s.says.some(([who, text]) => (who === 'adeng' || who === 'qingdai') && queued.some((q) => text.includes(q)))) {
            seen.add('errand');
            await shoot('errand');
          }
        }
        check(seen.has('working'), 'the two crews were never seen at work at once under their flags');
        check(seen.has('errand'), 'neither crew ever waited for the same errand runner');
        // A meeting for the first project at work, from its card on the project board.
        const rows = await boardRows(shop);
        check(rows.filter((r) => r.status === P.status.running).length === 2, `the board does not show two at work: ${JSON.stringify(rows)}`);
        const title = await shop.page.locator('.project-card li.project-row:has(.project-meet)').first().locator('.project-open, .project-name').innerText();
        await shop.page.locator('.project-card .project-meet').first().click();
        await shop.page.waitForSelector('form.meeting textarea', { timeout: 5000 });
        check((await shop.page.locator('form.meeting').innerText()).includes(title), 'the meeting card does not name its project');
        const run = await shop.page.evaluate((t) => window.lamplightDebug.stage.projects && [...window.lamplightDebug.stage.projects].find(([, p]) => p.title === t)?.[0], title);
        let s = await look();
        for (let i = 0; i < 40; i++, await sleep(250)) {
          s = await look();
          const crew = Object.entries(s.crew).filter(([, r]) => r === run).map(([a]) => a);
          if (crew.length && crew.every((a) => s.at[a] === 'board' && !s.moving.includes(a))) break;
        }
        const lead = await shop.page.evaluate((r) => window.lamplightDebug.stage.leadOf(r), run);
        check(s.at[lead] === 'board', `${lead} did not come to the blackboard for the meeting: ${JSON.stringify(s.at)}`);
        const other = lead === 'adeng' ? 'qingdai' : 'adeng';
        check(s.crew[other] && s.crew[other] !== run, `the other crew stopped for the meeting: ${JSON.stringify(s.crew)}`);
        await shop.page.fill('form.meeting textarea', W[lang].note);
        await shoot('meeting');
        await shop.page.locator('form.meeting button.default').click();
        await sleep(800);
      } finally { await shop.close(); }
    }
  },

  /**
   * Out of sight (road-to-1.2.md B6): halfway through, the close question's third button tucks the shop into the tray this
   * once, the setting unchanged. A question while it is away comes as a notice, which brings the shop back to answer it;
   * tucked away again, it finishes, the notice says so, and clicking it shows the result card. System notifications cannot
   * be screenshot: the stand-ins in isolate.cjs keep them, and the log has their kinds.
   */
  async background(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const shop = await launch({ lang, home, speed: Math.max(SPEED, 900), scenario: 'projectmemo' });
    const tuck = () => shop.app.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBoxSync = () => 2;
      BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini')).close();
    });
    const visible = () => shop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini')).isVisible());
    const notices = () => shop.app.evaluate(() => globalThis.__sim.notices.map((n) => ({ title: n.title, body: n.body })));
    const click = (i) => shop.app.evaluate((_e, i) => globalThis.__sim.notices[i].emit('click'), i);
    try {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      check(await waitForLog(home, 'run start', 1, 10_000), 'the commission did not start');
      await sleep(1500);
      await tuck();
      await sleep(800);
      check(!(await visible()), 'the third button did not tuck the shop away');
      check(await waitForLog(home, 'tucked into the tray', 1, 3000), 'tucking away was not noted');
      check(!JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).closeToTray, 'tucking away once changed the setting');
      // The page's colour question, while nobody is looking: a notice, and the round waits for the answer.
      check(await waitForLog(home, 'notice {"kind":"ask"', 1, 60_000), 'no notice for the question');
      check(logged(home, 'run end').length === 0, 'the round did not wait for its answer');
      await click(0);
      await sleep(800);
      check(await visible(), 'the notice did not bring the shop back');
      check(await shop.maybe('.backdrop .question', 5000), 'the question is not there to answer');
      await shop.page.keyboard.press('1');
      await sleep(600);
      await tuck();
      check(await waitForLog(home, 'run end', 1, 120_000), 'the commission did not finish in the tray');
      check(await waitForLog(home, 'notice {"kind":"done"', 1, 5000), 'no notice for the finished work');
      const said = await notices();
      const title = notebook().projects[0].title;
      check(said.length === 2 && said[1].title.includes(title) && !said[1].body.includes('<'), `the notices read ${JSON.stringify(said)}`);
      writeFileSync(join(out, 'background-notices.txt'), said.map((n) => `${n.title} | ${n.body}`).join('\n'));
      check(!(await visible()), 'the shop came back by itself');
      await click(1);
      await sleep(800);
      check(await visible(), 'the notice did not bring the shop back');
      check(await shop.maybe('.result-card', 5000), 'no result card after clicking the notice');
      await shop.shot(join(out, 'background-result.png'));
      // Put away and clicked again: the card comes back.
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      await click(1);
      check(await shop.maybe('.result-card', 5000), 'the notice clicked again did not bring the card back');
    } finally { await shop.close(); }
  },

  /**
   * "Open in the tray when the computer starts" (B6): off at first; switched, Electron is asked with --tray (a stand-in in
   * isolate.cjs keeps the call, this computer's start-up list is never touched). Started with --tray, the window stays out
   * of sight. The Store build has no such switch.
   */
  async autostart(lang, out) {
    const T = locale(lang).ui.tray;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    let shop = await launch({ lang, home, speed: SPEED });
    const calls = () => shop.app.evaluate(() => globalThis.__sim.login);
    try {
      await shop.openSettings('work');
      const box = shop.page.locator('label.toggle', { hasText: T.openAtLoginToggle }).locator('input');
      check(!(await box.isChecked()), 'opening at login is on at first');
      await shop.page.locator('.settings-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
      await shop.shot(join(out, 'autostart-settings.png'));
      await box.check();
      await sleep(500);
      await box.uncheck();
      await sleep(500);
      const said = await calls();
      check(JSON.stringify(said) === JSON.stringify([{ openAtLogin: true, args: ['--tray'] }, { openAtLogin: false, args: ['--tray'] }]), `Electron was asked ${JSON.stringify(said)}`);
    } finally { await shop.close(); }
    shop = await launch({ lang, home, speed: SPEED, args: ['--tray'] });
    try {
      const shown = await shop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini')).isVisible());
      check(!shown, 'started with --tray, the window showed');
    } finally { await shop.close(); }
    shop = await launch({ lang, home, speed: SPEED, store: true });
    try {
      await shop.openSettings('work');
      check(await shop.page.locator('label.toggle', { hasText: T.openAtLoginToggle }).count() === 0, 'the Store build offers to open at login');
    } finally { await shop.close(); }
  },

  /**
   * A scheduled commission (B6): made from the project board's "do it regularly", which says the shop must be open; paused
   * and resumed from the tray's menu; then, the clock moved to just before it is due (LAMPLIGHT_CLOCK), the slip queues
   * itself and finishes as another round of the project. The tray's menu cannot be screenshot: its items are written out.
   */
  async scheduled(lang, out) {
    const L = locale(lang);
    const P = L.ui.projects;
    const S = P.schedule;
    const T = L.ui.tray;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const saved = () => JSON.parse(readFileSync(join(home.data, 'schedules.json'), 'utf8'));
    const menu = (shop) => shop.app.evaluate(() => globalThis.__sim.trayMenu.items.map((i) => (i.type === 'separator' ? '----' : `${i.type === 'checkbox' ? (i.checked ? '[x] ' : '[ ] ') : ''}${i.label}${i.enabled ? '' : ' (grey)'}`)));
    const want = lang === 'en' ? 'Add this week\'s visitors to the page' : '把这周的来客加到页面上';
    let shop = await launch({ lang, home, speed: SPEED });
    const fits = async (what) => {
      const spill = await shop.page.locator('.project-card').evaluate((c) => {
        const box = c.getBoundingClientRect();
        return c.scrollWidth > c.clientWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1;
      });
      check(!spill, `${what} does not fit the window`);
    };
    try {
      check((await runOne(shop, { template: 'page', want: W[lang].page })).ok, 'the first round did not finish');
      await shop.page.keyboard.press('Escape');
      await sleep(800);
      const idle = await menu(shop);
      check(idle.includes(`${T.idle} (grey)`) && idle.includes(`[ ] ${T.pauseSchedules}`), `the tray menu reads ${JSON.stringify(idle)}`);
      writeFileSync(join(out, 'tray-menu-idle.txt'), idle.join('\n'));
      await boardRows(shop);
      await shop.page.locator('.project-regular').first().click();
      await shop.page.waitForSelector('.schedule-card');
      await shop.page.fill('.schedule-want', want);
      await shop.page.selectOption('.schedule-kind', 'daily');
      await shop.page.fill('.schedule-time', '09:00');
      await shop.shot(join(out, 'schedule-panel.png'));
      await fits('the schedule card');
      await shop.page.selectOption('.schedule-kind', 'once');
      await shop.shot(join(out, 'schedule-panel-once.png'));
      await shop.page.selectOption('.schedule-kind', 'weekly');
      await shop.page.selectOption('.schedule-weekday', '1');
      await shop.page.locator('.schedule-save').click();
      await shop.page.waitForSelector('.project-card:not(.schedule-card) .projects-note');
      const note = await shop.page.locator('.projects-schedule-note').allInnerTexts();
      check(note.includes(S.closedNote), `the board does not say the shop must be open: ${JSON.stringify(note)}`);
      check(await shop.page.locator('.project-schedule').count() === 1, 'the board does not show the schedule');
      await shop.shot(join(out, 'schedule-board.png'));
      await shop.resize([640, 360]);
      await sleep(500);
      await fits('the board with a schedule');
      await shop.page.locator('.project-regular').first().click();
      await shop.page.waitForSelector('.schedule-card .schedule-item');
      await fits('the schedule card with its list');
      await shop.shot(join(out, 'schedule-panel-small.png'));
      await shop.resize('medium');
      // A daily one instead, at nine: the weekly one is stopped from its list.
      await shop.page.locator('.schedule-remove').click();
      await shop.page.waitForFunction(() => !document.querySelector('.schedule-item'));
      await shop.page.fill('.schedule-want', want);
      await shop.page.selectOption('.schedule-kind', 'daily');
      await shop.page.fill('.schedule-time', '09:00');
      await shop.page.locator('.schedule-save').click();
      await sleep(600);
      check(saved().length === 1 && saved()[0].every.kind === 'daily', `schedules.json has ${JSON.stringify(saved())}`);
      // Paused from the tray, and the board says so; resumed again.
      await shop.app.evaluate((_e, label) => globalThis.__sim.trayMenu.items.find((i) => i.label === label).click(), T.pauseSchedules);
      await sleep(400);
      check(JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).schedulesPaused === true, 'the tray did not pause the schedules');
      await shop.page.keyboard.press('Escape');
      await boardRows(shop);
      check((await shop.page.locator('.projects-schedule-note').allInnerTexts()).includes(S.paused), 'the board does not say the schedules are paused');
      await shop.app.evaluate((_e, label) => globalThis.__sim.trayMenu.items.find((i) => i.label === label).click(), T.pauseSchedules);
      await sleep(400);
      check(JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).schedulesPaused === false, 'the tray did not resume the schedules');
    } finally { await shop.close(); }

    // Twenty seconds before it is due.
    const due = new Date(saved()[0].next);
    shop = await launch({ lang, home, speed: SPEED, clock: localStamp(new Date(due.getTime() - 20_000)) });
    try {
      check(await waitForLog(home, 'schedule due', 1, 60_000), 'the schedule did not come due');
      check(await waitForLog(home, 'run start', 2, 10_000), 'the scheduled slip did not start');
      await sleep(1500);
      const busy = await menu(shop);
      const title = notebook().projects[0].title;
      check(busy.some((l) => l.includes(title) && l.includes(P.status.running)), `the tray menu does not list the round: ${JSON.stringify(busy)}`);
      writeFileSync(join(out, 'tray-menu-busy.txt'), busy.join('\n'));
      const r = await shop.workUntilDone({ answers: demoAnswers });
      check(r.ok, `the scheduled round did not finish: ${JSON.stringify(r.stopped ?? r).slice(0, 300)}`);
      await sleep(800);
      const s = saved()[0];
      check(s.last?.result === 'done' && new Date(s.next).getTime() === due.getTime() + 86_400_000, `schedules.json has ${JSON.stringify(s)}`);
      check(notebook().projects.length === 1 && notebook().projects[0].rounds.length === 2, 'the scheduled slip was not another round of the project');
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      await boardRows(shop);
      await shop.shot(join(out, 'schedule-board-done.png'));
    } finally { await shop.close(); }
  },

  /**
   * Missed while the shop was closed (B6): across one due time, two hours late, it runs once; across two, a day and more,
   * still only once, the older one skipped and said on the board.
   */
  async missed(lang, out) {
    const S = locale(lang).ui.projects.schedule;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const file = join(home.data, 'schedules.json');
    const want = lang === 'en' ? 'Add this week\'s visitors to the page' : '把这周的来客加到页面上';
    let shop = await launch({ lang, home, speed: SPEED, clock: '2026-11-15T12:00' });
    try {
      check((await runOne(shop, { template: 'page', want: W[lang].page })).ok, 'the first round did not finish');
    } finally { await shop.close(); }
    const project = notebook().projects[0].id;
    const nine = (day) => new Date(`2026-11-${day}T09:00`).toISOString();
    writeFileSync(file, JSON.stringify([{ id: 's1', project, form: { want }, every: { kind: 'daily', time: '09:00' }, next: nine(16), enabled: true }]));
    const reopen = async (clock, rounds) => {
      const starts = logged(home, 'run start').length;
      shop = await launch({ lang, home, speed: SPEED, clock });
      check(await waitForLog(home, 'run start', starts + 1, 20_000), `${clock}: the missed slip did not run`);
      check((await shop.workUntilDone({ answers: demoAnswers })).ok, `${clock}: the missed slip did not finish`);
      await sleep(4000);
      check(logged(home, 'run start').length === starts + 1, `${clock}: it ran more than once`);
      check(notebook().projects[0].rounds.length === rounds, `${clock}: the project has ${notebook().projects[0].rounds.length} rounds`);
    };
    try {
      // Closed across 16 Nov 09:00, open again at eleven.
      await reopen('2026-11-16T11:00', 2);
      let s = JSON.parse(readFileSync(file, 'utf8'))[0];
      check(s.next === nine(17) && !s.missed && s.last?.result === 'done', `after one: ${JSON.stringify(s)}`);
    } finally { await shop.close(); }
    try {
      // Closed across 17 and 18 Nov 09:00, open again at ten on the 18th: the 17th's is skipped, the 18th's runs.
      await reopen('2026-11-18T10:00', 3);
      const s = JSON.parse(readFileSync(file, 'utf8'))[0];
      check(s.next === nine(19) && s.missed === nine(17), `after two: ${JSON.stringify(s)}`);
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      await boardRows(shop);
      const line = await shop.page.locator('.project-schedule').innerText();
      check(line.includes(S.missed.split('{at}')[0].trim()), `the board does not say which was missed: ${line}`);
      await shop.shot(join(out, 'missed-board.png'));
    } finally { await shop.close(); }
  },

  /** Furnishing: pick a wall, curtains and a rug; they stay after a restart; the study keeps its own. */
  async furnish(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    let shop = await launch({ lang, home, speed: SPEED });
    try {
      await shop.openSettings('furnish');
      for (const [part, choice] of [['wall', 'sage'], ['curtain', 'blue'], ['rug', 'green']]) {
        await shop.page.locator('.settings .swatches').nth(['wall', 'curtain', 'rug'].indexOf(part)).locator(`button.swatch[data-choice="${choice}"]`).click();
        await sleep(300);
      }
      await shop.shot(join(out, 'furnish-settings.png'));
      // The room is what is being chosen for: the card stands beside the rug, with no empty paper under the swatches.
      const seen = await shop.page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect();
        const canvas = box(document.querySelector('canvas'));
        const body = document.querySelector('.settings .settings-body');
        return { cardLeft: box(document.querySelector('.settings')).left, rugRight: canvas.left + (189 / 320) * canvas.width, spare: box(body).bottom - box(body.lastElementChild).bottom };
      });
      // Some room is needed: the ring round the chosen swatch reaches past the button and the body clips it.
      check(seen.spare >= 6 && seen.spare <= 16, `paper under the swatches: ${JSON.stringify(seen)}`);
      check(seen.cardLeft >= seen.rugRight, `the card covers the rug: ${JSON.stringify(seen)}`);
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      await shop.shot(join(out, 'furnish-cafe.png'));
      await shop.close();
      shop = await launch({ lang, home, speed: SPEED });
      const saved = JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).furnish;
      check(saved.cafe.wall === 'sage' && saved.cafe.curtain === 'blue' && saved.cafe.rug === 'green', `not saved: ${JSON.stringify(saved)}`);
      check(saved.study.wall === 'default', 'the study changed too');
      await shop.shot(join(out, 'furnish-after-restart.png'));
    } finally { await shop.close(); }
  },

  /** The study at home: same work, its own furniture and lines. */
  /**
   * The three new shops (road-to-1.4.md D2): gone into from the street without moving the home shop, each with its own
   * person, who takes a commission round the room's places while the home crew stays home. By day, by night and in a
   * small window; back home through the cafe's front, and the app opens at home again. All on one page: going in builds
   * the room in place (D2, second half), and while it works the door to another room stays shut.
   */
  async shops(lang, out) {
    const WHO = { print: 'aqian', studio: 'xiaozhe', workshop: 'xiaoding' };
    // A kind of work each shop does itself (road-to-1.4.md D3), so the order is played in the shop it is placed in.
    const KIND = { print: 'document', studio: 'chart', workshop: 'page' };
    const HOME_CREW = ['xiaoju', 'laoshi', 'qingdai', 'xiaodou', 'cat'];
    const room = (page) => page.evaluate(() => window.lamplightDebug.scene.room);
    const visit = async (page, id) => {
      await page.evaluate((i) => window.lamplightDebug.street.onFront(i, true), id);
      for (const end = Date.now() + 15_000; Date.now() < end; await sleep(300)) {
        if (await room(page).catch(() => null) === id && await page.locator('.toolbar').count()) break;
      }
      await sleep(2500);
      check(await page.evaluate(() => window.samePage === true), `going into the ${id} reloaded the page`);
    };
    // Marks the page, and the home shop's room, to see later that neither was made again.
    const mark = (page) => page.evaluate(() => { window.samePage = true; window.homeRoom = window.lamplightDebug.scene; });
    for (const size of [undefined, [640, 360]]) {
      const small = size ? '-640' : '';
      const home = freshHome({ 'settings.json': onboarded(lang) });
      // Each round is held halfway until the scenario has been home and back: a quick round would otherwise be over first.
      const hold = join(home.home, 'hold');
      const shop = await launch({ lang, home, speed: SPEED, scenario: 'hold', simEnv: { SIM_HOLD: hold }, ...(size ? { size } : {}) });
      const { page } = shop;
      try {
        await sleep(2500);
        await mark(page);
        for (const [id, person] of Object.entries(WHO)) {
          await visit(page, id);
          check(await room(page) === id, `${id}: did not go in`);
          check(JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).scene === 'cafe', `${id}: going in moved the home shop`);
          const who = () => page.evaluate((ids) => Object.fromEntries(ids.map((a) => [a, window.lamplightDebug.scene.anchorOf(a)])), ['adeng', person, ...HOME_CREW]);
          const first = await who();
          // Adeng only comes in with an order (D3).
          check(first[person] !== null && first.adeng === null, `${id}: ${person} is not there, or Adeng is: ${JSON.stringify(first)}`);
          check(HOME_CREW.every((a) => first[a] === null), `${id}: someone from home is here: ${JSON.stringify(first)}`);
          check(await page.evaluate((a) => window.lamplightDebug.scene.textures.exists(a), person), `${id}: ${person} has no picture`);
          if (size) {
            await shop.shot(join(out, `shops-${id}${small}.png`));
            continue;
          }
          for (const period of ['day', 'night']) {
            await page.evaluate((x) => window.lamplightDebug.scene.setPeriod(x, true), period);
            await sleep(600);
            await shop.shot(join(out, `shops-${id}-${period}.png`));
          }
          await page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
          const places = new Set();
          let homeSeen = '';
          const starts = logged(home, 'run start').length;
          writeFileSync(hold, '');
          await shop.order({ template: KIND[id], want: W[lang][KIND[id]] });
          await shop.submit();
          check(await waitForLog(home, 'run start', starts + 1, 10_000), `${id}: the commission did not start`);
          // Where the person goes over the whole round, looked at in the page: the scenario steps out for part of it.
          await page.evaluate((a) => {
            window.workRoom = window.lamplightDebug.scene;
            window.places = new Set();
            window.placeTimer = setInterval(() => { const at = window.workRoom.anchorOf(a); if (at) window.places.add(at); }, 100);
          }, person);
          // While this room works, home is a door away (D3); back again, it is the same room, still at work.
          await visit(page, 'cafe');
          check(await room(page) === 'cafe', `${id}: could not go home while the work went on`);
          check(await page.evaluate((r) => Boolean(window.lamplightDebug.rooms.get(r)), id), `${id}: the room was taken down while it worked`);
          await visit(page, id);
          check(await page.evaluate(() => window.lamplightDebug.scene === window.workRoom), `${id}: the room was built again`);
          rmSync(hold, { force: true });
          const done = await shop.workUntilDone({
            onTick: async () => {
              const now = await who();
              if (now[person]) places.add(now[person]);
              const stray = HOME_CREW.find((a) => now[a] !== null);
              if (stray) homeSeen = stray;
            },
          });
          check(done.ok, `${id}: the commission did not finish: ${JSON.stringify(done).slice(0, 300)}`);
          for (const at of await page.evaluate(() => { clearInterval(window.placeTimer); return [...window.places]; })) places.add(at);
          check(places.size >= 2, `${id}: ${person} only went to ${[...places]}`);
          check(!homeSeen, `${id}: ${homeSeen} turned up from home`);
          await shop.shot(join(out, `shops-${id}-done.png`));
          const parcels = await page.locator('.parcel .card-title').allInnerTexts();
          check(parcels.every((t) => t.includes(locale(lang).actors[person])), `${id}: a parcel names someone not here: ${parcels}`);
          await page.keyboard.press('Escape');
          await sleep(500);
          // Every place in the room, walked to in the app, once the stage has played out what the work left: in a fast run
          // every event of the round lands on the one person, so they have a queue of moves to finish first.
          const drained = Date.now();
          const left = () => page.evaluate((a) => { const d = window.lamplightDebug.stage.director; return (d.queues.get(a)?.length ?? 0) + (d.current.has(a) ? 1 : 0); }, person);
          for (const end = Date.now() + 120_000; (await left()) > 0 && Date.now() < end;) await sleep(500);
          console.log(`  ${id}: ${person} played out the round ${Math.round((Date.now() - drained) / 1000)} s after it ended`);
          await sleep(1000);
          for (const spot of ['board', 'shelf', 'table', 'corner', 'counter']) {
            // Idle wandering may send them elsewhere on the way: a few tries.
            let at = null;
            for (let k = 0; k < 3 && at !== spot; k++) at = await page.evaluate(async ([a, s]) => { await window.lamplightDebug.scene.walkTo(a, s); return window.lamplightDebug.scene.anchorOf(a); }, [person, spot]);
            check(at === spot, `${id}: ${person} did not get to the ${spot} (${at})`);
          }
        }
        await visit(page, 'cafe');
        check(await room(page) === 'cafe', 'did not get back home');
        check(await page.evaluate(() => window.lamplightDebug.scene === window.homeRoom), 'the home shop was built again');
        const kept = await page.evaluate(() => Object.keys(window.lamplightDebug.scene.game.scene.keys));
        check(['print', 'studio', 'workshop'].every((r) => !kept.includes(r)), `rooms left behind are still there: ${kept}`);
        const back = await page.evaluate(() => ['xiaoju', 'laoshi', 'qingdai'].map((a) => window.lamplightDebug.scene.anchorOf(a)));
        check(back.every((a) => a !== null), `the home crew is not home: ${back}`);
      } finally { await shop.close(); }
      if (size) continue;
      // Closed while in another shop: it opens at home again.
      let again = await launch({ lang, home, speed: SPEED });
      try {
        await sleep(2500);
        await mark(again.page);
        await visit(again.page, 'studio');
        check(await room(again.page) === 'studio', 'did not go into the studio');
      } finally { await again.close(); }
      again = await launch({ lang, home, speed: SPEED });
      try {
        await sleep(2500);
        check(await room(again.page) === 'cafe', 'the app did not open at home after a visit');
      } finally { await again.close(); }
    }
  },

  /**
   * The old shop moves into the town (road-to-1.4.md D7): a 1.3 shop opens onto the street and the four carry it in;
   * back inside, all it had gathered settles into place and every work is on the shelf. Opened again, it stays put.
   * Another 1.3 shop cuts the move short with a click, and the click does nothing else.
   */
  async movetown(lang, out) {
    const L = locale(lang);
    const ids = ['painting', 'plant', 'lights', 'fruit'];
    const works = Array.from({ length: 2 }, (_, i) => ({ id: `c${1760000000000 + i * 86400000}`, title: `work ${i + 1}`, date: '2025-10-09', result: 'done', choices: {}, folder: 'C:/nowhere', form: { want: 'x', template: 'page' } }));
    const memory = { commissions: works, stuckNotes: [], greeted: works[1].id, shop: { done: 5, told: [], grown: ids.map((id) => ({ id, date: '2026-10-20' })), met: [] } };
    const seed = () => freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory), 'data-version.json': JSON.stringify({ data: 4 }) });
    const saved = (home) => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const look = (page) => page.evaluate((ids) => {
      const d = window.lamplightDebug;
      return { out: d.street.sys.isActive() && d.street.sys.isVisible(), shown: ids.filter((id) => d.scene.growth.shows(id)), note: document.querySelector('.street-note:not([hidden])')?.textContent ?? '' };
    }, ids);
    const until = async (page, test, ms) => {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (test(await look(page))) return true;
      return false;
    };

    // Watched to the end.
    const home = seed();
    let shop = await launch({ lang, home, speed: SPEED, movetown: true });
    try {
      check(await until(shop.page, (s) => s.out, 15_000), 'the shop did not go out onto the street to move');
      await sleep(3000);
      const moving = await look(shop.page);
      check(moving.note === L.ui.town.moving, `the move does not say what is going on: "${moving.note}"`);
      check(moving.shown.length === 0, `things already stand in the shop before it has moved: ${moving.shown}`);
      await shop.shot(join(out, 'movetown-street.png'));
      check(await until(shop.page, (s) => !s.out, 20_000), 'the move never finished');
      await sleep(2500);
      check((await look(shop.page)).shown.length === ids.length, `not everything it had gathered is back: ${(await look(shop.page)).shown}`);
      await shop.shot(join(out, 'movetown-inside.png'));
      const after = saved(home);
      check(after.shop.told.includes('town-move'), 'the move was not written down');
      check(JSON.stringify(after.shop.town) === JSON.stringify({ shops: {}, street: [], stories: {} }), `the town is not the right shape: ${JSON.stringify(after.shop.town)}`);
      check(JSON.stringify(after.shop.grown.map((g) => g.id)) === JSON.stringify(ids) && after.shop.done === 5, 'what the shop had gathered changed');
      check(readdirSync(join(home.data, 'backup')).some((d) => d.endsWith('-v4')), 'no copy of the 1.3 data');
      await shop.page.locator('.toolbar button.tool-btn').nth(2).click();
      await shop.page.waitForSelector('.shelf-card');
      check(await shop.page.locator('.shelf-card li.work').count() === works.length, 'works are missing from the shelf');
      await shop.page.keyboard.press('Escape');
    } finally { await shop.close(); }
    shop = await launch({ lang, home, speed: SPEED, movetown: true });
    try {
      check(!(await until(shop.page, (s) => s.out, 8000)), 'the shop moved a second time');
      check((await look(shop.page)).shown.length === ids.length, 'the things are not in the shop the next time');
    } finally { await shop.close(); }

    // Cut short with a click.
    const other = seed();
    shop = await launch({ lang, home: other, speed: SPEED, movetown: true });
    try {
      check(await until(shop.page, (s) => s.out, 15_000), 'the second shop did not go out to move');
      await sleep(1000);
      await shop.page.mouse.click(300, 220);
      check(await until(shop.page, (s) => !s.out, 2000), 'a click did not cut the move short');
      await sleep(500);
      { const solid = await shop.page.evaluate((ids) => ids.filter((id) => window.lamplightDebug.scene.growth.pieces.get(id)?.alpha === 1), ids); check(solid.length === ids.length, `cut short, the things are not all in place at once: ${solid}`); }
      check(await shop.page.locator('.backdrop').count() === 0, 'the click that cut the move short also opened something');
      check(saved(other).shop.told.includes('town-move'), 'the move cut short was not written down');
      await shop.shot(join(out, 'movetown-skipped.png'));
    } finally { await shop.close(); }
  },

  /**
   * The town grows with the work (road-to-1.4.md D5): a shop with 0, 10, 30 and 100 commissions done, split between the
   * home shop and the shops along the street, opens onto a street with that much grown on it, each front by its own
   * count; inside the print shop its own pieces hang. Then a commission brings the lamps, and someone says so.
   */
  async towngrow(lang, out) {
    const L = locale(lang);
    const town = JSON.parse(readFileSync(join(ROOT, 'assets/sprites/town.json'), 'utf8'));
    const STREET = [['lamps', 3], ['bench', 6], ['flowers', 10], ['stall', 20], ['park', 40], ['fountain', 70]];
    const FRONT = [['pot', 2], ['sign', 8], ['bunting', 20]];
    const due = (list, n) => list.filter(([, at]) => n >= at).map(([id]) => id);
    // How many of the total each shop along the street did; the home shop did the rest.
    const SPLITS = { 0: {}, 10: { print: 8 }, 30: { print: 20, studio: 3, workshop: 2 }, 100: { print: 30, studio: 25, workshop: 20 } };
    const seed = (done, split) => freshHome({
      'settings.json': onboarded(lang),
      'data-version.json': JSON.stringify({ data: 5 }),
      'memory.json': JSON.stringify({
        commissions: [], stuckNotes: [], greeted: 'c1',
        shop: { done, told: ['town-move'], grown: [], met: [], town: { shops: Object.fromEntries(Object.entries(split).map(([s, n]) => [s, { done: n, grown: [] }])), street: [], stories: {} } },
      }),
    });
    const goOut = async (page) => {
      // A plain day: a festival would put the cart away (D6).
      await page.evaluate(() => window.lamplightDebug.scene.setWeather('clear', null, false));
      await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.street}"]`).click();
      await sleep(800);
      await page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
      await sleep(300);
    };
    const shown = (page) => page.evaluate(() => {
      const g = window.lamplightDebug.street.growth;
      const ids = ['lamps', 'bench', 'flowers', 'stall', 'park', 'fountain'];
      const fronts = Object.fromEntries(['cafe', 'study', 'print', 'studio', 'workshop'].map((s) => [s, ['pot', 'sign', 'bunting'].filter((id) => g.shows(id, s))]));
      return { street: ids.filter((id) => g.shows(id)), fronts };
    });
    const scrollTo = (page, x) => page.evaluate((x) => { window.lamplightDebug.street.cameras.main.scrollX = x; }, x);

    for (const [done, split] of Object.entries(SPLITS).map(([d, s]) => [Number(d), s])) {
      const shop = await launch({ lang, home: seed(done, split), speed: SPEED });
      const { page } = shop;
      try {
        await sleep(2500);
        await goOut(page);
        const v = await shown(page);
        check(JSON.stringify(v.street) === JSON.stringify(due(STREET, done)), `${done} done: the street shows ${v.street}`);
        const own = { cafe: done - Object.values(split).reduce((a, b) => a + b, 0), study: 0, print: 0, studio: 0, workshop: 0, ...split };
        for (const [s, n] of Object.entries(own)) check(JSON.stringify(v.fronts[s]) === JSON.stringify(due(FRONT, n)), `${done} done: the ${s} front shows ${v.fronts[s]} for ${n} of its own`);
        await scrollTo(page, 0);
        await sleep(300);
        await shop.shot(join(out, `towngrow-${done}-home.png`));
        await scrollTo(page, town.lot.x + town.lot.w / 2 - 160);
        await sleep(300);
        await shop.shot(join(out, `towngrow-${done}-lot.png`));
        if (done === 100) {
          await page.evaluate(() => window.lamplightDebug.street.lookAt('print'));
          await sleep(300);
          await shop.shot(join(out, 'towngrow-100-print-front.png'));
          await page.keyboard.press('Enter');
          await sleep(1500);
          const inside = await page.evaluate(() => {
            const room = window.lamplightDebug.rooms.get('print')?.scene;
            return { here: window.lamplightDebug.scene.room, pieces: ['print-proof', 'print-ivy', 'print-typecase', 'print-ribbon'].filter((id) => room?.growth.shows(id)) };
          });
          check(inside.here === 'print', `Enter in front of the print shop went to ${inside.here}`);
          check(inside.pieces.length === 4, `the print shop with thirty of its own shows ${inside.pieces}`);
          await shop.shot(join(out, 'towngrow-100-print-inside.png'));
        }
      } finally { await shop.close(); }
    }

    // A commission done that brings the lamps: they are on the street, and someone says so in the shop.
    const lamps = lang === 'en' ? 'Two new lamps on the street!' : '街上多了两盏路灯。';
    const home = seed(2, {});
    const shop = await launch({ lang, home, debug: true, speed: 100 });
    try {
      await sleep(2000);
      await shop.page.evaluate(() => {
        window.heard = [];
        setInterval(() => {
          const now = document.getElementById('labels').innerText;
          if (window.heard.at(-1) !== now) window.heard.push(now);
        }, 200);
      });
      await shop.order({ template: 'demo' });
      await shop.submit();
      check((await shop.workUntilDone()).ok, 'the commission did not finish');
      await sleep(1500);
      await shop.page.keyboard.press('Escape');
      let said = false;
      for (const start = Date.now(); !said && Date.now() - start < 40_000; await sleep(500)) {
        said = await shop.page.evaluate((w) => window.heard.some((h) => h.includes(w)), lamps);
      }
      check(said, 'nobody said the street has new lamps');
      await shop.shot(join(out, 'towngrow-lamps-line.png'));
      const saved = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
      check(saved.shop.town.street.map((g) => g.id).join() === 'lamps', `the day the lamps came was not written down: ${JSON.stringify(saved.shop.town.street)}`);
      await goOut(shop.page);
      check((await shown(shop.page)).street.join() === 'lamps', 'the new lamps are not on the street');
    } finally { await shop.close(); }
  },

  /**
   * The neighbours' stories (road-to-1.4.md D4): a shop that has done 50, opened on the days the chapters come, 30 days in
   * all. Each time Old Zhou, Granny Chen and Xiaohe wait at their places with a bubble; a click opens the chapter, closing
   * it writes it down and leaves its thing on the street. A day too early nobody waits; at the end all fifteen things are
   * there and nobody waits any more.
   */
  async stories(lang, out) {
    const L = locale(lang);
    const book = parseYaml(readFileSync(join(ROOT, lang === 'en' ? 'lines/en/stories.yaml' : 'lines/stories.yaml'), 'utf8'));
    const art = JSON.parse(readFileSync(join(ROOT, 'assets/sprites/town-story.json'), 'utf8'));
    const TELLERS = ['mechanic', 'granny', 'student'];
    const home = freshHome({
      'settings.json': onboarded(lang),
      'data-version.json': JSON.stringify({ data: 5 }),
      'memory.json': JSON.stringify({
        commissions: [], stuckNotes: [], greeted: 'c1',
        shop: { done: 50, told: ['town-move'], grown: [], met: [], town: { shops: {}, street: [], stories: {} } },
      }),
    });
    const goOut = async (page) => {
      await page.evaluate(() => window.lamplightDebug.scene.setWeather('clear', null, false));
      await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.street}"]`).click();
      await sleep(1000);
      await page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
      await sleep(300);
    };
    const seen = (page) => page.evaluate((ids) => {
      const s = window.lamplightDebug.street.stories;
      return { waiting: s.waiting(), left: ids.filter((id) => s.shows(id)) };
    }, art.parts.map((p) => p.id));
    const scrollTo = async (page, x) => {
      await page.evaluate((x) => { window.lamplightDebug.street.cameras.main.scrollX = Math.round(Math.max(0, Math.min(x - 160, 1128 - 320))); }, x);
      await sleep(300);
    };
    const saved = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).shop.town.stories;
    // The days the chapters come (0, 3, 4, 5 and 7 days apart) and the day before the second, when nobody waits.
    const DAYS = [['2026-11-20', 1], ['2026-11-22', 0], ['2026-11-23', 2], ['2026-11-27', 3], ['2026-12-02', 4], ['2026-12-09', 5], ['2026-12-20', 0]];
    for (const [day, chapter] of DAYS) {
      const shop = await launch({ lang, home, speed: SPEED, clock: `${day}T10:00` });
      const { page } = shop;
      try {
        await sleep(2500);
        await goOut(page);
        let v = await seen(page);
        const told = chapter ? chapter - 1 : Math.min(5, DAYS.filter(([d, c]) => c && d < day).length);
        check(v.left.length === told * 3, `${day}: ${v.left.length} things on the street after ${told} chapters each`);
        if (!chapter) {
          check(v.waiting.length === 0, `${day}: ${v.waiting} waiting on a day with no chapter`);
          if (told === 5) {
            for (const [name, x] of [['cafe', 80], ['study', 260], ['workshop', 615]]) {
              await scrollTo(page, x);
              await shop.shot(join(out, `stories-all-${name}.png`));
            }
          }
          continue;
        }
        check(JSON.stringify(v.waiting) === JSON.stringify(TELLERS), `${day}: waiting ${v.waiting}, not all three`);
        if (chapter === 1) {
          await scrollTo(page, 260);
          await shop.shot(join(out, 'stories-waiting-study.png'));
        }
        for (const who of TELLERS) {
          const at = art.waits[who];
          await scrollTo(page, at.x);
          const spot = await page.evaluate((w) => window.lamplightDebug.street.stories.spot(w), who);
          const scroll = await page.evaluate(() => window.lamplightDebug.street.cameras.main.scrollX);
          const box = await page.locator('#game canvas').boundingBox();
          const k = box.width / 320;
          await page.mouse.click(box.x + (spot.x - scroll) * k, box.y + spot.y * k);
          await sleep(600);
          const card = page.locator(`.story-card[data-teller="${who}"][data-chapter="${chapter}"]`);
          check(await card.count() === 1, `${day}: clicking ${who} opened no card for chapter ${chapter}`);
          const c = book[who][chapter - 1];
          const text = await card.innerText();
          check(text.includes(L.guests[who]) && text.includes(c.title) && text.includes(c.lines[0]) && text.includes(c.note), `${day}: ${who}'s card does not tell chapter ${chapter}: ${text}`);
          if (chapter === 1 || chapter === 5) await shop.shot(join(out, `stories-${who}-${chapter}-card.png`));
          await card.locator('button.primary').click();
          await sleep(800);
          v = await seen(page);
          check(!v.waiting.includes(who), `${day}: ${who} still waits after telling chapter ${chapter}`);
          check(v.left.includes(c.left), `${day}: ${c.left} is not on the street after ${who}'s chapter ${chapter}`);
          check((saved()[who] ?? []).length === chapter && saved()[who].at(-1) === day, `${day}: ${who}'s chapters were not written down: ${JSON.stringify(saved())}`);
          // Nobody waits where they stood now: a click there is a click on the front behind (D1).
          check(await page.evaluate((p) => window.lamplightDebug.street.stories.at(p.x, p.y), spot) === null, `${day}: ${who} still answers a click after chapter ${chapter}`);
        }
        if (chapter === 5) {
          await scrollTo(page, 615);
          await shop.shot(join(out, 'stories-5-workshop.png'));
        }
      } finally { await shop.close(); }
    }
  },

  /**
   * The shop on the home network (docs/plan-1.5.md E1): off at first; switched on in settings it shows where it listens,
   * a QR code pairs a phone (a real Chrome at phone size), the phone sees what goes on during a commission, and once the
   * desktop removes it the phone is refused at once.
   */
  async lan(lang, out) {
    const L = locale(lang);
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED });
    const { chromium } = createRequire(import.meta.url)('playwright');
    const browser = await chromium.launch({ channel: 'chrome' });
    const { page } = shop;
    try {
      await sleep(2000);
      await shop.openSettings('work');
      check(await page.locator('.settings .lan').count() === 1, 'no home-network section in settings');
      check(await page.locator('.settings .lan-address').count() === 0, 'the home-network connection is on before it was switched on');
      await page.locator('label.toggle', { hasText: L.ui.lan.toggle }).click();
      await sleep(1500);
      const address = await page.locator('.settings .lan-address').innerText();
      check(/(^|\D)(10|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+:\d+/.test(address), `it does not listen on a home-network address: ${address}`);
      const port = JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).lanPort;
      check(port >= 47800 && address.includes(`:${port}`), `the port was not picked and kept: ${port}`);
      await page.locator('.settings .lan-pair').click();
      await page.waitForSelector('.settings .lan-qr svg', { timeout: 5000 });
      const url = await page.locator('.settings .lan-qr').getAttribute('data-url');
      await page.locator('.settings .lan-qr').scrollIntoViewIfNeeded();
      await shop.shot(join(out, 'lan-settings-qr.png'));

      const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
      await phone.goto(url);
      await phone.waitForFunction((w) => document.getElementById('state')?.textContent === w, L.ui.lan.page.connected, { timeout: 10_000 });
      check(!(await phone.evaluate(() => location.hash)), 'the key stayed in the address bar on the phone');
      await sleep(2500);
      check(await page.locator('.settings .lan-devices li[data-paired="true"]').count() === 1, 'the desktop does not show the phone as paired');
      await page.keyboard.press('Escape');
      await sleep(300);

      await shop.order({ template: 'demo' });
      await shop.submit();
      await phone.waitForFunction(() => document.querySelectorAll('#events li').length > 0, null, { timeout: 30_000 });
      await phone.screenshot({ path: join(out, 'lan-phone-events.png') });
      check((await shop.workUntilDone()).ok, 'the commission did not finish');

      await shop.openSettings('work');
      await page.locator('.settings .lan-devices li button.link').first().click();
      await phone.waitForFunction((w) => document.getElementById('state')?.textContent === w, L.ui.lan.page.refused, { timeout: 10_000 });
      await phone.screenshot({ path: join(out, 'lan-phone-removed.png') });
      check(await page.locator('.settings .lan-devices li').count() === 0, 'the removed phone is still listed');
    } finally {
      await browser.close();
      await shop.close();
    }
  },

  /**
   * The town's street (road-to-1.4.md D1): out of the door from the toolbar and back in on the same page, along the
   * street with the arrow keys, a front not open yet saying so, back in through the shop's own front and with Escape.
   * By day, by night and in a small window.
   */
  async street(lang, out) {
    const town = JSON.parse(readFileSync(join(ROOT, 'assets/sprites/town.json'), 'utf8'));
    const L = locale(lang);
    for (const size of [undefined, [640, 360]]) {
      const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), speed: SPEED, ...(size ? { size } : {}) });
      const { page } = shop;
      const small = size ? '-640' : '';
      try {
        await sleep(2500);
        await page.evaluate(() => { window.samePage = true; });
        const look = () => page.evaluate(() => {
          const g = window.lamplightDebug.street;
          return { out: g.sys.isActive() && g.sys.isVisible(), x: g.cameras.main.scrollX, room: window.lamplightDebug.scene.sys.isVisible(), same: window.samePage === true };
        });
        /** Click a front, in the middle of its upper floor, with the street scrolled to it. */
        const clickFront = async (id) => {
          const f = town.fronts.find((x) => x.id === id);
          await page.evaluate((i) => window.lamplightDebug.street.lookAt(i), id);
          await sleep(200);
          const { x: scroll } = await look();
          const box = await page.locator('#game canvas').boundingBox();
          const k = box.width / 320;
          await page.mouse.click(box.x + (f.x + f.w / 2 - scroll) * k, box.y + 60 * k);
          await sleep(500);
        };
        await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.street}"]`).click();
        await sleep(800);
        let v = await look();
        check(v.out && !v.room, `the street did not show${small}`);
        check(await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.back}"]`).count() === 1, 'the street button does not say it takes you back in');
        for (const period of size ? ['day'] : ['day', 'night']) {
          await page.evaluate((x) => window.lamplightDebug.scene.setPeriod(x, true), period);
          await sleep(300);
          await shop.shot(join(out, `street-${period}${small}.png`));
        }
        await page.evaluate(() => window.lamplightDebug.scene.setPeriod('day', true));
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
        await sleep(200);
        const along = await look();
        check(along.x > v.x, 'the arrow keys do not move along the street');
        await clickFront('bakery');
        check((await page.locator('.street-note').innerText()) === L.ui.town.notes.bakery, 'the bakery does not say it is the neighbours');
        await shop.shot(join(out, `street-closed${small}.png`));
        v = await look();
        check(v.out, 'a front not open yet took me somewhere');
        await clickFront('cafe');
        v = await look();
        check(!v.out && v.room && v.same, `going in at the cafe did not bring the room back on the same page: ${JSON.stringify(v)} ${await page.evaluate(() => document.elementFromPoint(innerWidth * 0.25, innerHeight * 0.33)?.className)}`);
        await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.street}"]`).click();
        await sleep(500);
        await page.keyboard.press('Escape');
        await sleep(500);
        v = await look();
        check(!v.out && v.room && v.same, 'Escape on the street did not bring me back inside');
        if (!size) {
          // An errand (D1, second half): Xiaoju in the inset, and the same Xiaoju out on the town's street. She is sent
          // out directly; how commissions send her is the apprentice scenario's.
          await page.evaluate(() => { void window.lamplightDebug.scene.walkTo('xiaoju', 'door'); });
          let w = null;
          for (let i = 0; i < 60 && !(w && w.alpha === 1); i++) {
            await sleep(500);
            w = await page.evaluate(() => window.lamplightDebug.scene.streetWalker());
          }
          check(w && w.actor === 'xiaoju', `Xiaoju did not go out on the street: ${JSON.stringify(w)}`);
          await shop.shot(join(out, 'street-inset.png'));
          await page.locator(`.toolbar button.tool-btn[aria-label="${L.ui.toolbar.street}"]`).click();
          await sleep(600);
          const seen = await page.evaluate(() => {
            const g = window.lamplightDebug.street;
            // The one out on an errand, not a neighbour waiting with a story (D4).
            const s = g.seen;
            return s ? { visible: s.visible, x: s.x, y: s.y, cam: g.cameras.main.scrollX, inset: window.lamplightDebug.scene.streetWalker() } : null;
          });
          await shop.shot(join(out, 'street-errand.png'));
          check(seen && seen.visible && seen.x >= seen.cam && seen.x <= seen.cam + 320, `Xiaoju out on an errand was not in view on the street: ${JSON.stringify(seen)}`);
          // Read a frame or two apart while she walks: a few pixels.
          check(seen && Math.abs(seen.x - seen.inset.x) < 8 && Math.abs(seen.y - seen.inset.y) < 8, `the street and the inset show her in different places: ${JSON.stringify(seen)}`);
          await page.keyboard.press('Escape');
          await sleep(300);
        }
      } finally { await shop.close(); }
    }
  },

  async study(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang, { scene: 'study' }) });
    const shop = await launch({ lang, home, speed: SPEED });
    try {
      await shop.shot(join(out, 'study.png'));
      await shop.openSettings('furnish');
      await sleep(300);
      await shop.shot(join(out, 'study-furnish.png'));
      const clear = await shop.page.evaluate(() => {
        const canvas = document.querySelector('canvas').getBoundingClientRect();
        return document.querySelector('.settings').getBoundingClientRect().left >= canvas.left + (180 / 320) * canvas.width;
      });
      check(clear, 'the card covers the rug in the study');
      await shop.page.keyboard.press('Escape');
      await sleep(300);
      const r = await runOne(shop, { template: 'plan', want: W[lang].plan });
      check(r.ok, 'did not finish in the study');
    } finally { await shop.close(); }
  },

  /** The corner window: shows who is busy and which item of the plan is under way while the shop is minimised. */
  async mini(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: Math.max(SPEED, 1200) });
    try {
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      await sleep(3000);
      const mini = await shop.away();
      if (process.env.SIM_DEBUG) console.log('mini: away');
      const text = await mini.evaluate(() => document.body.innerText);
      if (process.env.SIM_DEBUG) console.log('mini:', text);
      await mini.screenshot({ path: join(out, 'mini.png') });
      check(/\d/.test(text), `corner window shows no step count: ${JSON.stringify(text)}`);
      check(!/在忙：|Busy:/.test(text), `corner window puts a label in front of what is happening: ${JSON.stringify(text)}`);
    } finally { await shop.close(); }
  },

  /** The page walk: at three window sizes, every main card fits inside the window. */
  async walk(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const s = samples(home);
    const many = Array.from({ length: 12 }, (_, i) => {
      const file = join(home.home, 'samples', `a-rather-long-name-for-a-handed-over-file-${i + 1}.txt`);
      writeFileSync(file, 'x');
      return file;
    });
    const shop = await launch({ lang, home, speed: SPEED });
    const fits = async (selector, what) => {
      const box = await shop.page.locator(selector).first().boundingBox();
      const view = shop.page.viewportSize() ?? await shop.page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      check(box, `${what}: not shown`);
      check(box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1,
        `${what} does not fit ${view.width}x${view.height}: ${JSON.stringify(box)}`);
    };
    try {
      check((await runOne(shop, { template: 'letter', want: W[lang].letter })).ok, 'first commission did not finish');
      await shop.page.keyboard.press('Escape');
      for (const size of ['small', 'medium', 'large']) {
        await shop.resize(size);
        await shop.shot(join(out, `walk-${size}-shop.png`));
        await shop.order({ template: 'album', want: W[lang].album, files: s.photos });
        await fits('form.commission', `${size} commission slip`);
        // What people type is in the plain face, like every other box: the handwriting font has only the shop's own words.
        const typed = await shop.page.locator('form.commission textarea').first().evaluate((e) => getComputedStyle(e).fontFamily);
        check(!typed.includes('Lamplight Hand'), `the slip's text box uses the handwriting font: ${typed}`);
        await shop.shot(join(out, `walk-${size}-slip.png`));
        await shop.page.keyboard.press('Escape');
        await sleep(300);
        // Many files with long names: the slip stays inside the window and its buttons can still be reached.
        await shop.order({ template: 'letter', want: W[lang].letter, files: many });
        await fits('form.commission', `${size} commission slip with many files`);
        await fits('form.commission .actions button.default', `${size} commission slip's hand-in button`);
        await shop.shot(join(out, `walk-${size}-slip-many.png`));
        await shop.page.keyboard.press('Escape');
        await sleep(300);
        for (const tab of ['basics', 'furnish', 'sight', 'work', 'about']) {
          await shop.openSettings(tab);
          await fits('.card.settings', `${size} settings ${tab}`);
          if (tab === 'basics' || tab === 'furnish') await shop.shot(join(out, `walk-${size}-settings-${tab}.png`));
          await shop.page.keyboard.press('Escape');
          await sleep(300);
        }
        await shop.hotspot(shop.L.ui.access.hotspotWorks);
        await fits('.card', `${size} works shelf`);
        await shop.shot(join(out, `walk-${size}-shelf.png`));
        await shop.page.keyboard.press('Escape');
        await sleep(300);
      }
    } finally { await shop.close(); }
  },

  /**
   * Upgrading: the data folders a shop had under 0.5.0, 0.6.1 and 0.7.0 (made by tools/sim/legacy.mjs into
   * legacy-out/) are opened by this version. Everything finished is still on the shelf and in the notebook,
   * the shop counts it, an old commission can be changed again, and 0.7.0's unfinished commission carries on.
   */
  /**
   * A new version from a local feed (road-to-1.1.md A1): the postman brings the letter with the version and the notes in
   * the shop's language, nothing downloads until "update", a commission after that runs to the end untouched, and the
   * version goes in only as the shop closes, after a copy of the data. Closing with "stop and close" mid-commission keeps
   * its promise to carry on, and installs after. The Store build and a shop with the switch off never look.
   * The dev build calls itself 1.0.0 (package.json), so the feed offers 1.1.1; the installer is never run, the log says when.
   */
  async update(lang, out) {
    const U = locale(lang).ui.update;
    const other = lang === 'en' ? 'zh-CN' : 'en';
    const install = 'update install {';
    for (const [why, opts] of [['the Store build', { store: true }], ['checking switched off', { settings: { updates: false } }]]) {
      const home = freshHome({ 'settings.json': onboarded(lang, opts.settings) });
      const feed = await updateFeed(home);
      const shop = await launch({ lang, home, speed: SPEED, store: opts.store, updateConfig: feed.config });
      try {
        await sleep(7000);
        check(feed.asked.length === 0, `${why} looked for a new version: ${feed.asked.join(', ')}`);
        check(!(await shop.page.locator('.update-letter').count()), `${why} got a letter`);
      } finally { await shop.close(); feed.close(); }
    }

    const home = freshHome({ 'settings.json': onboarded(lang) });
    const feed = await updateFeed(home);
    const quit = (shop, answer) => {
      const exit = new Promise((done) => shop.app.process().once('exit', done));
      return shop.app.evaluate(({ app, dialog }, answer) => {
        dialog.showMessageBoxSync = () => answer;
        setTimeout(() => app.quit(), 100);
      }, answer).catch(() => {}).then(() => Promise.race([exit, sleep(15_000)]));
    };
    const fetched = () => feed.asked.filter((name) => name === feed.exe).length;
    // Fetched this many times before the shop opened: the letter alone must not fetch it again.
    const letterThen = async (shop, before, shot) => {
      const card = await shop.maybe('.update-letter', 60_000);
      check(card, 'the postman brought no letter');
      const text = await card.innerText();
      check(text.includes('1.1.1') && text.includes(UPDATE_NOTES[lang]), `the letter does not say the version and what is new: ${text}`);
      check(!text.includes(UPDATE_NOTES[other]), 'the letter has the notes in the other language too');
      if (shot) await shop.shot(join(out, shot));
      check(fetched() === before, `the new version was downloaded before anyone said so: ${feed.asked.join(', ')}`);
      await shop.page.locator('.update-letter .actions button.default', { hasText: U.update }).click();
    };

    let shop = await launch({ lang, home, speed: SPEED, updateConfig: feed.config });
    try {
      await letterThen(shop, 0, 'update-letter.png');
      check(await waitForLog(home, 'update downloaded {', 1), 'the new version was not downloaded after "update"');
      check(fetched() === 1, 'the installer was not fetched from the feed');
      await sleep(1500);
      await shop.shot(join(out, 'update-fetched.png'));
      // A commission with the new version waiting: it runs to the end, and nothing goes in meanwhile.
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      await sleep(2000);
      check(!logged(home, install).length, 'the update went in while a commission was under way');
      const done = await shop.workUntilDone();
      check(done.ok, `the commission did not finish: ${JSON.stringify(done).slice(0, 300)}`);
      check(!logged(home, install).length, 'the update went in with the shop still open');
      await shop.page.keyboard.press('Escape');
      await shop.openSettings('about');
      const toggle = shop.page.locator('.settings label.toggle', { hasText: locale(lang).ui.setup.updatesToggle });
      check(await toggle.count() === 1, 'no switch for looking for new versions in settings');
      check(await toggle.locator('input').isChecked(), 'looking for new versions is not on by default');
      await shop.shot(join(out, 'update-settings.png'));
      await shop.page.keyboard.press('Escape');
      const closing = new Date().toISOString();
      await quit(shop, 0);
      const went = logged(home, install);
      check(went.length === 1 && went[0].slice(0, 24) >= closing, `the update did not go in as the shop closed: ${went.join(' | ')}`);
      check(logged(home, 'update installer not run (simulated)').length === 1, 'the stand-in for the installer was not reached');
      const backup = join(home.data, 'backup', readdirSync(join(home.data, 'backup')).find((d) => d.endsWith('-before-1.1.1')) ?? '-');
      check(existsSync(join(backup, 'memory.json')), 'no copy of the data before the update');
      check(readFileSync(join(backup, 'memory.json'), 'utf8') === readFileSync(join(home.data, 'memory.json'), 'utf8'), 'the copy is not the data as it was');
      check(JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.length === 1, 'the work done before the update is gone');
    } finally { await shop.close(); }

    // Closing mid-commission with "stop and close": stopped the way it always is, carried on next time, installed after.
    const before = fetched();
    shop = await launch({ lang, home, speed: 1500, updateConfig: feed.config });
    try {
      await letterThen(shop, before);
      check(await waitForLog(home, 'update downloaded {', 2), 'the new version was not downloaded the second time');
      await shop.order({ template: 'page', want: W[lang].page });
      await shop.submit();
      await sleep(2500);
      check(pendingRounds(home).length === 1, 'the commission was not noted as under way');
      const closing = new Date().toISOString();
      await quit(shop, 1);
      const went = logged(home, install);
      check(went.length === 2 && went[1].slice(0, 24) >= closing, `the update did not go in after "stop and close": ${went.join(' | ')}`);
      check(pendingRounds(home)[0]?.state === 'stopped', 'the stopped commission will not be offered next time');
    } finally { await shop.close(); feed.close(); }
    shop = await launch({ lang, home, speed: SPEED });
    try {
      check(await shop.maybe('.pending-card', 10_000), 'the promise to carry on next time was not kept');
    } finally { await shop.close(); }
  },

  async upgrade(lang, out) {
    for (const version of ['0.5.0', '0.6.1', '0.7.0']) {
      const snap = join(ROOT, 'legacy-out', lang, version);
      check(existsSync(join(snap, 'home.txt')), `no ${version} data: run tools/sim/legacy.mjs first`);
      const home = restoreHome(snap);
      const before = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
      const finished = before.commissions.filter((c) => c.result === 'done');
      const shop = await launch({ lang, home, speed: SPEED });
      try {
        if (version === '0.7.0') {
          const resume = await shop.maybe('.pending-card button.default', 8000);
          check(resume, '0.7.0: the unfinished commission was not offered');
          await shop.shot(join(out, `upgrade-${version}-pending.png`));
          await resume.click();
          check((await shop.workUntilDone()).ok, '0.7.0: the unfinished commission did not finish');
          await shop.page.keyboard.press('Escape');
          await sleep(1500);
        } else {
          await sleep(3000);
          await shop.page.keyboard.press('Escape');
        }
        check(existsSync(join(home.data, 'data-version.json')), `${version}: data folder not marked`);
        check(readdirSync(join(home.data, 'backup')).length === 1, `${version}: no backup of the old data`);
        const memory = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
        for (const c of before.commissions) check(memory.commissions.some((m) => m.id === c.id), `${version}: lost ${c.title}`);
        check(memory.shop.done >= finished.length, `${version}: the shop counts ${memory.shop.done} of ${finished.length} finished`);
        const dashed = memory.commissions.find((c) => /^[\x21-\x7e]+$/.test(c.title) && c.title.includes('-'));
        check(!dashed, `${version}: title still dashed: ${dashed?.title}`);

        await shop.hotspot(shop.L.ui.access.hotspotWorks);
        const works = await shop.page.locator('.shelf-card li.work').count();
        check(works >= finished.length, `${version}: shelf shows ${works} of ${finished.length}`);
        await shop.shot(join(out, `upgrade-${version}-shelf.png`));
        // Change the oldest piece of work again, from the shelf: same folder, one more round.
        const oldest = finished[0];
        await shop.page.locator('.shelf-card li.work').last().locator('.work-actions button.link', { hasText: shop.L.ui.shelf.revise }).click();
        await shop.page.waitForSelector('form.revise textarea');
        await shop.page.fill('form.revise textarea', W[lang].ask);
        await shop.page.locator('form.revise button.default').click();
        { const done = await shop.workUntilDone(); check(done.ok, `${version}: changing old work did not finish: ${JSON.stringify(done).slice(0, 300)}`); }
        const again = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.find((c) => c.id === oldest.id);
        check(again?.asks?.length === 1, `${version}: the round on old work was not noted`);
        check(readdirSync(oldest.folder).length > 0, `${version}: old folder is empty`);
      } finally { await shop.close(); }
    }
  },

  /**
   * The project board and timeline (road-to-1.2.md B2): three projects, one of four rounds. The board's numbers match the
   * notebook and the ledger, the timeline has a row per round with its cost and time, going back to round 2 gives round 2's
   * files byte for byte and one more round, and branching off round 3 makes a new folder just like it while the project
   * stays as it was. Seen in the cafe, at the smallest window, and in the study; the blackboard opens the board from the
   * keyboard while nothing is chalked on it.
   */
  async projectboard(lang, out) {
    const L = locale(lang);
    const P = L.ui.projects;
    const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
    const usd = (n) => '$' + n.toFixed(2);
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const spentIn = (folder) => JSON.parse(readFileSync(join(home.data, 'spend.json'), 'utf8')).filter((e) => e.key.startsWith(folder + '|')).reduce((sum, e) => sum + e.usd, 0);
    const snap = (dir) => JSON.stringify(Object.fromEntries(filesIn(dir).map((f) => [f, readFileSync(join(dir, f)).toString('base64')])));
    const asks = [W[lang].ask, W[lang].note, lang === 'en' ? 'Make the title dark blue' : '标题换成深蓝色'];
    let shop = await launch({ lang, home, speed: SPEED });
    const page = () => shop.page;
    /** The card fits the window: nothing pushed sideways, off the top or the bottom. */
    const fits = async (selector, what) => {
      const spill = await page().locator(selector).evaluate((c) => {
        const box = c.getBoundingClientRect();
        return c.scrollWidth > c.clientWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1;
      });
      check(!spill, what + ' does not fit the window');
    };
    const openBoard = async () => {
      await page().locator('.toolbar button.tool-btn').nth(1).click();
      await page().waitForSelector('.project-card:not(.timeline-card)');
      await sleep(300);
    };
    const roundRow = (n) => page().locator('.timeline li.round').filter({ has: page().locator('.round-head b', { hasText: new RegExp('^' + fill(P.round, { n: String(n) }) + '$') }) });
    try {
      // The project of four rounds: the first commission, then three rounds of changes; what each left in the folder.
      check((await runOne(shop, { template: 'page', want: W[lang].page })).ok, 'the first round did not finish');
      const dir = latestCommission(home);
      const rounds = [snap(dir)];
      for (const ask of asks) {
        await page().locator('.result-revise').click();
        await page().fill('form.revise textarea', ask);
        await page().locator('form.revise button.default').click();
        check((await shop.workUntilDone()).ok, 'a round of changes did not finish');
        check(latestCommission(home) === dir, 'a round of changes went to a new folder');
        rounds.push(snap(dir));
      }
      check(new Set(rounds).size === 4, 'two rounds left the same files');
      await page().keyboard.press('Escape');
      await sleep(800);
      for (const [template, want] of [['letter', W[lang].letter], ['sheet', W[lang].sheet]]) {
        check((await runOne(shop, { template, want })).ok, template + ' did not finish');
        await page().keyboard.press('Escape');
        await sleep(800);
      }
      const big = notebook().projects.find((x) => x.folder === dir);
      check(notebook().projects.length === 3 && big.rounds.length === 4, 'the notebook has ' + notebook().projects.length + ' projects, the big one ' + big?.rounds.length + ' rounds');
      check(big.rounds.every((r) => r.version), 'not every round has its version: ' + JSON.stringify(big.rounds.map((r) => r.version)));

      // The blackboard has a card pinned for each, and opens the board from the keyboard.
      check(await page().locator('#board-pins .pin-card').count() === 3, 'the blackboard has ' + await page().locator('#board-pins .pin-card').count() + ' cards pinned');
      await shop.shot(join(out, 'projectboard-pins-cafe.png'));
      await shop.hotspot(L.ui.access.hotspotBoard);
      check(await shop.maybe('.project-card', 3000), 'the blackboard hotspot opens no project board');
      await page().keyboard.press('Escape');
      await sleep(300);

      // The board: a row each, with the numbers the notebook and the ledger have.
      await openBoard();
      const rows = page().locator('.project-card li.project-row');
      check(await rows.count() === 3, 'the board has ' + await rows.count() + ' rows');
      for (const x of notebook().projects) {
        const row = rows.filter({ has: page().locator('.project-open', { hasText: x.title }) });
        const text = await row.innerText();
        const want = [x.rounds.length === 1 ? P.roundsOne : fill(P.rounds, { n: String(x.rounds.length) }), fill(P.spent, { usd: usd(spentIn(x.folder)) }), x.rounds.at(-1).date, P.status.done];
        check(want.every((w) => text.includes(w)), 'the row of ' + x.title + ' reads "' + text + '", not ' + JSON.stringify(want));
      }
      await fits('.project-card', 'the board');
      await shop.shot(join(out, 'projectboard-board.png'));

      // Its timeline: four rows, each with what it cost and how long it took.
      await rows.filter({ has: page().locator('.project-open', { hasText: big.title }) }).locator('.project-open').click();
      await page().waitForSelector('.timeline-card');
      check(await page().locator('.timeline li.round').count() === 4, 'the timeline has ' + await page().locator('.timeline li.round').count() + ' rows');
      for (const meta of await page().locator('.timeline .round-meta').allInnerTexts()) {
        check(meta.includes('$') && !meta.includes(P.noCost) && meta.includes(fill(P.took, { time: '' }).trim()), 'a row reads "' + meta + '"');
      }
      await fits('.timeline-card', 'the timeline');
      await shop.shot(join(out, 'projectboard-timeline.png'));

      // Back to round 2: asked twice, then round 2's files byte for byte, and one more round.
      const revert = roundRow(2).locator('.round-revert');
      await revert.click();
      check(snap(dir) === rounds[3], 'the first press already changed the folder');
      await revert.click();
      await page().waitForFunction(() => document.querySelectorAll('.timeline li.round').length === 5, null, { timeout: 10_000 });
      check(snap(dir) === rounds[1], 'the folder is not round 2 byte for byte');
      check(notebook().projects.find((x) => x.id === big.id).rounds.at(-1).restoredFrom === 2, 'the new round does not say it went back to round 2');
      check((await page().locator('.timeline-note').innerText()) === fill(P.reverted, { n: '2' }), 'the timeline does not say it went back');
      await shop.shot(join(out, 'projectboard-reverted.png'));

      // Branching off round 3: a new folder just like it; the project stays as it was.
      await roundRow(3).locator('.round-fork').click();
      await page().waitForFunction((n) => document.querySelector('.timeline-note')?.textContent?.startsWith(n), fill(P.forked, { title: '' }).split('“')[0].split('《')[0], { timeout: 10_000 });
      const fork = notebook().projects.find((x) => x.from?.project === big.id);
      check(fork && fork.from.round === 3 && fork.folder !== dir, 'no new project branched off round 3: ' + JSON.stringify(fork));
      check(snap(fork.folder) === rounds[2], 'the new folder is not round 3 byte for byte');
      check(snap(dir) === rounds[1], 'branching off changed the project');
      check(notebook().projects.length === 4, 'there are ' + notebook().projects.length + ' projects');
      await shop.shot(join(out, 'projectboard-forked.png'));

      // The smallest window: the board and the timeline still fit.
      await page().keyboard.press('Escape');
      await sleep(300);
      await shop.resize([640, 360]);
      await openBoard();
      await fits('.project-card', 'the board at the smallest window');
      await shop.shot(join(out, 'projectboard-small-board.png'));
      await page().locator('.project-card .project-open', { hasText: big.title }).first().click();
      await page().waitForSelector('.timeline-card');
      await sleep(300);
      await fits('.timeline-card', 'the timeline at the smallest window');
      await shop.shot(join(out, 'projectboard-small-timeline.png'));
    } finally { await shop.close(); }

    // The study: the same blackboard, and the same board.
    const settings = JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8'));
    writeFileSync(join(home.data, 'settings.json'), JSON.stringify({ ...settings, scene: 'study' }, null, 2));
    shop = await launch({ lang, home, speed: SPEED });
    try {
      await sleep(1500);
      await page().keyboard.press('Escape');
      await page().waitForFunction(() => document.querySelectorAll('#board-pins .pin-card').length === 4, null, { timeout: 10_000 });
      await shop.shot(join(out, 'projectboard-pins-study.png'));
      await shop.hotspot(L.ui.access.hotspotBoard);
      check(await shop.maybe('.project-card', 3000), 'the blackboard in the study opens no project board');
      await shop.shot(join(out, 'projectboard-study.png'));
    } finally { await shop.close(); }
  },

  /**
   * Project memory (road-to-1.2.md B3): a project of two rounds. The stand-in's log shows the second round's prompt
   * starting with the project background: what the project is for, the colour answered in the first round and where the
   * first round left off, within 2,000 characters and without the shop-wide notes. "What the staff remember" sits at the
   * top of the timeline; the user changes that preference there, and the third round's prompt has it as they wrote it.
   * Seen in both languages and at the smallest window.
   */
  async projectmemo(lang, out) {
    const L = locale(lang);
    const B = L.ui.projects.brief;
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const log = join(home.home, 'stand-in.log');
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const colour = lang === 'en' ? 'Mint' : '浅薄荷';
    const edited = lang === 'en' ? 'Main colour: pale yellow, never green' : '主色用浅黄，不要绿色';
    /** What the app asked of the stand-in for each round of changes, oldest first. */
    const revisePrompts = () => readFileSync(log, 'utf8').split('\n').filter((l) => l.startsWith('< ')).map((l) => JSON.parse(l.slice(2)))
      .filter((m) => m.type === 'user' && m.message?.role === 'user')
      .map((m) => (typeof m.message.content === 'string' ? m.message.content : m.message.content.map((c) => c.text ?? '').join('')))
      .filter((p) => /asks for a change/.test(p));
    const background = (p) => p.slice(0, p.search(/\n\n(The user has looked|Earlier the shop)/));
    const shop = await launch({ lang, home, speed: SPEED, scenario: 'projectmemo', simEnv: { SIM_LOG: log } });
    const page = shop.page;
    const openTimeline = async () => {
      await page.locator('.toolbar button.tool-btn').nth(1).click();
      await page.waitForSelector('.project-card .project-open');
      await page.locator('.project-card .project-open').first().click();
      await page.waitForSelector('.timeline-card .brief');
      await sleep(300);
    };
    const fits = async (what) => {
      const spill = await page.locator('.timeline-card').evaluate((c) => {
        const box = c.getBoundingClientRect();
        return c.scrollWidth > c.clientWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1;
      });
      check(!spill, what + ' does not fit the window');
    };
    try {
      // Two rounds: the first asks which colour, the second is a change.
      check((await runOne(shop, { template: 'page', want: W[lang].page }, { answers: (card) => (card.text.includes(colour) ? colour : null) })).ok, 'the first round did not finish');
      await page.locator('.result-revise').click();
      await page.fill('form.revise textarea', W[lang].ask);
      await page.locator('form.revise button.default').click();
      check((await shop.workUntilDone()).ok, 'the second round did not finish');
      const p = notebook().projects[0];
      const summary = p.rounds[0].summary;
      check(summary, 'the first round left no summary');
      const second = revisePrompts().at(-1);
      check(second, 'the stand-in saw no round of changes');
      const bg = background(second);
      check(bg.startsWith('About this project'), 'the second round does not start with the project background: ' + second.slice(0, 200));
      for (const part of [W[lang].page, colour, summary]) check(bg.includes(part), 'the project background lacks "' + part + '": ' + bg);
      check(bg.length <= 2000, 'the project background is ' + bg.length + ' characters');
      check(!second.includes('Notes from earlier commissions'), 'a round inside the project still carries the shop-wide notes');
      await page.keyboard.press('Escape');
      await sleep(800);

      // What the staff remember, at the top of the timeline.
      await openTimeline();
      const block = page.locator('.timeline-card .brief');
      const said = await block.innerText();
      for (const part of [B.title, B.purpose, B.prefs, B.lastRound, colour]) check(said.includes(part), 'what the staff remember lacks "' + part + '": ' + said);
      await fits('the timeline with what the staff remember');
      await shop.shot(join(out, 'projectmemo-brief.png'));

      // The user rewrites the colour they settled on.
      await block.locator('.brief-edit').click();
      const pref = block.locator('input.brief-pref').first();
      check((await pref.inputValue()).includes(colour), 'the first preference is not the colour: ' + await pref.inputValue());
      await pref.fill(edited);
      await shop.shot(join(out, 'projectmemo-edit.png'));
      await block.locator('.brief-save').click();
      await page.waitForFunction((t) => document.querySelector('.timeline-note')?.textContent === t, B.saved, { timeout: 10_000 });
      check(notebook().projects[0].brief?.prefs.includes(edited), 'the changed preference was not kept: ' + JSON.stringify(notebook().projects[0].brief));
      await page.keyboard.press('Escape');
      await sleep(500);

      // The third round goes by what the user wrote.
      await page.locator('.toolbar button.tool-btn').nth(2).click();
      await page.locator('.shelf-card li.work').first().locator('.work-actions button.link', { hasText: L.ui.shelf.revise }).click();
      await page.waitForSelector('form.revise textarea');
      await page.fill('form.revise textarea', W[lang].note);
      await page.locator('form.revise button.default').click();
      check((await shop.workUntilDone()).ok, 'the third round did not finish');
      const third = background(revisePrompts().at(-1));
      check(third.includes(edited) && !third.includes(colour), 'the third round does not go by the changed preference: ' + third);
      check(third.includes(W[lang].ask), 'the third round does not carry the change asked for before');
      check(notebook().projects[0].brief.prefs.includes(edited), 'the third round wrote over the changed preference');
      await page.keyboard.press('Escape');
      await sleep(800);

      // The smallest window.
      await shop.resize([640, 360]);
      await openTimeline();
      await fits('the timeline at the smallest window');
      await shop.shot(join(out, 'projectmemo-small.png'));
    } finally { await shop.close(); }
  },

  /**
   * Projects (road-to-1.2.md B1): a 1.1 shop with five works, one that stopped and one in a lent folder, opens as five
   * projects of one with a copy of the old data aside, and the shelf is as it was. Opened again, nothing is migrated twice.
   * Saved since by 1.1, which drops the projects, it gets the same projects back on the next opening.
   */
  async projects(lang, out) {
    const home = freshHome();
    const day = (d) => `2026-11-0${d}`;
    const stat = (d, seconds, failure) => ({ date: day(d), seconds, ...(failure ? { failure } : {}), helpers: {}, waits: 0, waitedSeconds: 0 });
    const work = (i, title, extra = {}) => ({
      id: `c${Date.UTC(2026, 10, i)}`, title, date: day(i), result: 'done', choices: {}, folder: join(home.documents, 'Lamplight Nook', `work-${i}`),
      main: 'index.html', form: { want: title, template: 'page' }, rounds: [stat(i, 60)], ...extra,
    });
    const T = lang === 'en' ? ['Sign-in page', 'Travel guide', 'Spending table', 'My notes', 'Pomodoro timer'] : ['签到页', '旅行攻略', '记账表', '我的笔记', '番茄钟'];
    const lent = join(home.home, 'My notes');
    const works = [
      work(1, T[0]),
      work(2, T[1], { asks: [{ ask: W[lang].ask, date: day(3) }, { ask: W[lang].note, date: day(4) }, { ask: W[lang].ask, date: day(5) }], rounds: [stat(2, 90), stat(3, 30), stat(4, 20, 'network'), stat(5, 40)] }),
      work(3, T[2], { result: 'failed', main: undefined, rounds: [stat(3, 25, 'network')] }),
      work(4, T[3], { folder: lent, form: { want: T[3], template: 'page', inPlace: lent }, touched: ['index.html'] }),
      work(5, T[4]),
    ];
    for (const w of works) {
      mkdirSync(w.folder, { recursive: true });
      writeFileSync(join(w.folder, 'index.html'), `<h1>${w.title}</h1>`);
    }
    writeFileSync(join(lent, 'mine.txt'), 'the user\'s own');
    const seed = { commissions: works, stuckNotes: [], greeted: works[4].id, shop: { done: 4, told: [], grown: [], met: [] } };
    for (const [name, text] of Object.entries({ 'settings.json': onboarded(lang), 'memory.json': seed, 'data-version.json': { data: 3 } })) writeFileSync(join(home.data, name), JSON.stringify(text, null, 2));
    const notebook = () => JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
    const shelf = async (shot) => {
      const shop = await launch({ lang, home, speed: SPEED });
      try {
        await sleep(3000);
        await shop.page.keyboard.press('Escape');
        await shop.hotspot(shop.L.ui.access.hotspotWorks);
        await shop.page.waitForSelector('.shelf-card li.work');
        const titles = await shop.page.locator('.shelf-card li.work .work-text b').allInnerTexts();
        if (shot) await shop.shot(join(out, shot));
        return titles;
      } finally { await shop.close(); }
    };

    const titles = await shelf('projects-shelf.png');
    const done = works.filter((w) => w.result === 'done').reverse().map((w) => w.title);
    check(JSON.stringify(titles) === JSON.stringify(done), `the shelf shows ${JSON.stringify(titles)}, not ${JSON.stringify(done)}`);
    check(JSON.parse(readFileSync(join(home.data, 'data-version.json'), 'utf8')).data === 4, 'the data folder is not at version 4');
    const backups = readdirSync(join(home.data, 'backup'));
    check(backups.length === 1 && backups[0].endsWith('-v3'), `the old data was not kept aside once: ${backups}`);
    check(JSON.stringify(JSON.parse(readFileSync(join(home.data, 'backup', backups[0], 'memory.json'), 'utf8'))) === JSON.stringify(seed), 'the copy aside is not the 1.1 notebook');
    const first = notebook();
    check(first.projects.length === 5, `${first.projects.length} projects, not 5`);
    for (const w of works) {
      const c = first.commissions.find((x) => x.id === w.id);
      const p = first.projects.find((x) => x.id === c?.project);
      check(p && p.commissions.length === 1 && p.commissions[0] === w.id && p.title === w.title && p.folder === w.folder, `${w.title} is not a project of its own`);
      check(p.rounds.length === 1 + (w.asks?.length ?? 0), `${w.title} has ${p.rounds.length} rounds`);
      check(Boolean(p.lent) === Boolean(w.form.inPlace), `${w.title}: lent is ${p.lent}`);
    }
    check(first.projects.find((p) => p.commissions[0] === works[2].id).rounds[0].failure === 'network', 'the work that stopped does not say why');

    // Opened again: nothing migrated twice.
    await shelf();
    const again = notebook();
    check(JSON.stringify(again.projects) === JSON.stringify(first.projects), 'the projects changed on the second opening');
    check(readdirSync(join(home.data, 'backup')).length === 1, 'a second copy of the data was made');

    // 1.1 saved the notebook in between: its projects are gone, the version marker still says 4.
    const { projects: _, ...saved } = again;
    writeFileSync(join(home.data, 'memory.json'), JSON.stringify(saved, null, 2));
    check(JSON.stringify(await shelf('projects-rebuilt.png')) === JSON.stringify(done), 'the shelf changed after 1.1 saved the notebook');
    check(JSON.stringify(notebook().projects) === JSON.stringify(first.projects), 'the projects did not come back as they were');
  },

  /**
   * An old Claude Code: the counter says so and offers the update, the settings show the version, and the
   * user can still go ahead. A current one shows its version and asks nothing.
   */
  async oldclaude(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    let shop = await launch({ lang, home, speed: SPEED, simEnv: { SIM_CLAUDE_VERSION: '2.0.14' } });
    try {
      await shop.hotspot(shop.L.ui.access.hotspotCounter);
      const card = await shop.maybe('.notice-card', 5000);
      check(card, 'no card for an old Claude Code');
      const text = await card.innerText();
      check(text.includes('2.0.14') && text.includes(shop.L.ui.setup.claudeUpdate), `old version not explained: ${JSON.stringify(text.slice(0, 200))}`);
      await shop.shot(join(out, 'oldclaude-card.png'));
      await shop.page.locator('.notice-card .keep-old button').click();
      await shop.page.waitForSelector('form.commission', { timeout: 5000 });
      await shop.page.keyboard.press('Escape');
      await sleep(400);
      // Waved through once: the next commission goes straight to the slip.
      check((await runOne(shop, { template: 'letter', want: W[lang].letter })).ok, 'did not finish with the old version');
    } finally { await shop.close(); }
    shop = await launch({ lang, home, speed: SPEED });
    try {
      await shop.openSettings('work');
      const rows = await shop.page.locator('.settings .env-rows').innerText();
      check(rows.includes('2.1.306'), `current version not shown: ${JSON.stringify(rows.slice(0, 200))}`);
      await shop.shot(join(out, 'oldclaude-settings.png'));
      await shop.page.keyboard.press('Escape');
      await shop.hotspot(shop.L.ui.access.hotspotCounter);
      check(await shop.maybe('form.commission', 5000), 'a current Claude Code was questioned');
    } finally { await shop.close(); }
  },

  /**
   * The toolbar and settings as docs/information-structure.md lays them out: seven buttons in order, labels that
   * show at once on hover and keyboard focus, pixel icons at whole real pixels, and the five settings tabs.
   */
  async menus(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang, { muted: false }) });
    const shop = await launch({ lang, home, speed: SPEED, debug: true });
    const { page, L } = shop;
    check(await shop.app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null), "the window shows Electron's File, Edit and View menus");
    const S = L.ui.setup;
    // The calling button (road-to-1.4.md D3) stands apart: hidden until a shop out of sight has a question.
    const buttons = page.locator('.toolbar button.tool-btn:not(.calling)');
    const tip = (i) => buttons.nth(i).getAttribute('data-tip');
    const tipShown = (i) => buttons.nth(i).evaluate((b) => getComputedStyle(b, '::after').opacity === '1');
    const settingsFile = () => JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8'));
    try {
      const want = [L.ui.toolbar.order, L.ui.projects.button, L.ui.shelf.title, L.ui.notebook.title, L.ui.access.captionsButton, L.ui.toolbar.mute, L.ui.toolbar.street, L.ui.toolbar.settings];
      check(await buttons.count() === 8, `the toolbar has ${await buttons.count()} buttons`);
      check(await page.locator('.toolbar button.tool-btn.calling').isHidden(), 'the calling button shows with nobody calling');
      for (const [i, label] of want.entries()) {
        check(await tip(i) === label, `button ${i} says ${await tip(i)}, not ${label}`);
        check(await buttons.nth(i).getAttribute('aria-label') === label, `button ${i} has no spoken name`);
        check(await buttons.nth(i).getAttribute('title') === null, `button ${i} leans on the slow native tooltip`);
        await page.mouse.move(800, 500);
        check(!(await tipShown(i)), `button ${i} shows its label without being pointed at`);
        await buttons.nth(i).hover();
        check(await tipShown(i), `button ${i} does not show its label at once on hover`);
      }
      await page.mouse.move(800, 500);
      await buttons.nth(1).focus();
      await page.keyboard.press('Shift+Tab');
      check(await tipShown(0), 'the first button shows no label on keyboard focus');
      await page.evaluate(() => document.activeElement.blur());
      await buttons.nth(6).hover();
      await page.screenshot({ path: join(out, 'menus-toolbar-tip.png') });

      // Whole real pixels at every window size.
      for (const size of ['small', 'medium', 'large']) {
        await shop.resize(size);
        const px = await page.locator('.tool-icon').first().evaluate((n) => n.getBoundingClientRect().width / 16 * devicePixelRatio);
        check(Math.abs(px - Math.round(px)) < 0.01, `${size}: an icon pixel is ${px} real pixels`);
        await page.locator('.toolbar').screenshot({ path: join(out, `menus-toolbar-${size}.png`) });
      }
      await shop.resize('medium');

      // Commission: the same as the counter, in both states, and the word follows the work.
      await buttons.nth(0).click();
      check(await shop.maybe('form.commission', 3000), 'the commission button opens no slip');
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.evaluate(() => window.lamplightDebug.pretendRunning(true));
      await sleep(200);
      check(await tip(0) === L.ui.toolbar.progress, `while working the first button says ${await tip(0)}`);
      await buttons.nth(0).click();
      check(await shop.maybe('.running-card', 3000), 'while working the first button opens no progress card');
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.evaluate(() => window.lamplightDebug.pretendRunning(false));
      await sleep(200);
      check(await tip(0) === L.ui.toolbar.order, 'the first button did not go back after the work');

      // The shelf has words of its own when empty.
      await buttons.nth(2).click();
      const shelf = await shop.maybe('.shelf-card', 3000);
      check(shelf, 'the works button opens no shelf');
      check((await shelf.innerText()).includes(L.ui.shelf.empty), 'an empty shelf says nothing about being empty');
      await shop.shot(join(out, 'menus-shelf-empty.png'));
      await page.keyboard.press('Escape');
      await sleep(300);
      await buttons.nth(3).click();
      check(await shop.maybe('.notebook', 3000), 'the notebook button opens no notebook');
      await page.keyboard.press('Escape');
      await sleep(300);
      await buttons.nth(4).click();
      check(await shop.maybe('.caption-card', 3000), 'the captions button opens no record');
      await page.keyboard.press('Escape');
      await sleep(300);
      // Sound: keyboard focus stays on the button when it changes.
      await buttons.nth(5).click();
      await sleep(300);
      check(settingsFile().muted === true, 'the sound button did not mute');
      check(await tip(5) === L.ui.toolbar.unmute, 'the sound button did not change its word');
      check(await buttons.nth(5).evaluate((b) => b === document.activeElement), 'the sound button lost focus when it changed');
      await buttons.nth(5).click();
      await sleep(300);

      // Settings: what sits on each tab.
      const has = async (selector, what, yes = true) => check((await page.locator(`.settings ${selector}`).count() > 0) === yes, `${what} ${yes ? 'missing from' : 'still on'} this tab`);
      const body = () => page.locator('.settings-body').innerText();
      await shop.openSettings('basics');
      check(await page.locator('.settings button.tab[data-tab="furnish"]').innerText() === S.settingsTabs.furnish, 'furnish tab label');
      check(await page.locator('.settings button.tab[data-tab="work"]').innerText() === S.settingsTabs.work, 'work tab label');
      await has('input[type=text]', 'basics: name');
      await has('.look-picker', 'basics: look');
      await has('select', 'basics: language');
      await has('.scene-picker', 'basics: scene', false);
      await has('.folder-row', 'basics: folder', false);
      await shop.openSettings('furnish');
      await has('.scene-picker', 'furnish: scene');
      await has('.swatches', 'furnish: furnishing');
      await shop.shot(join(out, 'menus-settings-furnish.png'));
      await shop.openSettings('sight');
      await has('input[type=range]', 'sight: volume');
      check((await body()).includes(L.ui.access.captionsToggle), 'sight: captions');
      check((await body()).includes(L.ui.access.reduceMotion), 'sight: less motion');
      // Saving power (road-to-1.4.md D8): the switch is here, and turning it on draws fewer frames at once.
      check((await body()).includes(L.ui.access.powerSaving), 'sight: save power');
      const limit = () => page.evaluate(() => window.lamplightDebug.scene.game.loop.fpsLimit);
      const before = await limit();
      await page.locator('label.toggle', { hasText: L.ui.access.powerSaving }).click();
      for (const end = Date.now() + 3000; Date.now() < end && await limit() === before; await sleep(100));
      check(before === 30 && await limit() === 20, `saving power did not lower the frames: ${before} -> ${await limit()}`);
      await page.locator('label.toggle', { hasText: L.ui.access.powerSaving }).click();
      for (const end = Date.now() + 3000; Date.now() < end && await limit() !== 30; await sleep(100));
      check(await limit() === 30, `saving power off did not bring the frames back: ${await limit()}`);
      check((await body()).includes(L.ui.access.detailedToggle), 'sight: what the staff are doing');
      check(!(await body()).includes(L.ui.tray.notifyToggle), 'sight: notifications still here');
      await shop.shot(join(out, 'menus-settings-sight.png'));
      // The strip under the scene answers the switch at once.
      const strip = page.locator('.detail-strip');
      check(await strip.evaluate((n) => n.hidden), 'the detail strip shows before it is asked for');
      await page.locator('.settings label.toggle', { hasText: L.ui.access.detailedToggle }).locator('input').check();
      await sleep(300);
      check(!(await strip.evaluate((n) => n.hidden)), 'the switch did not bring the detail strip');
      check(settingsFile().detailed === true, 'the switch was not saved');
      check(await page.evaluate(() => window.lamplightDebug.view.detailed), 'the switch did not reach the shop');
      await page.locator('.settings label.toggle', { hasText: L.ui.access.detailedToggle }).locator('input').uncheck();
      await sleep(300);
      check(await strip.evaluate((n) => n.hidden), 'the switch did not hide the detail strip');
      await shop.openSettings('work');
      await has('.env-rows', 'work: what is needed');
      await has('.folder-row', 'work: folder');
      await has('.spend-rows', 'work: spend');
      for (const word of [L.ui.tray.notifyToggle, L.ui.tray.closeToTrayToggle, L.ui.mini.toggle]) check((await body()).includes(word), `work: ${word}`);
      check(!(await body()).includes(L.ui.notebook.sectionText), 'work: the notebook entry is still here');
      await has('.write-us-row', 'work: writing to us', false);
      await shop.shot(join(out, 'menus-settings-work.png'));
      await shop.openSettings('about');
      await has('.legal-links', 'about: legal');
      await has('.about', 'about: credits');
      check((await body()).includes(S.troubleText), 'about: trouble');
      check((await body()).includes(S.updatesToggle), 'about: looking for new versions');
      await has('.write-us-row', 'about: writing to us');
      await shop.shot(join(out, 'menus-settings-about.png'));
    } finally { await shop.close(); }
  },

  /**
   * Every kind of card, at three window sizes: inside the window, nothing spilling over its paper, one of three
   * widths, a close button and Esc exactly where it may be put away, and the main button last on the right.
   * These open through the debug handles with long sample text; the real routes to them are in the other scenarios.
   */
  async cards(lang, out) {
    const memory = {
      commissions: Array.from({ length: 16 }, (_, i) => ({
        id: `c${1000 + i}`, title: W[lang].letter, date: '2026-10-20', result: 'done', choices: {}, folder: 'C:/nowhere', form: { want: W[lang].letter, template: 'letter' },
      })),
      stuckNotes: [], greeted: 'c1015',
      shop: { done: 16, told: [], grown: [] },
    };
    const shopHome = () => freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory) });
    const home = shopHome();
    const shop = await launch({ lang, home, speed: SPEED, debug: true });
    const { page, L } = shop;
    const long = (W[lang].page + ' ').repeat(8);
    const env = { hasApiKey: false, hasClaude: false, debug: false, keySource: 'none', installCommand: 'irm https://claude.ai/install.ps1 | iex', platform: 'win32' };
    const sample = { long, env };
    const TOKEN = { small: 460, form: 500, reading: 600 };

    /** What makes a card: how it opens, what it is called on the page, how wide, and how it goes away. */
    const CARDS = [
      { name: 'slip', sel: 'form.commission', w: 'form', open: () => window.lamplightDebug.ui.showCommissionForm() },
      { name: 'actor', sel: '.actor-card', w: 'small', open: ({ long }) => window.lamplightDebug.ui.showActorCard('adeng', { state: 'working', lastLine: long, doing: long, stats: { writes: 3, runs: 2, fails: 1 }, raw: Array.from({ length: 30 }, (_, i) => `event ${i}`) }, true) },
      { name: 'plan', sel: '.plan-card', w: 'small', open: ({ long }) => window.lamplightDebug.ui.showPlan(Array.from({ length: 24 }, (_, i) => ({ label: `${i + 1} ${long.slice(0, 30)}`, status: i < 5 ? 'done' : i === 5 ? 'doing' : 'todo' }))) },
      { name: 'result', sel: '.result-card', w: 'small', open: ({ long }) => window.lamplightDebug.ui.showResult({ ok: true, workDir: 'C:/w', files: ['C:/w/page.html'], main: 'C:/w/page.html', costUsd: 0.42, summary: long.repeat(3), id: 'c1015', round: 2, canRestore: true }) },
      { name: 'running', sel: '.running-card', w: 'small', open: ({ long }) => {
        const d = window.lamplightDebug;
        d.pretendRunning(true);
        d.ui.renderBoard(Array.from({ length: 24 }, (_, i) => ({ label: `${i + 1} ${long.slice(0, 30)}`, status: i < 5 ? 'done' : i === 5 ? 'doing' : 'todo' })));
        document.querySelector('.toolbar button.tool-btn').click();
      }, after: () => { window.lamplightDebug.pretendRunning(false); window.lamplightDebug.ui.renderBoard([]); } },
      { name: 'running-stop', sel: '.running-card', w: 'small', open: () => {
        window.lamplightDebug.pretendRunning(true);
        document.querySelector('.toolbar button.tool-btn').click();
        setTimeout(() => document.querySelector('.running-card .progress-cancel').click(), 100);
      }, after: () => window.lamplightDebug.pretendRunning(false) },
      { name: 'failure', sel: '#ui > .card', w: 'small', open: () => window.lamplightDebug.ui.showFailure('net') },
      { name: 'failure-money', sel: '.card.serious', w: 'form', open: () => window.lamplightDebug.ui.showFailure('budget') },
      { name: 'notice', sel: '.notice-card', w: 'reading', open: ({ env }) => {
        window.lamplightDebug.ui.showNotReady(env);
        document.querySelector('.notice-card details.claude-manual').open = true;
      } },
      { name: 'trial-end', sel: '.trial-end', w: 'small', open: () => window.lamplightDebug.ui.showTrialEnd() },
      { name: 'meeting', sel: 'form.meeting', w: 'form', open: () => window.lamplightDebug.ui.showMeeting() },
      { name: 'revise', sel: 'form.meeting.revise', w: 'form', open: ({ long }) => window.lamplightDebug.ui.showRevise(long.slice(0, 20)) },
      { name: 'shelf', sel: '.shelf-card', w: 'form', open: () => window.lamplightDebug.ui.showShelf() },
      { name: 'notebook', sel: '.notebook', w: 'reading', open: () => window.lamplightDebug.ui.showNotebook() },
      { name: 'grant', sel: '.grant-card', w: 'small', open: ({ long }) => void window.lamplightDebug.ui.showGrant({ kind: 'test', label: long.slice(0, 24), grant: { reads: [long, long.slice(0, 30)], does: [{ what: long, undo: 'yes' }, { what: long.slice(0, 40), undo: 'no' }], never: [long, long.slice(0, 20)], disconnect: long } }) },
      { name: 'captions', sel: '.caption-card', w: 'reading', open: () => window.lamplightDebug.ui.showCaptionLog() },
      { name: 'update-letter', sel: '.update-letter', w: 'reading', open: ({ long }) => window.lamplightDebug.ui.showUpdateLetter({ version: '1.1.1', notes: Array.from({ length: 16 }, (_, i) => (i % 4 ? `\u00B7 ${long.slice(0, 70)}` : long.slice(0, 12))) }) },
      ...['basics', 'furnish', 'sight', 'work', 'about'].map((tab) => ({ name: `settings-${tab}`, sel: '.card.settings', w: 'form', tab })),
      { name: 'legal-terms', sel: '.card.legal', w: 'reading', open: () => window.lamplightDebug.ui.showLegal('terms') },
      { name: 'legal-notices', sel: '.card.legal', w: 'reading', open: () => window.lamplightDebug.ui.showLegal('notices') },
      // Cards that must be answered: no close button, and Esc does not put them away.
      { name: 'pending', sel: '.pending-card', w: 'small', must: true, open: ({ long }) => window.lamplightDebug.ui.showPending({ want: long }), answer: '.pending-card button.default' },
      { name: 'interrupted', sel: '.interrupted-card', w: 'small', must: true, open: ({ long }) => window.lamplightDebug.ui.showInterrupted([long, long]), answer: '.interrupted-card button.default' },
      { name: 'decision', sel: '.dialog', w: 'form', must: 'esc-answers', open: ({ long }) => void window.lamplightDebug.ui.showDecision({ id: 'q', kind: 'question', agent: 'main', tool: 'AskUserQuestion', title: long, defaultId: '0', options: [0, 1, 2, 3].map((i) => ({ id: String(i), label: long.slice(0, 18), hint: long.slice(0, 40) })) }) },
      { name: 'serious', sel: '.serious', w: 'form', must: 'esc-answers', open: ({ long }) => void window.lamplightDebug.ui.showDecision({ id: 's', kind: 'serious', agent: 'main', tool: 'Bash', title: long, reason: long, detail: long, defaultId: 'deny', options: [{ id: 'deny', label: 'no' }, { id: 'allow', label: long.slice(0, 16) }] }) },
    ];

    // Everything wrong at once, rather than one card at a time.
    const problems = [];
    const check = (ok, why) => { if (!ok) problems.push(why); };
    const look = async (c, size, on = page) => {
      const what = `${size} ${c.name}`;
      const found = await on.evaluate(({ sel }) => {
        const n = document.querySelector(sel);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const row = [...n.querySelectorAll('.actions')].filter((a) => a.querySelector('button.default') && !a.closest('.serious'))
          .map((a) => { const shown = [...a.querySelectorAll('button')].filter((b) => !b.hidden); return shown.at(-1).classList.contains('default'); });
        const close = n.querySelector(':scope > button.close');
        const cr = close?.getBoundingClientRect();
        return {
          x: r.x, y: r.y, w: r.width, h: r.height,
          spill: n.scrollHeight - n.clientHeight, spillX: n.scrollWidth - n.clientWidth,
          focusOnMain: n.querySelector('textarea, input') || !n.querySelector('.actions button.default') || document.activeElement?.matches('button.default'),
          mainLast: row, closes: n.querySelectorAll(':scope > button.close').length, closeLabel: close?.getAttribute('aria-label'),
          closeAt: cr && { right: r.right - cr.right, top: cr.top - r.top },
          vw: innerWidth, vh: innerHeight, ui: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1,
        };
      }, { sel: c.sel });
      if (!found) return check(false, `${what}: not shown`);
      check(found.x >= 0 && found.y >= 0 && found.x + found.w <= found.vw + 1 && found.y + found.h <= found.vh + 1, `${what} does not fit ${found.vw}x${found.vh}: ${JSON.stringify(found)}`);
      check(found.spill <= 1 && found.spillX <= 1, `${what}: its words spill over the paper by ${found.spill}px down, ${found.spillX}px across`);
      const width = Math.min(TOKEN[c.w] * found.ui, found.vw * 0.92);
      check(Math.abs(found.w - width) <= 2, `${what}: ${found.w}px wide, expected ${width} (${c.w})`);
      check(found.mainLast.every(Boolean), `${what}: the main button is not last`);
      // What Enter does on a card that has just opened must be the safe thing.
      check(found.focusOnMain, `${what}: keyboard focus is not on the main button`);
      if (c.must) check(found.closes === 0, `${what}: must be answered, yet has a close button`);
      else {
        check(found.closes === 1, `${what}: no close button`);
        check(found.closeLabel === L.ui.closeLabel, `${what}: close button says ${found.closeLabel}`);
        check(found.closeAt.right < 24 && found.closeAt.top < 24, `${what}: close button is not top right: ${JSON.stringify(found.closeAt)}`);
      }
    };

    try {
      for (const size of ['small', 'medium', 'large']) {
        await shop.resize(size);
        for (const c of CARDS) {
          if (c.tab) await shop.openSettings(c.tab);
          // A string, so a card whose promise waits for an answer does not hold the script up.
          else await page.evaluate(`void (${c.open})(${JSON.stringify(sample)})`);
          await sleep(c.name === 'running-stop' ? 500 : 350);
          await look(c, size);
          await shop.shot(join(out, `cards-${size}-${c.name}.png`));
          await page.keyboard.press('Escape');
          await sleep(300);
          const left = await page.locator(c.sel).count();
          if (c.must === true) {
            check(left === 1, `${size} ${c.name}: Esc put away a card that must be answered`);
            await page.locator(c.answer).click();
            await sleep(300);
          } else check(left === 0, `${size} ${c.name}: Esc did not put it away`);
          if (c.after) await page.evaluate(c.after);
          await sleep(100);
          check(await page.locator(`#ui > .card, #ui > form.card, .backdrop, .legal-backdrop`).count() === 0, `${size} ${c.name}: something stayed open`);
        }
      }

      // The close button does what Esc does, on the two that are forms.
      await page.evaluate('void window.lamplightDebug.ui.showCommissionForm()');
      await sleep(300);
      await page.locator('form.commission > button.close').click();
      await sleep(300);
      check(await page.locator('form.commission').count() === 0, 'the slip stays after its close button');
    } finally { await shop.close(); }

    // Welcome: three pages, no way past it but through it; and nothing else can push it aside.
    const fresh = freshHome();
    const w = await launch({ lang, home: fresh, speed: SPEED, debug: true });
    try {
      check(await w.maybe('.welcome input[type=text]', 8000), 'no welcome card');
      check(await w.page.locator('.toolbar').count() === 0, 'the toolbar shows before the welcome is done');
      const pages = ['name', 'check', 'folder'];
      for (const [i, name] of pages.entries()) {
        for (const size of ['small', 'medium', 'large']) {
          await w.resize(size);
          await look({ name: `welcome-${name}`, sel: '.welcome', w: 'form', must: true }, size, w.page);
          await w.shot(join(out, `cards-${size}-welcome-${name}.png`));
          await w.page.keyboard.press('Escape');
          await sleep(200);
          check(await w.page.locator('.welcome').count() === 1, 'Esc put away the welcome');
        }
        // A click on the counter behind it changes nothing.
        await w.page.evaluate(() => { window.lamplightDebug.scene.onCounterClick(); });
        await sleep(500);
        check(await w.page.locator('.welcome').count() === 1, 'the counter pushed the welcome aside');
        if (i === 0) await w.page.locator('.welcome input[type=text]').fill(lang === 'en' ? 'Sam' : '小林');
        if (i < pages.length - 1) await w.page.locator('.welcome .actions button.default').last().click();
        await sleep(300);
      }
    } finally { await w.close(); }
    if (problems.length) throw new Error(`${problems.length} problems: ${problems.join(' | ')}`);
  },

  /**
   * A newcomer finds the counter, then the bell and the blackboard: each gets a small "!" the first time it matters,
   * Adeng says what they are for, and the mark goes when it has been used.
   */
  async firstuse(lang, out) {
    const home = freshHome();
    // Slow enough that the first commission is still going when Adeng speaks up.
    const shop = await launch({ lang, home, speed: 1500, debug: true });
    const { page, L } = shop;
    const hints = () => page.evaluate(() => window.lamplightDebug.scene.hints());
    const places = () => page.evaluate(() => window.lamplightDebug.scene.hotspots().map((h) => h.id));
    const said = async (text) => {
      await page.locator('.toolbar button.tool-btn').nth(4).click();
      await page.waitForSelector('.caption-card');
      const log = await page.locator('.caption-card').innerText();
      const has = log.includes(text);
      await page.keyboard.press('Escape');
      await sleep(200);
      return has;
    };
    try {
      await shop.maybe('.welcome input[type=text]', 8000);
      await page.locator('.welcome input[type=text]').fill(lang === 'en' ? 'Sam' : '小林');
      await page.locator('.welcome .actions button.default').last().click();
      await sleep(300);
      await page.locator('.welcome .actions button.default').last().click();
      await sleep(300);
      await page.locator('.welcome .actions button.default').last().click();
      await sleep(1500);
      { const n = await page.locator('.toolbar button.tool-btn').count(); check(n === 8, `no toolbar after the welcome (${n} buttons)`); }
      check((await hints()).join() === 'counter', `after the welcome the marks are on ${await hints()}`);
      check((await places()).includes('counter') && (await places()).includes('board'), 'the counter or the blackboard cannot be reached');
      await shop.shot(join(out, 'firstuse-1-counter.png'));
      await sleep(4500);
      check(await said(L.ui.setup.greetHint), 'Adeng never points at the counter');

      await shop.order({ template: 'letter', want: W[lang].letter });
      check(!(await hints()).includes('counter'), 'the mark stays on the counter after opening it');
      await shop.submit();
      await sleep(800);
      check((await places()).includes('bell'), 'no bell to press while working');
      const up = await hints();
      check(up.includes('bell') && up.includes('board'), `during the first commission the marks are on ${up}`);
      await shop.shot(join(out, 'firstuse-2-bell-board.png'));
      await sleep(6500);
      check(await said(L.ui.run.firstHint), 'Adeng never says what the bell and the blackboard are for');
      await shop.hotspot(L.ui.access.hotspotBoard);
      await sleep(300);
      check(!(await hints()).includes('board'), 'the mark stays on the blackboard after looking at it');
      await page.keyboard.press('Escape');
      const r = await shop.workUntilDone();
      check(r.ok, 'the first commission did not finish');
      check((await hints()).length === 0, `after the first commission the marks are still on ${await hints()}`);
      await page.keyboard.press('Escape');
      await sleep(300);

      // The second commission is not led by the hand.
      await shop.order({ template: 'letter', want: W[lang].letter });
      await shop.submit();
      await sleep(800);
      check((await hints()).length === 0, `the second commission has marks on ${await hints()}`);
      await shop.workUntilDone();
    } finally { await shop.close(); }

    // In the study the same marks sit on the desk and its board.
    const study = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang, { scene: 'study' }) }), speed: SPEED, debug: true });
    try {
      await study.page.evaluate(() => {
        const d = window.lamplightDebug;
        d.pretendRunning(true);
        for (const spot of ['bell', 'board']) d.scene.setHint(spot, true);
      });
      await sleep(300);
      await study.shot(join(out, 'firstuse-3-study.png'));
      await study.page.evaluate(() => {
        const d = window.lamplightDebug;
        d.pretendRunning(false);
        d.scene.setHint('bell', false);
        d.scene.setHint('counter', true);
      });
      await sleep(300);
      await study.shot(join(out, 'firstuse-4-study-counter.png'));
    } finally { await study.close(); }
  },

  /**
   * Write to us: the card says what the mail will hold, the user's mail program is asked to open (caught
   * here), the diagnostics file is exported only when ticked, and cancelling that save opens nothing.
   */
  async feedback(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED });
    const zipAt = join(home.home, 'diag.zip');
    try {
      await shop.app.evaluate(({ shell, dialog }, zipAt) => {
        globalThis.__mail = [];
        globalThis.__save = zipAt;
        shell.openExternal = async (url) => { globalThis.__mail.push(url); };
        shell.showItemInFolder = () => {};
        dialog.showSaveDialog = async () => (globalThis.__save ? { canceled: false, filePath: globalThis.__save } : { canceled: true });
      }, zipAt);
      await shop.openSettings('about');
      const row = shop.page.locator('.settings .write-us-row');
      await row.scrollIntoViewIfNeeded();
      const text = await row.innerText();
      check(text.includes('24kplo@gmail.com'), 'the address is not shown before writing');
      await shop.shot(join(out, 'feedback.png'));

      await row.locator('button.write-us').click();
      await sleep(600);
      let mail = await shop.app.evaluate(() => globalThis.__mail);
      check(mail.length === 1 && mail[0].startsWith('mailto:24kplo@gmail.com?subject='), `no letter opened: ${JSON.stringify(mail)}`);
      check(!existsSync(zipAt), 'diagnostics exported without being asked for');

      await row.locator('.write-diag input[type=checkbox]').check();
      await row.locator('button.write-us').click();
      await sleep(1200);
      mail = await shop.app.evaluate(() => globalThis.__mail);
      check(mail.length === 2 && existsSync(zipAt), 'diagnostics not exported for the second letter');
      const body = decodeURIComponent(mail[1].split('body=')[1]);
      check(body.includes('diag.zip') && !body.includes(home.home) && !/sk-ant/.test(body), `letter body leaks or lacks the file: ${JSON.stringify(body)}`);
      check((await row.locator('.write-said').innerText()) === shop.L.ui.setup.writeOpenedDiag, 'no word that the letter is open');

      await shop.app.evaluate(() => { globalThis.__save = null; });
      await row.locator('button.write-us').click();
      await sleep(600);
      check((await shop.app.evaluate(() => globalThis.__mail)).length === 2, 'a letter opened although the save was cancelled');
      await shop.page.keyboard.press('Escape');

      // Something the staff made is not right: the result card has its own letter (Store policy 11.16).
      check((await runOne(shop, { template: 'letter', want: W[lang].letter })).ok, 'commission did not finish');
      await shop.page.locator('.result-card .result-report').click();
      await sleep(600);
      mail = await shop.app.evaluate(() => globalThis.__mail);
      const report = decodeURIComponent(mail.at(-1));
      check(mail.length === 3 && report.includes(shop.L.ui.setup.reportPrompt) && report.includes(W[lang].letter.slice(0, 8)), `no content report: ${report.slice(0, 200)}`);
      await shop.shot(join(out, 'feedback-report.png'));
    } finally { await shop.close(); }
  },

  /**
   * The Store build's first open on a computer where the installer build has a shop (road-to-1.1.md A2): asked before
   * anything else, the works and the ledger come over, the original is not changed, and the next open asks nothing.
   * Saying no starts afresh; without an old shop nothing is asked.
   */
  async storemove(lang, out) {
    const M = locale(lang).ui.moveIn;
    const old = freshHome();
    const works = [1, 2, 3].map((i) => ({
      id: `c${Date.UTC(2026, 9, i)}`, title: `${lang === 'en' ? 'Old work' : '旧作品'} ${i}`, date: `2026-10-0${i}`, result: 'done',
      choices: {}, asks: [], folder: join(old.documents, 'Lamplight Nook', `work-${i}`), main: 'index.html', costUsd: 0.4,
      form: { want: `Make something ${i}`, template: 'page' },
    }));
    for (const w of works) {
      mkdirSync(w.folder, { recursive: true });
      writeFileSync(join(w.folder, 'index.html'), `<h1>${w.title}</h1>`);
    }
    const seed = {
      'settings.json': JSON.stringify(onboarded(lang)),
      'memory.json': JSON.stringify({ commissions: works, stuckNotes: [], greeted: works[2].id, shop: { done: 3, told: [], grown: [], met: [] } }),
      'spend.json': JSON.stringify([{ key: 'a|s', usd: 0.5, month: '2026-09' }, { key: 'b|s', usd: 0.7, month: '2026-10' }]),
      'data-version.json': JSON.stringify({ data: 3 }),
      [`versions/${works[0].id}/index.html`]: '<h1>first try</h1>',
      'api-key.bin': 'sealed by the other build',
    };
    for (const [name, text] of Object.entries(seed)) {
      mkdirSync(join(old.data, name, '..'), { recursive: true });
      writeFileSync(join(old.data, name), text);
    }
    const contents = (dir) => filesIn(dir).map((f) => `${f}:${createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')}`);
    const before = contents(old.data);

    const home = freshHome();
    let shop = await launch({ lang, home, speed: SPEED, store: true, oldData: old.data });
    try {
      const card = await shop.maybe('.move-in-card', 8000);
      check(card, 'the Store build did not offer to bring the old shop over');
      const text = await card.innerText();
      check(text.includes(M.title) && text.includes('3') && text.includes('$1.20'), `the question does not say what is there: ${text}`);
      check(await shop.page.locator('.welcome').count() === 0, 'the welcome came up before the question was answered');
      const spills = await card.evaluate((c) => [...c.querySelectorAll('button, .card-title')].some((e) => e.scrollWidth > e.clientWidth + 1));
      check(!spills, 'a button or the title is cut off');
      await shop.shot(join(out, 'storemove-ask.png'));
      await card.$('button.default').then((b) => b.click());
      await sleep(2500);
      check(await shop.page.locator('.welcome').count() === 0, 'the welcome came up after moving in');
      await shop.hotspot(shop.L.ui.access.hotspotWorks);
      await shop.page.waitForSelector('.shelf-card li.work');
      check(await shop.page.locator('.shelf-card li.work').count() === 3, `the shelf shows ${await shop.page.locator('.shelf-card li.work').count()} of 3 works`);
      const shelf = await shop.page.locator('.shelf-card').innerText();
      for (const w of works) check(shelf.includes(w.title), `${w.title} is not on the shelf`);
      await shop.shot(join(out, 'storemove-shelf.png'));
      await shop.page.keyboard.press('Escape');
      await shop.openSettings('work');
      await shop.page.locator('.spend-months summary').click();
      await shop.page.waitForSelector('.spend-book tr');
      const rows = await shop.page.locator('.spend-book tr').allInnerTexts();
      check(rows.length === 3 && rows[2].includes('$1.20'), `the ledger reads ${JSON.stringify(rows)}`);
      check(existsSync(join(home.data, 'versions', works[0].id, 'index.html')), 'the kept versions did not come over');
      check(!existsSync(join(home.data, 'api-key.bin')), 'the key came over, which the Store build cannot read');
    } finally { await shop.close(); }
    check(JSON.stringify(contents(old.data)) === JSON.stringify(before), 'the installer build\'s folder changed');

    // Opened again: a shop of its own now, so nothing is asked.
    shop = await launch({ lang, home, speed: SPEED, store: true, oldData: old.data });
    try {
      await sleep(2500);
      check(await shop.page.locator('.move-in-card').count() === 0, 'asked again after moving in');
    } finally { await shop.close(); }

    // Saying no: the welcome, as for anyone new, and nothing copied.
    const declined = freshHome();
    shop = await launch({ lang, home: declined, speed: SPEED, store: true, oldData: old.data });
    try {
      const ask = await shop.maybe('.move-in-card', 8000);
      check(ask, 'no question the second time round');
      await ask.$('.actions button:not(.default)').then((b) => b.click());
      check(await shop.maybe('.welcome', 8000), 'no welcome after starting afresh');
      check(!existsSync(join(declined.data, 'memory.json')) && !existsSync(join(declined.data, 'spend.json')), 'something came over after no');
    } finally { await shop.close(); }

    // No old shop: nothing to ask.
    const empty = freshHome();
    shop = await launch({ lang, home: freshHome(), speed: SPEED, store: true, oldData: empty.data });
    try {
      check(await shop.maybe('.welcome', 8000), 'no welcome for a new Store user');
      check(await shop.page.locator('.move-in-card').count() === 0, 'asked to move in with nothing to bring');
    } finally { await shop.close(); }
    check(JSON.stringify(contents(old.data)) === JSON.stringify(before), 'the installer build\'s folder changed');
  },

  /** The Microsoft Store build: Claude Code missing, the steps are shown and the app offers no installer of its own. */
  async store(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, store: true, claudePath: join(home.home, 'no-claude-here') });
    try {
      await shop.hotspot(shop.L.ui.access.hotspotCounter);
      const card = await shop.maybe('.notice-card', 5000);
      check(card, 'no setup card without Claude Code');
      const text = await card.innerText();
      check(text.includes(shop.L.ui.setup.claudeStoreHint), 'the store hint is missing');
      check(!text.includes(shop.L.ui.setup.claudeInstall), 'the store build offers to run the installer');
      check(await shop.page.locator('.notice-card details.claude-manual[open]').count() === 1, 'the steps are not open');
      await shop.shot(join(out, 'store-steps.png'));
      // The Store keeps it up to date, so there is no switch for looking.
      await shop.page.keyboard.press('Escape');
      await shop.openSettings('about');
      check(!(await shop.page.locator('.settings').innerText()).includes(shop.L.ui.setup.updatesToggle), 'the store build offers to look for new versions');
    } finally { await shop.close(); }
  },

  /**
   * A new user from nothing: no settings, no Claude Code, no key. Welcome (name, look, what is missing,
   * the work folder), the free trial replay, then Claude Code "lands" (the stand-in appears where the app
   * looks), the key is pasted in the app, and the first commission ends up on the works shelf.
   * Checking the key would call Anthropic, so the main process's fetch is caught and answers 200.
   */
  async firstrun(lang, out) {
    const home = freshHome();
    // On Windows the app can only start a script that has its extension, and a symlink needs special rights.
    const windows = process.platform === 'win32';
    const claudeAt = join(home.home, '.local', 'bin', windows ? 'claude.mjs' : 'claude');
    // Linux test machines have no keyring; the basic store lets the app encrypt the key as it would on Windows.
    const shop = await launch({ lang, home, speed: SPEED, key: false, claudePath: claudeAt, args: ['--password-store=basic'] });
    const S = shop.L.ui.setup;
    try {
      const welcome = await shop.maybe('.welcome input[type=text]', 8000);
      check(welcome, 'no welcome card on a first start');
      await shop.shot(join(out, 'firstrun-1-welcome.png'));
      await welcome.fill(lang === 'en' ? 'Sam' : '小林');
      await shop.page.locator('.welcome button.default').click();
      await shop.page.waitForSelector('.welcome .env-rows');
      const rows = await shop.page.locator('.welcome .env-rows').innerText();
      check(rows.includes(S.claudeMissing.slice(0, 12)), 'Claude Code not reported missing');
      await shop.shot(join(out, 'firstrun-2-check.png'));
      await shop.page.locator('.welcome .actions button.default').last().click();
      await sleep(400);
      await shop.shot(join(out, 'firstrun-3-folder.png'));
      await shop.page.locator('.welcome .actions button.default').last().click();
      await sleep(1500);
      check(JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8')).onboarded === true, 'not marked as welcomed');

      // The counter: nothing is ready, so the card offers the free trial.
      await shop.hotspot(shop.L.ui.access.hotspotCounter);
      await shop.page.waitForSelector('.notice-card .trial-offer button');
      await shop.page.locator('.notice-card .trial-offer button').click();
      const end = await shop.maybe('.trial-end', 240_000);
      check(end, 'the trial replay did not end with its card');
      await shop.shot(join(out, 'firstrun-4-trial-end.png'));
      await shop.page.locator('.trial-end button.default').click();
      await shop.page.waitForSelector('.notice-card .env-rows');

      // Claude Code is installed (the stand-in appears where the app looks): the row turns green by itself.
      mkdirSync(join(claudeAt, '..'), { recursive: true });
      if (windows) writeFileSync(claudeAt, `import ${JSON.stringify(pathToFileURL(FAKE_CLAUDE).href)};
`);
      else symlinkSync(FAKE_CLAUDE, claudeAt);
      await shop.page.waitForSelector('.notice-card .env-row.ok', { timeout: 15_000 });

      // The key, pasted in the app; the check with Anthropic is caught here and says yes.
      await shop.app.evaluate(({ net, safeStorage }) => {
        net.fetch = async () => new Response('{}', { status: 200 });
        // Test machines only: Linux without a keyring has nothing to encrypt with; Windows always has DPAPI.
        if (process.platform === 'linux') safeStorage.setUsePlainTextEncryption(true);
      });
      // A wrong key first: the message names the prefix, and no line break lands inside it.
      await shop.page.fill('.notice-card .key-form input', 'not-a-key');
      await shop.page.locator('.notice-card .key-form button').click();
      await shop.page.waitForFunction(() => /sk-ant-/.test(document.querySelector('.notice-card .key-status')?.textContent ?? ''));
      const prefixLines = await shop.page.evaluate(() => {
        const part = document.querySelector('.notice-card .key-status .key-text');
        return part ? part.getClientRects().length : 0;
      });
      check(prefixLines === 1, `the key prefix is not kept on one line: ${prefixLines}`);
      await shop.page.fill('.notice-card .key-form input', 'sk-ant-api03-simulated-1111111111111111111111111111111111111111');
      await shop.page.locator('.notice-card .key-form button').click();
      const ready = await shop.maybe('.notice-card button.default', 10_000);
      const keyText = await shop.page.locator('.notice-card').innerText();
      check(ready, `the shop did not get ready after the key: ${JSON.stringify(keyText.slice(0, 300))}`);
      check(existsSync(join(home.data, 'api-key.bin')), 'the key was not stored');
      await shop.shot(join(out, 'firstrun-5-ready.png'));
      await ready.click();

      await shop.page.waitForSelector('form.commission');
      await shop.page.keyboard.press('Escape');
      check((await runOne(shop, { template: 'page', want: W[lang].page })).ok, 'the first commission did not finish');
      check(await shop.page.locator('.result-card .result-shelf').count() === 1, 'the first result does not mention the works shelf');
      await shop.shot(join(out, 'firstrun-6-first-result.png'));
      await shop.page.keyboard.press('Escape');
      await sleep(1200);
      await shop.hotspot(shop.L.ui.access.hotspotWorks);
      check(await shop.page.locator('.shelf-card li.work').count() === 1, 'the first work is not on the shelf');
    } finally { await shop.close(); }
  },

  /** No key yet: the trial replay plays without spending anything. */
  async trial(lang, out) {
    const home = freshHome({ 'settings.json': onboarded(lang) });
    const shop = await launch({ lang, home, speed: SPEED, key: false });
    try {
      await sleep(1500);
      await shop.shot(join(out, 'no-key.png'));
    } finally { await shop.close(); }
  },
};

const results = [];
for (const lang of LANGS) {
  const out = join(OUT, lang);
  mkdirSync(out, { recursive: true });
  for (const [name, run] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const t0 = Date.now();
    try {
      let timer;
      await Promise.race([run(lang, out), new Promise((_, no) => { timer = setTimeout(() => no(new Error('scenario took over 6 minutes')), 360_000); })]);
      clearTimeout(timer);
      results.push([lang, name, 'PASS', '']);
    } catch (err) {
      results.push([lang, name, 'FAIL', String(err?.message ?? err).slice(0, 2000)]);
    }
    const [, , status, why] = results.at(-1);
    console.log(`${status} ${lang} ${name} (${Math.round((Date.now() - t0) / 1000)}s) ${why}`);
  }
}
const failed = results.filter((r) => r[2] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
