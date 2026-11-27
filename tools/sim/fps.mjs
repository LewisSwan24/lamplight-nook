#!/usr/bin/env node
// How the shop runs on a slow computer (road-to-1.4.md D8): Chrome's CPU throttling slows the window down, and in each
// place (the street, every shop, and home while the street's shops work out of sight) it counts the frames Phaser
// draws, how long each takes from the start of its step to the end of its drawing, and what the app holds in memory.
//
//   node tools/sim/fps.mjs [--throttle 4,6] [--seconds 60] [--lang en] [--out sim-out/fps] [--app <checkout>] [--size medium] [--saving]
//
// `--app` measures another checkout (built), such as 1.3 for the memory baseline; it has no street or new shops, so
// only `home` is measured there. Writes fps-<rate>x.json and prints one line per place. Spends nothing.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freshHome, launch, locale, onboarded, ROOT, sleep } from './shop.mjs';

const opt = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const RATES = opt('throttle', '4,6').split(',').map(Number);
const SECONDS = Number(opt('seconds', '60'));
const LANG = opt('lang', 'en');
const OUT = opt('out', 'sim-out/fps');
const APP = resolve(opt('app', ROOT));
const SIZE = opt('size', 'medium');
const OTHER = APP !== ROOT;
// With the power-saving switch on (settings), as someone on a slow computer or a battery would have it.
const SAVING = process.argv.includes('--saving');
// Home only: for memory, measured several times over, this checkout and another one after the other.
const HOME_ONLY = OTHER || process.argv.includes('--home-only');

/** A kind of work each street shop does itself (road-to-1.4.md D3), to keep it busy out of sight. */
const BUSY = [['page', 'A small page for the bake sale.'], ['chart', 'A chart of the club\'s books this year.'], ['document', 'A notice about the weekend book club.']];

/** Counts drawn frames and times each, from Phaser's step to the end of its drawing. */
const METER = () => {
  const game = window.lamplightDebug.scene.game;
  const m = { frames: 0, ms: [], t0: 0, on: false };
  game.events.on('prestep', () => { m.t0 = performance.now(); });
  game.events.on('postrender', () => { if (m.on) { m.frames++; m.ms.push(performance.now() - m.t0); } });
  window.meter = {
    start() { m.frames = 0; m.ms = []; m.on = true; m.since = performance.now(); },
    read() {
      m.on = false;
      const secs = (performance.now() - m.since) / 1000;
      const sorted = [...m.ms].sort((a, b) => a - b);
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
      window.gc?.();
      return { fps: m.frames / secs, frameMs: { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 }, heapMB: performance.memory.usedJSHeapSize / 2 ** 20 };
    },
  };
};

async function appMB(shop) {
  // Private memory, every process of the app together: the working set swings as Windows trims it.
  return shop.app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, p) => sum + (p.memory.privateBytes ?? p.memory.workingSetSize), 0) / 1024);
}

/** Stay a while, moving the mouse now and then so the shop does not drop to its resting rate (pacer.ts). */
async function stay(shop, seconds) {
  const box = await shop.page.locator('canvas').boundingBox();
  await shop.page.evaluate(() => window.meter.start());
  for (let left = seconds; left > 0; left -= 10) {
    await sleep(Math.min(left, 10) * 1000);
    await shop.page.mouse.move(box.x + 20 + (left % 40), box.y + box.height - 10);
  }
  return shop.page.evaluate(() => window.meter.read());
}

const room = (page) => page.evaluate(() => window.lamplightDebug.scene.room);
async function visit(page, id) {
  await page.evaluate((i) => window.lamplightDebug.street.onFront(i, true), id);
  for (const end = Date.now() + 15_000; Date.now() < end && await room(page).catch(() => null) !== id; await sleep(300));
  await sleep(2500);
}

mkdirSync(OUT, { recursive: true });
let failed = false;
for (const rate of RATES) {
  const home = freshHome({ 'settings.json': onboarded(LANG, SAVING ? { powerSaving: true } : {}) });
  const hold = join(home.home, 'hold');
  const shop = await launch({ lang: LANG, home, size: SIZE, appDir: APP, scenario: 'hold', simEnv: { SIM_HOLD: hold } });
  const results = [];
  try {
    await sleep(4000);
    await shop.page.evaluate(METER);
    const cdp = await shop.page.context().newCDPSession(shop.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const measure = async (place) => {
      const r = { place, ...(await stay(shop, SECONDS)), appMB: await appMB(shop) };
      results.push(r);
      console.log(`${rate}x ${place.padEnd(12)} ${r.fps.toFixed(1)} fps  p50 ${r.frameMs.p50.toFixed(1)} ms  p95 ${r.frameMs.p95.toFixed(1)} ms  heap ${r.heapMB.toFixed(0)} MB  app ${r.appMB.toFixed(0)} MB`);
    };
    await measure('home');
    if (!HOME_ONLY) {
      await shop.page.locator(`.toolbar button.tool-btn[aria-label="${locale(LANG, APP).ui.toolbar.street}"]`).click();
      await shop.page.evaluate(() => window.lamplightDebug.street.lookAt('print'));
      await sleep(2500);
      await measure('street');
      // The river street (plan-2.0.md J1), which another checkout from before 2.0 does not have.
      if (!OTHER) {
        await shop.page.evaluate(() => window.lamplightDebug.street.lookAt('florist'));
        await sleep(2500);
        await measure('river');
      }
      for (const id of ['print', 'studio', 'workshop', 'bakery', 'post']) {
        await visit(shop.page, id);
        await measure(id);
      }
      // Home, with every street shop at work out of sight: held halfway, so the rooms stay built and busy.
      await visit(shop.page, 'cafe');
      writeFileSync(hold, '');
      for (const [i, [template, want]] of BUSY.entries()) {
        if (i === 0) {
          await shop.order({ template, want });
          await shop.submit();
        } else {
          // Another order, from the counter of the room the view followed the last one to (as accept.mjs another()).
          const at = await room(shop.page);
          await shop.hotspot(shop.L.sceneText[at]?.ui.access.hotspotCounter ?? shop.L.ui.access.hotspotCounter);
          await shop.page.locator('.running-card .progress-another').click();
          await shop.page.waitForSelector('form.commission');
          const chip = shop.page.locator('form.commission .template-chip', { hasText: shop.L.ui.templates[template] });
          if (!(await chip.getAttribute('class')).includes('on')) await chip.click();
          await shop.page.fill('form.commission textarea', want);
          await shop.submit();
        }
        await sleep(6000);
      }
      await visit(shop.page, 'cafe');
      const busy = await shop.page.evaluate(() => [...window.lamplightDebug.rooms.keys()]);
      console.log(`${rate}x rooms built (a third order waits its turn): ${busy.join(', ')}`);
      await measure('home+away');
      // Again, once whatever came with going home has settled.
      await measure('home+away 2');
    }
  } catch (err) {
    failed = true;
    console.error(`${rate}x failed: ${err.stack ?? err}`);
  } finally {
    await shop.close();
  }
  writeFileSync(join(OUT, `fps-${rate}x${OTHER ? '-other' : ''}${SAVING ? '-saving' : ''}.json`), JSON.stringify({ rate, seconds: SECONDS, lang: LANG, app: APP, results }, null, 1));
}
process.exit(failed ? 1 : 0);
