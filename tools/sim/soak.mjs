#!/usr/bin/env node
// Keep the shop open for a very long time: commission after commission with the stand-in Claude, looking at the
// shelf, the notebook and the garden in between. Every few rounds it writes down what the app is holding on to, then
// compares the second half of the run with the first, because a leak only shows up over time.
//
//   node tools/sim/soak.mjs --rounds 100 --every 5 --out sim-out/soak [--lang en] [--speed 60]
//   node tools/sim/soak.mjs --idle 120 --out sim-out/soak-idle       (the shop left open with nothing on, in minutes)
//
// Exit 1 if something keeps growing. Spends nothing: the stand-in never touches the network.

import { appendFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareHalves } from './halves.mjs';
import { freshHome, launch, onboarded, sleep } from './shop.mjs';

const sizeOf = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
  const p = join(dir, e.name);
  return sum + (e.isDirectory() ? sizeOf(p) : statSync(p).size);
}, 0);

async function reading(shop, round) {
  await sleep(1500);
  const page = await shop.page.evaluate(() => {
    window.gc();
    const { scene } = window.lamplightDebug;
    return {
      objects: scene.children.list.length,
      tweens: scene.tweens.getTweens().length,
      timers: scene.time._active.length + scene.time._pendingInsertion.length,
      dom: document.querySelectorAll('*').length,
      heapMB: performance.memory.usedJSHeapSize / 2 ** 20,
    };
  });
  const main = await shop.app.evaluate(({ ipcMain }) => {
    globalThis.gc?.();
    return {
      mainHeapMB: process.memoryUsage().heapUsed / 2 ** 20,
      listeners: ipcMain.eventNames().reduce((sum, name) => sum + ipcMain.listenerCount(name), 0),
    };
  });
  return { round, ...page, ...main, dataMB: sizeOf(shop.home.data) / 2 ** 20 };
}

/** Do what someone does between commissions: look at things and put them away. */
async function lookAround(shop, round) {
  const A = shop.L.ui.access;
  if (round % 2 === 0) {
    await shop.page.locator('.toolbar button.tool-btn').nth(1).click();
    await sleep(500);
    await shop.page.keyboard.press('Escape');
  }
  if (round % 3 === 0) {
    await shop.page.locator('.toolbar button.tool-btn').nth(2).click();
    await sleep(500);
    await shop.page.keyboard.press('Escape');
  }
  if (round % 4 === 0) {
    await shop.hotspot(A.hotspotGarden);
    await sleep(1500);
    await shop.hotspot(A.hotspotShop);
    await sleep(800);
  }
}

/** Left open with nothing on: the staff wander, go out to the garden and chat. A reading every five minutes. */
async function idle({ minutes, out, lang }) {
  mkdirSync(out, { recursive: true });
  const log = join(out, `idle-${lang}.jsonl`);
  writeFileSync(log, '');
  const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang) }), size: 'small', debug: true, args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const readings = [];
  try {
    for (let m = 5; m <= minutes; m += 5) {
      await sleep(5 * 60_000);
      const r = await reading(shop, m);
      readings.push(r);
      appendFileSync(log, `${JSON.stringify(r)}\n`);
      console.log(`${m} min: ${JSON.stringify(r)}`);
    }
  } finally {
    await shop.close();
  }
  const result = compareHalves(readings);
  writeFileSync(join(out, `idle-result-${lang}.json`), JSON.stringify({ minutes, result, last: readings.at(-1) }, null, 2));
  console.table(result);
  return Object.values(result).some((r) => r.leaking) ? 1 : 0;
}

async function soak({ rounds, every, out, lang, speed }) {
  mkdirSync(out, { recursive: true });
  const log = join(out, `readings-${lang}.jsonl`);
  writeFileSync(log, '');
  const home = freshHome({ 'settings.json': onboarded(lang) });
  const shop = await launch({ lang, home, size: 'small', speed, debug: true, simEnv: { SIM_COST: '0' }, args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const TEMPLATES = ['page', 'research', 'letter', 'sheet', 'plan'];
  const readings = [];
  const started = Date.now();
  try {
    await sleep(2500);
    for (let round = 1; round <= rounds; round++) {
      const template = TEMPLATES[round % TEMPLATES.length];
      await shop.order({ template, want: `第 ${round} 单：${template}` });
      await shop.submit();
      let r = await shop.workUntilDone({ answers: (card) => (card.serious ? null : 1) });
      for (let i = 0; !r.ok && r.stopped && i < 12; i++) {
        await shop.retry();
        r = await shop.workUntilDone({ answers: (card) => (card.serious ? null : 1) });
      }
      if (!r.ok) throw new Error(`round ${round} did not finish: ${JSON.stringify(r).slice(0, 300)}`);
      await shop.page.keyboard.press('Escape');
      await sleep(600);
      // A newcomer's first-order cards and the like: anything left over is put away the same way.
      await lookAround(shop, round);
      if (round % every === 0) {
        const r = await reading(shop, round);
        readings.push(r);
        appendFileSync(log, `${JSON.stringify(r)}\n`);
        console.log(`round ${round} (${Math.round((Date.now() - started) / 60000)} min): ${JSON.stringify(r)}`);
      }
    }
  } catch (e) {
    await shop.shot(join(out, `failed-${lang}.png`));
    throw e;
  } finally {
    await shop.close();
  }
  const result = compareHalves(readings);
  writeFileSync(join(out, `result-${lang}.json`), JSON.stringify({ rounds, minutes: (Date.now() - started) / 60000, result, last: readings.at(-1) }, null, 2));
  console.table(result);
  return Object.values(result).some((r) => r.leaking) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, otherwise) => {
    const i = process.argv.indexOf(`--${name}`);
    return i < 0 ? otherwise : process.argv[i + 1];
  };
  const common = { out: arg('out', 'sim-out/soak'), lang: arg('lang', 'zh-CN') };
  const code = arg('idle')
    ? await idle({ ...common, minutes: Number(arg('idle')) })
    : await soak({ ...common, rounds: Number(arg('rounds', 100)), every: Number(arg('every', 5)), speed: Number(arg('speed', 60)) });
  process.exit(code);
}
