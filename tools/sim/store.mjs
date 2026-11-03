#!/usr/bin/env node
// Store and website screenshots, from the built app driven against the stand-in Claude.
//
//   npm run build && node tools/sim/store.mjs [--lang zh-CN,en] [--out store-out]
//
// First a shop is "grown" by finishing eight commissions (so the works shelf and the shop's growth show),
// then each picture is taken at 1920x1080 in daylight. Output:
//   <out>/<lang>/NN-name.png     full size, for the Microsoft Store
//   <out>/site/<zh|en>-NN-name.jpg  1280x720, for the website (copy into the site repository's img/)
// Candidates for the busy blackboard are kept as <out>/<lang>/candidates/02-board-*.png.

import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshHome, launch, onboarded, sleep, ROOT } from './shop.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const LANGS = opt('lang', 'zh-CN,en').split(',');
const OUT = join(ROOT, opt('out', 'store-out'));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;

const W = {
  'zh-CN': {
    page: '帮我做一个家庭聚会签到的小网页。',
    pageDetails: '要能填名字和带几个人，最后显示一共多少人。',
    album: '用这些照片做一本秋天出游的小相册。',
    photos: ['银杏大道.png', '湖边野餐.png', '回家路上.png'],
    grow: [
      ['research', '帮我查一查阳台种番茄要注意什么，写一份简短的总结。'],
      ['letter', '帮我写一封给房东的信，说下个月底退租。'],
      ['sheet', '帮我做一个记每月开销的表格。'],
      ['plan', '帮我排一个四周学会游泳换气的计划。'],
      ['page', '帮我做一个番茄钟小网页。'],
      ['page', '帮我做一个记录每天喝了几杯水的小网页。'],
      ['research', '帮我查一查家用空气净化器怎么选，写一份简短的总结。'],
      ['letter', '帮我写一封邮件，请同事下周帮我代班两天。'],
    ],
  },
  en: {
    page: 'Make me a small web page for a family reunion sign-in.',
    pageDetails: 'Names, how many are coming, and a total.',
    album: 'Make a little album of these photos: our autumn trip.',
    photos: ['ginkgo-avenue.png', 'lakeside-picnic.png', 'walk-home.png'],
    grow: [
      ['research', 'Look into growing tomatoes on a balcony and write me a short summary.'],
      ['letter', 'Write a letter to my landlord about moving out at the end of next month.'],
      ['sheet', 'Make me a table for monthly spending.'],
      ['plan', 'Plan out four weeks of learning to breathe while swimming for me.'],
      ['page', 'Make me a small web page that works as a pomodoro timer.'],
      ['page', 'Make me a small web page to count the glasses of water I drink.'],
      ['research', 'Look into how to choose a home air purifier and write me a short summary.'],
      ['letter', 'Write an email asking a colleague to cover two of my shifts next week.'],
    ],
  },
};

const pick = (name) => !ONLY || ONLY.includes(name);

/** Photos to hand over: pixel scenes from the app's own art, under friendly names. */
function photos(home, lang) {
  const dir = join(home.home, lang === 'en' ? 'Pictures' : '照片');
  mkdirSync(dir, { recursive: true });
  const art = join(ROOT, 'assets', 'sprites');
  const sources = ['cafe.png', 'study.png', 'garden.png'].filter((f) => readdirSync(art).includes(f));
  while (sources.length < 3) sources.push('cafe.png');
  return W[lang].photos.map((name, i) => {
    const to = join(dir, name);
    copyFileSync(join(art, sources[i]), to);
    return to;
  });
}

/** Finish eight quick commissions so the shop has grown and the works shelf is full. */
async function grownShop(lang) {
  const home = freshHome({ 'settings.json': onboarded(lang) });
  const shop = await launch({ lang, home, speed: 30 });
  try {
    for (const [template, text] of W[lang].grow) {
      await shop.order({ template, want: text });
      await shop.submit();
      const r = await shop.workUntilDone();
      if (!r.ok) throw new Error(`growing the shop: ${template} did not finish`);
      await shop.page.keyboard.press('Escape');
      await sleep(2500);
    }
  } finally { await shop.close(); }
  return home;
}

/** A copy of a grown home, so each session starts from the same shop. */
function cloneHome(home) {
  const copy = freshHome();
  rmSync(copy.home, { recursive: true, force: true });
  cpSync(home.home, copy.home, { recursive: true });
  return copy;
}

async function closeCards(shop) {
  for (let i = 0; i < 3; i++) { await shop.page.keyboard.press('Escape'); await sleep(250); }
}

async function shots(lang, grown) {
  const out = join(OUT, lang);
  const cand = join(out, 'candidates');
  mkdirSync(cand, { recursive: true });
  const w = W[lang];

  // The slip, the photos handed over, the real plan on the blackboard, the result, the shelf, the notebook, the garden.
  {
    const home = cloneHome(grown);
    const files = photos(home, lang);
    const shop = await launch({ lang, home, size: 'large', speed: 1100 });
    try {
      await sleep(6000); // let Adeng's greeting pass
      await closeCards(shop);
      if (pick('order')) {
        await shop.order({ template: 'page', want: w.page, details: w.pageDetails });
        await shop.page.locator('form.commission textarea').evaluate((t) => t.blur());
        await sleep(600);
        await shop.shot(join(out, '01-order.png'));
        await closeCards(shop);
      }
      if (pick('materials')) {
        await shop.order({ template: 'album', want: w.album, files });
        await shop.page.locator('form.commission textarea').evaluate((t) => t.blur());
        await sleep(600);
        await shop.shot(join(out, '03-materials.png'));
        await closeCards(shop);
      }
      if (pick('board') || pick('result')) {
        await shop.order({ template: 'page', want: w.page, details: w.pageDetails });
        await shop.submit();
        let n = 0;
        const r = await shop.workUntilDone({ onTick: async (ms) => {
          if (ms > 4000 + n * 2500 && n < 14) {
            n++;
            const tag = String(n).padStart(2, '0');
            await shop.shot(join(cand, `02-board-${tag}.png`));
            // The whole plan, as the blackboard's card shows it, while the work goes on.
            if (await shop.page.locator('button.hotspot[aria-label="' + shop.L.ui.access.hotspotBoard + '"]').count()) {
              await shop.hotspot(shop.L.ui.access.hotspotBoard).catch(() => {});
              await sleep(500);
              if (await shop.page.locator('.plan-card').isVisible()) {
                await shop.shot(join(cand, `02-plan-${tag}.png`));
                // Close this card only: by now the result card may have taken its place.
                await shop.page.locator('.plan-card button.close').click({ timeout: 1000 }).catch(() => {});
              }
            }
          }
        } });
        if (!r.ok) throw new Error('the page commission did not finish');
        // The store picture: the plan card halfway through, some items done and one under way.
        const plans = readdirSync(cand).filter((f) => f.startsWith('02-plan-')).sort();
        if (plans.length) copyFileSync(join(cand, plans[Math.floor(plans.length / 2)]), join(out, '02-board.png'));
        await sleep(2500);
        await shop.shot(join(out, '05-result.png'));
        await closeCards(shop);
        await sleep(1500);
      }
      if (pick('shelf')) {
        await shop.hotspot(shop.L.ui.access.hotspotWorks);
        await sleep(800);
        await shop.shot(join(out, '08-shelf.png'));
        await closeCards(shop);
      }
      if (pick('notebook')) {
        await shop.page.locator('.toolbar button.tool-btn').nth(3).click();
        await sleep(800);
        await shop.shot(join(out, '06-notebook.png'));
        await closeCards(shop);
      }
      if (pick('garden')) {
        await shop.hotspot(shop.L.ui.access.hotspotGarden);
        await sleep(9000);
        await shop.shot(join(out, '07-garden.png'));
        await shop.hotspot(shop.L.ui.access.hotspotShop).catch(() => {});
        await sleep(3000);
      }
    } finally { await shop.close(); }
  }

  // The demo's colour question and the serious card before deleting the drafts.
  if (pick('question')) {
    const home = cloneHome(grown);
    const shop = await launch({ lang, home, size: 'large', speed: 900 });
    try {
      await sleep(5000);
      await closeCards(shop);
      await shop.order({ template: 'demo' });
      await shop.submit();
      let asked = 0;
      await shop.workUntilDone({ answers: () => null, onTick: async () => {
        const d = await shop.page.$('.backdrop');
        if (!d || !(await d.isVisible())) return;
        const serious = await shop.page.$('.backdrop .serious');
        await sleep(1200);
        await shop.shot(join(out, serious ? '04b-serious.png' : '04-question.png'));
        asked++;
      } });
      void asked;
    } finally { await shop.close(); }
  }

  // The corner window over a dimmed shop, then furnishing, then the study.
  if (pick('mini')) {
    const home = cloneHome(grown);
    const shop = await launch({ lang, home, size: 'large', speed: 1100 });
    try {
      await sleep(5000);
      await closeCards(shop);
      await shop.order({ template: 'research', want: W[lang].grow[6][1] });
      await shop.submit();
      await sleep(9000);
      const mini = await shop.away();
      if (!mini) throw new Error('no corner window');
      await mini.screenshot({ path: join(cand, '10-mini-window.png') });
      composeMini(join(cand, '10-mini-window.png'), join(out, '10-mini.png'));
    } finally { await shop.close(); }
  }

  if (pick('furnish') || pick('study')) {
    const home = cloneHome(grown);
    const shop = await launch({ lang, home, size: 'large', speed: 900 });
    try {
      await sleep(5000);
      await closeCards(shop);
      if (pick('furnish')) {
        await shop.openSettings('furnish');
        for (const [i, choice] of [[0, 'sage'], [1, 'rose'], [2, 'green']]) {
          await shop.page.locator('.settings .swatches').nth(i).locator(`button.swatch[data-choice="${choice}"]`).click();
          await sleep(300);
        }
        await sleep(500);
        await shop.shot(join(cand, '11-furnish-settings.png'));
        await closeCards(shop);
        await sleep(1500);
        await shop.shot(join(out, '11-furnish.png'));
      }
      if (pick('study')) {
        await shop.openSettings('basics');
        await shop.page.locator('.settings .scene-picker button.scene-choice').last().click();
        await shop.page.locator('.settings button.sticker', { hasText: shop.L.ui.scene.move }).click();
        await sleep(10000);
        await closeCards(shop);
        await sleep(3000);
        await shop.shot(join(out, '09-study.png'));
      }
    } finally { await shop.close(); }
  }
}

/** The corner window as it sits on a desktop (tools/sim/desktop.py draws the desktop). */
function composeMini(win, to) {
  execFileSync('python3', [join(ROOT, 'tools', 'sim', 'desktop.py'), win, to]);
}

/** Website copies: 1280x720 JPEGs named <zh|en>-NN-name.jpg. */
function siteCopies(lang) {
  const dir = join(OUT, 'site');
  mkdirSync(dir, { recursive: true });
  const short = lang === 'en' ? 'en' : 'zh';
  for (const f of readdirSync(join(OUT, lang)).filter((f) => /^\d\d-[\w-]+\.png$/.test(f))) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(OUT, lang, f), '-vf', 'scale=1280:720:flags=area', '-q:v', '3',
      join(dir, `${short}-${f.replace(/\.png$/, '.jpg')}`)]);
  }
}

mkdirSync(OUT, { recursive: true });
for (const lang of LANGS) {
  // A shop grown by an earlier run is reused unless --fresh is given.
  const saved = join(OUT, `${lang}-home.txt`);
  let grown = !args.includes('--fresh') && existsSync(saved) && existsSync(readFileSync(saved, 'utf8').trim())
    ? { home: readFileSync(saved, 'utf8').trim() } : null;
  if (!grown) {
    console.log(`${lang}: growing a shop...`);
    grown = await grownShop(lang);
    writeFileSync(saved, grown.home);
  }
  console.log(`${lang}: taking pictures...`);
  await shots(lang, grown);
  siteCopies(lang);
  console.log(`${lang}: done`);
}
