// What a screen reader would be told. Every button, box and tab on every main card has to have a name, from Chromium's own
// accessibility tree, not from guessing at the markup. This is not a test with a real screen reader.
//
//   node tools/sim/names.mjs --lang zh-CN --out sim-out/names

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mainCards } from './cards.mjs';
import { ROOT, freshHome, launch, onboarded, sleep } from './shop.mjs';

const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const lang = option('lang', 'zh-CN');
const out = resolve(option('out', join(ROOT, 'sim-out', 'names')));
mkdirSync(out, { recursive: true });

const NAMED = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'slider', 'tab', 'switch', 'menuitem', 'spinbutton', 'listbox']);
const memory = {
  commissions: Array.from({ length: 8 }, (_, i) => ({ id: `c${1760000000000 + i * 86400000}`, title: 'A commission', date: '2026-10-20', result: 'done', choices: { Q: 'A' }, costUsd: 0.2, folder: 'C:/nowhere', form: { want: 'x', template: 'letter' } })),
  stuckNotes: [], greeted: 'c1', shop: { done: 8, told: [], grown: [], met: [] },
};
const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory) }), debug: true });
const { page } = shop;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Accessibility.enable');

/** Everything on the page that can take a name, with what it is called; `within` keeps to one card. */
async function nodes() {
  const { nodes: tree } = await cdp.send('Accessibility.getFullAXTree');
  return tree.filter((n) => !n.ignored && NAMED.has(n.role?.value)).map((n) => ({ role: n.role.value, name: n.name?.value ?? '', backend: n.backendDOMNodeId }));
}
const describe = async (backend) => {
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: backend });
  const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return this.outerHTML.slice(0, 120); }', returnByValue: true });
  return result.value;
};

const rows = [];
const unnamed = [];
const look = async (where) => {
  const list = await nodes();
  rows.push({ where, count: list.length });
  for (const n of list.filter((x) => !x.name.trim())) {
    const html = await describe(n.backend);
    if (!unnamed.some((u) => u.html === html)) {
      unnamed.push({ where, role: n.role, html });
      console.log(`NONE ${where} ${n.role}: ${html}`);
    }
  }
};

try {
  await sleep(2500);
  await look('the shop');
  for (const [name, sel, open, tab] of mainCards(lang)) {
    if (tab) await shop.openSettings(tab);
    else await page.evaluate(`void (${open})`);
    await sleep(400);
    await look(name);
    // Opening a card is announced by what the card says it is.
    const card = await page.evaluate((sel) => {
      const c = document.querySelector(sel);
      const by = c.getAttribute('aria-labelledby');
      return { role: c.getAttribute('role'), name: c.getAttribute('aria-label') ?? (by ? document.getElementById(by)?.textContent : null) };
    }, sel);
    if (!['dialog', 'alertdialog'].includes(card.role) || !card.name?.trim()) {
      unnamed.push({ where: name, role: card.role, html: 'the card itself' });
      console.log(`NONE ${name}: the card says it is ${card.role} called ${card.name}`);
    }
    await page.keyboard.press('Escape');
    await sleep(250);
    const stuck = page.locator('.pending-card button.default');
    if (await stuck.count()) await stuck.click();
    await sleep(150);
  }
} finally {
  await shop.close();
}
writeFileSync(join(out, `names-${lang}.json`), JSON.stringify({ rows, unnamed }, null, 1));
console.log(`NAMES ${lang}: ${rows.reduce((sum, r) => sum + r.count, 0)} controls looked at over ${rows.length} views, ${unnamed.length} without a name`);
process.exit(unnamed.length ? 1 : 0);
