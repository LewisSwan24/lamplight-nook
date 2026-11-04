// How readable the words on every card really are. The paper is a picture and some words are see-through, so the
// stylesheet cannot say: each kind of text is blanked, the window photographed, and what is actually behind it read off.
//
//   node tools/sim/contrast.mjs --lang zh-CN --out sim-out/contrast
//
// WCAG AA: 4.5:1, or 3:1 for large text. Exits non-zero on anything under.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, freshHome, launch, onboarded, sleep } from './shop.mjs';

const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const lang = option('lang', 'zh-CN');
const out = resolve(option('out', join(ROOT, 'sim-out', 'contrast')));
mkdirSync(out, { recursive: true });

const long = lang === 'en' ? 'Make me a small page for the family reunion' : '帮我做一个家庭聚会签到的小网页';
const env = { hasApiKey: false, hasClaude: false, debug: false, keySource: 'none', installCommand: 'irm https://claude.ai/install.ps1 | iex', platform: 'win32' };
const ui = 'window.lamplightDebug.ui';
const text = JSON.stringify;
const CARDS = [
  ['slip', 'form.commission', `${ui}.showCommissionForm()`],
  ['actor', '.actor-card', `${ui}.showActorCard('adeng', { state: 'working', lastLine: ${text(long)}, doing: ${text(long)}, stats: { writes: 3, runs: 2, fails: 1 }, raw: ['event'] }, true)`],
  ['plan', '.plan-card', `${ui}.showPlan([0, 1, 2, 3].map((i) => ({ label: ${text(long)}, status: i < 2 ? 'done' : i === 2 ? 'doing' : 'todo' })))`],
  ['result', '.result-card', `${ui}.showResult({ ok: true, workDir: 'C:/w', files: ['C:/w/page.html'], main: 'C:/w/page.html', costUsd: 0.42, summary: ${text(long)}, id: 'c1', round: 2, canRestore: true })`],
  ['failure', '#ui > .card', `${ui}.showFailure('net')`],
  ['failure-money', '.card.serious', `${ui}.showFailure('budget')`],
  ['notice', '.notice-card', `${ui}.showNotReady(${text(env)})`],
  ['trial-end', '.trial-end', `${ui}.showTrialEnd()`],
  ['meeting', 'form.meeting', `${ui}.showMeeting()`],
  ['shelf', '.shelf-card', `${ui}.showShelf()`],
  ['notebook', '.notebook', `${ui}.showNotebook()`],
  ['captions', '.caption-card', `${ui}.showCaptionLog()`],
  ['legal', '.card.legal', `${ui}.showLegal('terms')`],
  ['pending', '.pending-card', `${ui}.showPending({ want: ${text(long)} })`],
  ['decision', '.dialog', `${ui}.showDecision({ id: 'q', kind: 'question', agent: 'main', tool: 'AskUserQuestion', title: ${text(long)}, defaultId: '0', options: [0, 1].map((i) => ({ id: String(i), label: ${text(long)}, hint: ${text(long)} })) })`],
  ['serious', '.serious', `${ui}.showDecision({ id: 's', kind: 'serious', agent: 'main', tool: 'Bash', title: ${text(long)}, reason: ${text(long)}, detail: ${text(long)}, defaultId: 'deny', options: [{ id: 'deny', label: 'no' }, { id: 'allow', label: 'yes' }] })`],
  ['settings-basics', '.card.settings', null, 'basics'],
  ['settings-furnish', '.card.settings', null, 'furnish'],
  ['settings-sight', '.card.settings', null, 'sight'],
  ['settings-work', '.card.settings', null, 'work'],
  ['settings-about', '.card.settings', null, 'about'],
];

const LIN = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * LIN(r) + 0.7152 * LIN(g) + 0.0722 * LIN(b);
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const memory = {
  commissions: Array.from({ length: 8 }, (_, i) => ({ id: `c${1760000000000 + i * 86400000}`, title: long, date: '2026-10-20', result: 'done', choices: { Q: 'A' }, costUsd: 0.2, folder: 'C:/nowhere', form: { want: long, template: 'letter' } })),
  stuckNotes: [{ commission: long, note: long, date: '2026-10-20' }], greeted: 'c1', shop: { done: 8, told: [], grown: [{ id: 'painting', date: '2026-10-20' }], met: [] },
};
const shop = await launch({ lang, home: freshHome({ 'settings.json': onboarded(lang), 'memory.json': JSON.stringify(memory) }), debug: true });
const { page } = shop;
const rows = [];
try {
  await sleep(2500);
  // --css file: try out colours without building.
  if (option('css')) await page.addStyleTag({ content: readFileSync(option('css'), 'utf8') });
  for (const [name, sel, open, tab] of CARDS) {
    if (tab) await shop.openSettings(tab);
    else await page.evaluate(`void (${open})`);
    await sleep(500);
    const found = await page.evaluate((sel) => {
      const card = document.querySelector(sel);
      if (!card) return null;
      const seen = new Set();
      const list = [];
      for (const n of card.querySelectorAll('*')) {
        const own = [...n.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim()).map((c) => c.textContent.trim()).join(' ');
        if (!own || n.matches(':disabled, option, script, style')) continue;
        const r = n.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || !n.checkVisibility()) continue;
        const s = getComputedStyle(n);
        let alpha = 1;
        for (let p = n; p && p !== document.documentElement; p = p.parentElement) alpha *= Number(getComputedStyle(p).opacity);
        const key = `${s.color}|${s.fontSize}|${s.fontWeight}|${alpha}|${n.parentElement?.className}`;
        if (seen.has(key)) continue;
        seen.add(key);
        n.setAttribute('data-contrast', String(list.length));
        list.push({ text: own.slice(0, 24), color: s.color, alpha, size: parseFloat(s.fontSize), bold: Number(s.fontWeight) >= 700, tag: `${n.tagName.toLowerCase()}.${n.className}`.slice(0, 40) });
      }
      return list;
    }, sel);
    if (!found) {
      rows.push({ card: name, missing: true });
      console.log(`?    ${name}: did not open`);
    } else {
      for (let i = 0; i < found.length; i++) {
        const box = await page.evaluate((i) => {
          const n = document.querySelector(`[data-contrast="${i}"]`);
          if (!n) return null; // The card drew itself again: a live log, say.
          n.style.setProperty('color', 'transparent', 'important');
          n.style.setProperty('text-shadow', 'none', 'important');
          n.scrollIntoView({ block: 'center' });
          const r = n.getBoundingClientRect();
          return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(2, Math.min(r.width, innerWidth - r.x)), height: Math.max(2, Math.min(r.height, innerHeight - r.y)) };
        }, i);
        if (!box) continue;
        const shot = (await page.screenshot({ clip: box })).toString('base64');
        const back = await page.evaluate(async ([png, i]) => {
          const n = document.querySelector(`[data-contrast="${i}"]`);
          n?.style.removeProperty('color');
          n?.style.removeProperty('text-shadow');
          const img = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
          const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
          c.drawImage(img, 0, 0);
          const d = c.getImageData(0, 0, img.width, img.height).data;
          const each = [[], [], []];
          for (let p = 0; p < d.length; p += 4) for (let k = 0; k < 3; k++) each[k].push(d[p + k]);
          return each.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
        }, [shot, i]);
        const f = found[i];
        const [r, g, b, a = 1] = f.color.match(/[\d.]+/g).map(Number);
        const cover = a * f.alpha;
        const ink = [r, g, b].map((v, k) => v * cover + back[k] * (1 - cover));
        const value = ratio(ink, back);
        const large = f.size >= 24 || (f.bold && f.size >= 18.66);
        const floor = large ? 3 : 4.5;
        rows.push({ card: name, ratio: Number(value.toFixed(2)), floor, ...f, back });
        if (value < floor) console.log(`LOW  ${value.toFixed(2)} ${name} ${f.tag} "${f.text}" ${f.color}${f.alpha < 1 ? ` x${f.alpha}` : ''} on rgb(${back})`);
      }
      await page.evaluate(() => { for (const n of document.querySelectorAll('[data-contrast]')) n.removeAttribute('data-contrast'); });
    }
    await page.keyboard.press('Escape');
    await sleep(300);
    const stuck = page.locator('.pending-card button.default');
    if (await stuck.count()) await stuck.click();
    await sleep(200);
  }
} finally {
  await shop.close();
}
const measured = rows.filter((r) => r.ratio);
const low = measured.filter((r) => r.ratio < r.floor);
writeFileSync(join(out, `contrast-${lang}.json`), JSON.stringify(rows, null, 1));
console.log(`CONTRAST ${lang}: ${measured.length} kinds of text, ${low.length} under the floor, lowest ${Math.min(...measured.map((r) => r.ratio))}`);
process.exit(low.length || rows.some((r) => r.missing) ? 1 : 0);
