#!/usr/bin/env node
// The 30-second store trailer: one demo commission in a grown shop, recorded from the virtual display,
// with the slow middle sped up and the shop's own background music under it.
//
//   node tools/sim/store.mjs ...   (first: it leaves a grown shop, see store-out/<lang>-home.txt)
//   node tools/sim/trailer.mjs [--lang zh-CN,en] [--out store-out]
//
// Linux with Xvfb and ffmpeg only (it records the X display). Output: <out>/trailer-<lang>.mp4, 1920x1080, 30 fps.

import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { display, freshHome, launch, sleep, ROOT } from './shop.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const LANGS = opt('lang', 'zh-CN,en').split(',');
const OUT = join(ROOT, opt('out', 'store-out'));
const MUSIC = join(ROOT, 'assets', 'audio', 'music', '05-sunny-cafe-quiet.ogg');

/** Pieces of the recording, as [from, to, speed] in seconds; the result is about 30 seconds long. */
function cut(m) {
  return [
    [m.start, m.submit + 0.8, 1], // the shop, the slip, handing it in
    [m.submit + 0.8, m.question - 0.3, (m.question - m.submit) / 9], // the work, fast: errands, blackboard, the failed check
    [m.question - 0.3, m.question + 2.6, 1], // Wick asks about the colour
    [m.question + 2.6, m.result - 0.3, Math.max(1, (m.result - m.question - 2.9) / 6)], // the serious card, the review
    [m.result - 0.3, m.result + 3.2, 1], // the finished work and what it cost
    [m.shelf, m.shelf + 2.6, 1], // the works shelf
    [m.garden, m.garden + 3.6, 1], // the back garden
  ];
}

async function record(lang) {
  const homeFile = join(OUT, `${lang}-home.txt`);
  if (!existsSync(homeFile)) throw new Error(`run store.mjs for ${lang} first`);
  const grown = readFileSync(homeFile, 'utf8').trim();
  const home = freshHome();
  rmSync(home.home, { recursive: true, force: true });
  cpSync(grown, home.home, { recursive: true });

  const shop = await launch({ lang, home, size: 'large', speed: 1000 });
  const bounds = await shop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
  await sleep(6000);
  for (let i = 0; i < 3; i++) await shop.page.keyboard.press('Escape');
  await sleep(1000);

  const raw = join(OUT, `trailer-${lang}-raw.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30',
    '-video_size', `${bounds.width}x${bounds.height}`, '-i', `${await display()}+${bounds.x},${bounds.y}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const m = { start: 0 };
  try {
    await sleep(1500);
    await shop.order({ template: 'demo' });
    await shop.page.locator('form.commission textarea').evaluate((t) => t.blur());
    await sleep(2200);
    m.submit = now();
    await shop.submit();
    const r = await shop.workUntilDone({
      answers: (card) => (card.serious ? null : 1),
      onTick: async () => {
        if (m.question === undefined && await shop.page.locator('.backdrop').isVisible().catch(() => false)) {
          m.question = now();
          await sleep(2400);
        } else if (m.question !== undefined && await shop.page.locator('.backdrop .serious').isVisible().catch(() => false)) {
          await sleep(1800);
        }
      },
    });
    if (!r.ok) throw new Error('the demo did not finish');
    m.result = now();
    await sleep(3800);
    await shop.page.keyboard.press('Escape');
    await sleep(1200);
    m.shelf = now();
    await shop.hotspot(shop.L.ui.access.hotspotWorks);
    await sleep(3000);
    await shop.page.keyboard.press('Escape');
    await shop.hotspot(shop.L.ui.access.hotspotGarden);
    await sleep(5500);
    m.garden = now();
    await sleep(4200);
  } finally {
    ff.stdin.write('q');
    await new Promise((r) => ff.on('close', r));
    await shop.close();
  }
  return { raw, marks: m };
}

function edit(lang, raw, marks) {
  const parts = cut(marks);
  const filters = parts.map(([a, b, speed], i) => `[0:v]trim=${a.toFixed(2)}:${b.toFixed(2)},setpts=(PTS-STARTPTS)/${speed.toFixed(3)}[v${i}]`);
  const total = parts.reduce((s, [a, b, speed]) => s + (b - a) / speed, 0);
  const concat = `${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0,fps=30,fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8[v]`;
  const audio = `[1:a]atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=1,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5,volume=0.8[a]`;
  const out = join(OUT, `trailer-${lang}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-i', MUSIC, '-filter_complex', [...filters, concat, audio].join(';'),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', out]);
  return { out, total };
}

mkdirSync(OUT, { recursive: true });
for (const lang of LANGS) {
  const { raw, marks } = await record(lang);
  const { out, total } = edit(lang, raw, marks);
  console.log(`${lang}: ${out} (${total.toFixed(1)}s) marks ${JSON.stringify(marks)}`);
}
