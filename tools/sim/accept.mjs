#!/usr/bin/env node
// Simulated acceptance run: drives the built app through every kind of commission and the features around them,
// in Chinese and English, against the stand-in Claude. Nothing is spent and no real credentials can be reached.
//
//   npm run build && node tools/sim/accept.mjs [--lang zh-CN,en] [--only demo,board,...] [--out sim-out]
//
// Each scenario prints PASS or FAIL with the reason, and leaves screenshots in <out>/<lang>/.

import { pathToFileURL } from 'node:url';
import { closeSync, cpSync, existsSync, ftruncateSync, openSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { mainCards } from './cards.mjs';
import { pdfSays, readPdf } from './pdftext.mjs';
import { FAKE_CLAUDE, freshHome, launch, locale, onboarded, sleep, ROOT } from './shop.mjs';

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
  return { photos, note, doc, messy };
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

const check = (cond, why) => { if (!cond) throw new Error(why); };
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
    home = freshHome({ 'settings.json': onboarded(lang), 'memory.json': 'garbage', 'pending.json': JSON.stringify({ workDir: join(tmpdir(), 'nowhere'), form: { want: 'x' }, id: 'c1' }) });
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
      check(existsSync(join(home.data, 'pending.json')), 'the commission was given up on although the answer was to keep going');
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
      check(existsSync(join(home.data, 'pending.json')), 'the commission was not noted as under way');
      // The answer is "stop and close", and the window stays long enough for the commission to finish first.
      await shop.app.evaluate(({ BrowserWindow, dialog }) => {
        dialog.showMessageBoxSync = () => 1;
        const main = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini'));
        main.on('close', (e) => e.preventDefault());
        main.close();
      });
      check((await shop.workUntilDone()).ok, 'the commission did not finish');
      await sleep(500);
      check(!existsSync(join(home.data, 'pending.json')), 'a finished commission would be offered again next time');
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
      return JSON.parse(readFileSync(join(shop.home.data, 'pending.json'), 'utf8')).workDir;
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
    await shop.page.evaluate(() => window.lamplight.cancelCommission());
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
   * Every season and every festival in a shop past a hundred works (road-to-1.1.md A9): the season's vase on the big
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

  /** All twelve templates, one after another in the same shop; each leaves its file and a shelf item. */
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
    ];
    const shop = await launch({ lang, home, speed: SPEED });
    try {
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
        if (template === 'sheet') check(readFileSync(join(dir, file), 'utf8').charCodeAt(0) === 0xfeff, 'table has no BOM');
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
      check(existsSync(join(home.data, 'pending.json')), 'the commission was not noted as under way');
      const closing = new Date().toISOString();
      await quit(shop, 1);
      const went = logged(home, install);
      check(went.length === 2 && went[1].slice(0, 24) >= closing, `the update did not go in after "stop and close": ${went.join(' | ')}`);
      check(existsSync(join(home.data, 'pending.json')), 'the stopped commission will not be offered next time');
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
    const buttons = page.locator('.toolbar button.tool-btn');
    const tip = (i) => buttons.nth(i).getAttribute('data-tip');
    const tipShown = (i) => buttons.nth(i).evaluate((b) => getComputedStyle(b, '::after').opacity === '1');
    const settingsFile = () => JSON.parse(readFileSync(join(home.data, 'settings.json'), 'utf8'));
    try {
      const want = [L.ui.toolbar.order, L.ui.projects.button, L.ui.shelf.title, L.ui.notebook.title, L.ui.access.captionsButton, L.ui.toolbar.mute, L.ui.toolbar.settings];
      check(await buttons.count() === 7, `the toolbar has ${await buttons.count()} buttons`);
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
      { name: 'captions', sel: '.caption-card', w: 'reading', open: () => window.lamplightDebug.ui.showCaptionLog() },
      { name: 'update-letter', sel: '.update-letter', w: 'reading', open: ({ long }) => window.lamplightDebug.ui.showUpdateLetter({ version: '1.1.1', notes: Array.from({ length: 16 }, (_, i) => (i % 4 ? `\u00B7 ${long.slice(0, 70)}` : long.slice(0, 12))) }) },
      ...['basics', 'furnish', 'sight', 'work', 'about'].map((tab) => ({ name: `settings-${tab}`, sel: '.card.settings', w: 'form', tab })),
      { name: 'legal-terms', sel: '.card.legal', w: 'reading', open: () => window.lamplightDebug.ui.showLegal('terms') },
      { name: 'legal-notices', sel: '.card.legal', w: 'reading', open: () => window.lamplightDebug.ui.showLegal('notices') },
      // Cards that must be answered: no close button, and Esc does not put them away.
      { name: 'pending', sel: '.pending-card', w: 'small', must: true, open: ({ long }) => window.lamplightDebug.ui.showPending({ want: long }), answer: '.pending-card button.default' },
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
      check(await page.locator('.toolbar button.tool-btn').count() === 6, 'no toolbar after the welcome');
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
