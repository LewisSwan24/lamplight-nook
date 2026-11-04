#!/usr/bin/env node
// Simulated acceptance run: drives the built app through every kind of commission and the features around them,
// in Chinese and English, against the stand-in Claude. Nothing is spent and no real credentials can be reached.
//
//   npm run build && node tools/sim/accept.mjs [--lang zh-CN,en] [--only demo,board,...] [--out sim-out]
//
// Each scenario prints PASS or FAIL with the reason, and leaves screenshots in <out>/<lang>/.

import { pathToFileURL } from 'node:url';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FAKE_CLAUDE, freshHome, launch, onboarded, sleep, ROOT } from './shop.mjs';

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
    writeFileSync(p, readFileSync(p, 'utf8').split(old).join(home.home));
  }
  return home;
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

const SCENARIOS = {
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

  /** All eight templates, one after another in the same shop; each leaves its file and a shelf item. */
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
        await shop.shot(join(out, `template-${template}.png`));
        await shop.page.keyboard.press('Escape');
        await sleep(1500);
      }
      await shop.hotspot(shop.L.ui.access.hotspotWorks);
      await sleep(300);
      await shop.shot(join(out, 'shelf.png'));
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
        await shop.page.locator('.shelf-card li.work').last().locator('button.link').last().click();
        await shop.page.waitForSelector('form.revise textarea');
        await shop.page.fill('form.revise textarea', W[lang].ask);
        await shop.page.locator('form.revise button.default').click();
        check((await shop.workUntilDone()).ok, `${version}: changing old work did not finish`);
        const again = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8')).commissions.find((c) => c.id === oldest.id);
        check(again?.asks?.length === 1, `${version}: the round on old work was not noted`);
        check(readdirSync(oldest.folder).length > 0, `${version}: old folder is empty`);
      } finally { await shop.close(); }
    }
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
      await shop.openSettings('work');
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
      results.push([lang, name, 'FAIL', String(err?.message ?? err).slice(0, 300)]);
    }
    const [, , status, why] = results.at(-1);
    console.log(`${status} ${lang} ${name} (${Math.round((Date.now() - t0) / 1000)}s) ${why}`);
  }
}
const failed = results.filter((r) => r[2] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
