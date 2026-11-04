#!/usr/bin/env node
// A long-time user, upgrading: one shop is used with 0.5.0, then 0.6.1, then 0.7.0, then this checkout,
// doing a few commissions with each, and a copy of the whole home is kept after each version.
// The copies are what upgrades have to cope with; tests/fixtures/userdata/ holds their data files.
//
//   # build the old versions first, each in its own checkout sharing node_modules:
//   git worktree add --detach ../old/0.5.0 c8d0f30 && ln -s "$PWD/node_modules" ../old/0.5.0/node_modules
//   (cd ../old/0.5.0 && npx electron-vite build)          # likewise 0.6.1 (0b3fbdc) and 0.7.0 (a0b70a8)
//   npm run build && node tools/sim/legacy.mjs --old ../old [--lang zh-CN,en] [--out legacy-out] [--fixtures]
//
// --fixtures also writes the data files of the Chinese run to tests/fixtures/userdata/<version>/,
// with the throwaway home replaced by {HOME}.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freshHome, launch, onboarded, sleep, ROOT } from './shop.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const OLD = resolve(opt('old', join(ROOT, '..', 'old')));
const LANGS = opt('lang', 'zh-CN,en').split(',');
const OUT = join(ROOT, opt('out', 'legacy-out'));

const W = {
  'zh-CN': {
    page: '帮我做一个记录每天喝了几杯水的小网页。',
    research: '帮我查一查阳台种番茄要注意什么，写一份简短的总结。',
    page2: '帮我做一个番茄钟小网页。',
    ask: '颜色再浅一点',
    album: '用这些照片做一本秋天出游的小相册。',
  },
  en: {
    page: 'Make me a small web page to count the glasses of water I drink.',
    research: 'Look into growing tomatoes on a balcony and write me a short summary.',
    page2: 'Make me a small web page that works as a pomodoro timer.',
    ask: 'Make the colours a bit lighter',
    album: 'Make a little album of these photos: our autumn trip.',
  },
};

async function commission(shop, order, answers) {
  await shop.order(order);
  await shop.submit();
  const r = await shop.workUntilDone({ answers });
  if (!r.ok) throw new Error(`${order.template ?? 'commission'} did not finish: ${JSON.stringify(r).slice(0, 200)}`);
  return r;
}

async function closeCard(shop) {
  await shop.page.keyboard.press('Escape');
  await sleep(1500);
}

/** What each version does in the shop. */
const STEPS = {
  '0.5.0': async (shop, w) => {
    await commission(shop, { template: 'demo' }, (card) => (card.serious ? null : 1)); // picks the second colour
    await closeCard(shop);
    await commission(shop, { template: 'page', want: w.page });
    await closeCard(shop);
  },
  '0.6.1': async (shop, w) => {
    await commission(shop, { template: 'research', want: w.research });
    await closeCard(shop);
  },
  '0.7.0': async (shop, w) => {
    await commission(shop, { template: 'page', want: w.page2 });
    // Another round on the work just made, so there is a previous version kept aside.
    await shop.page.locator('.result-revise').click();
    await shop.page.fill('form.revise textarea', w.ask);
    await shop.page.locator('form.revise button.default').click();
    const r = await shop.workUntilDone();
    if (!r.ok) throw new Error('the round of changes did not finish');
    await closeCard(shop);
    // Then the computer goes down halfway through one more commission: it is left pending.
    await shop.order({ template: 'research', want: w.research });
    await shop.submit();
    const pending = join(shop.home.data, 'pending.json');
    for (let i = 0; i < 100 && !existsSync(pending); i++) await sleep(50);
    if (!existsSync(pending)) throw new Error('0.7.0 did not note the running commission');
    // A hard stop: closing normally clears the note, and Node's kill on Windows can still let the app close itself.
    const proc = shop.app.process();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
    await sleep(500);
    if (!existsSync(pending)) throw new Error('the note of the running commission did not survive the hard stop');
  },
  current: async (shop, w, home) => {
    // The commission 0.7.0 left unfinished is offered first; carry on with it.
    const resume = await shop.maybe('.pending-card button.default', 5000);
    if (!resume) throw new Error('the unfinished commission from 0.7.0 was not offered');
    await resume.click();
    const r = await shop.workUntilDone();
    if (!r.ok) throw new Error('the unfinished commission did not finish after the upgrade');
    await closeCard(shop);
    const dir = join(home.home, 'photos');
    mkdirSync(dir, { recursive: true });
    const photos = ['cafe.png', 'study.png'].map((f) => {
      cpSync(join(ROOT, 'assets', 'sprites', f), join(dir, f));
      return join(dir, f);
    });
    await commission(shop, { template: 'album', want: w.album, files: photos });
    await closeCard(shop);
    await shop.openSettings('furnish');
    await shop.page.locator('.settings .swatches').nth(0).locator('button.swatch[data-choice="sky"]').click();
    await sleep(500);
    await closeCard(shop);
  },
};

/** The data files of a home, with the home's own path replaced so they can live in the repository. */
function dataFiles(home) {
  const data = join(home, '.config', 'Lamplight Nook');
  const out = {};
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(p).isDirectory()) {
        if (name === 'versions') walk(p, r);
        continue;
      }
      if (r.startsWith('versions/') && !r.endsWith('.json')) { out[r] = '(file)'; continue; }
      if (name.endsWith('.json')) out[r] = readFileSync(p, 'utf8').split(home).join('{HOME}');
    }
  };
  walk(data, '');
  return out;
}

for (const lang of LANGS) {
  const home = freshHome({ 'settings.json': onboarded(lang, { budgetUsd: 5 }) });
  for (const version of ['0.5.0', '0.6.1', '0.7.0', 'current']) {
    const appDir = version === 'current' ? ROOT : join(OLD, version);
    if (!existsSync(join(appDir, 'out', 'main', 'index.js'))) throw new Error(`${appDir} is not built`);
    console.log(`${lang}: ${version}...`);
    const shop = await launch({ lang, home, appDir, speed: 60 });
    try {
      await sleep(4000);
      if (version !== 'current') await shop.page.keyboard.press('Escape');
      await STEPS[version](shop, W[lang], home);
    } finally {
      await shop.close();
    }
    const snap = join(OUT, lang, version);
    rmSync(snap, { recursive: true, force: true });
    mkdirSync(snap, { recursive: true });
    cpSync(home.home, join(snap, 'home'), { recursive: true, filter: (src) => !/[\\/](Cache|Code Cache|GPUCache|DawnGraphiteCache|DawnWebGPUCache|Crashpad|logs|recordings|\.cache|\.pki)([\\/]|$)/.test(src) });
    writeFileSync(join(snap, 'home.txt'), home.home);
    if (args.includes('--fixtures') && lang === 'zh-CN' && version !== 'current') {
      const dir = join(ROOT, 'tests', 'fixtures', 'userdata', version);
      rmSync(dir, { recursive: true, force: true });
      for (const [rel, text] of Object.entries(dataFiles(home.home))) {
        mkdirSync(join(dir, rel, '..'), { recursive: true });
        writeFileSync(join(dir, rel), text);
      }
    }
  }
}
console.log('done');
process.exit(0);
