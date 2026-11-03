#!/usr/bin/env node
// The demo commission through the real app window, against the real Claude Code, in the cloud container
// (Xvfb) or on any machine with a display. Pair it with tools/real/check.ts.
//
//   LAMPLIGHT_TEST_KEY=sk-ant-... node tools/real/ui.mjs [--lang zh-CN|en] [--sim]
//
// The key is read from LAMPLIGHT_TEST_KEY, never from ANTHROPIC_API_KEY, so a key meant for this test is not
// picked up by anything else running in the same shell. The app starts with a clean environment and a
// throwaway home, with the spending cap set to $1 (the lowest the app offers). Questions get the second
// option and the serious delete is declined, as in the simulated demo. --sim runs it against the stand-in.
//
// Output: real-out/<lang>/ with screenshots every few seconds, the result, and summary.json.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshHome, launch, onboarded, sleep, ROOT, FAKE_CLAUDE } from '../sim/shop.mjs';

const args = process.argv.slice(2);
const SIM = args.includes('--sim');
const LANG = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'zh-CN';
const key = SIM ? true : process.env.LAMPLIGHT_TEST_KEY;
if (!key) {
  console.error('Set LAMPLIGHT_TEST_KEY to an Anthropic API key with a spending limit. Nothing was run.');
  process.exit(1);
}
const OUT = join(ROOT, SIM ? 'real-out-sim' : 'real-out', LANG);
mkdirSync(OUT, { recursive: true });

const home = freshHome({ 'settings.json': onboarded(LANG, { budgetUsd: 1 }) });
const shop = await launch({ lang: LANG, home, key, claudePath: SIM ? FAKE_CLAUDE : 'sdk', speed: SIM ? 300 : 0, size: 'large' });
const t0 = Date.now();
const seen = [];
let shots = 0;
let result;
try {
  await sleep(3000);
  await shop.page.keyboard.press('Escape');
  await shop.order({ template: 'demo' });
  await shop.shot(join(OUT, '00-slip.png'));
  await shop.submit();
  let r = await shop.workUntilDone({
    timeout: 20 * 60_000,
    answers: (card) => { seen.push({ at: Math.round((Date.now() - t0) / 1000), ...card }); return card.serious ? null : 1; },
    onTick: async (ms) => {
      if (ms > shots * 8000) await shop.shot(join(OUT, `${String(++shots).padStart(2, '0')}-work.png`));
    },
  });
  if (!r.ok && r.stopped) {
    await shop.shot(join(OUT, 'stopped.png'));
  } else if (r.ok) {
    await sleep(2000);
    await shop.shot(join(OUT, 'result.png'));
  }
  result = r;
} finally {
  await shop.close();
}

const folders = [];
const walk = (dir, depth) => {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    if (!n.isDirectory() || n.name.startsWith('.')) continue;
    if (/^\d{4}-\d{2}-\d{2}-\d{6}-/.test(n.name)) folders.push(join(dir, n.name));
    else if (depth < 3) walk(join(dir, n.name), depth + 1);
  }
};
walk(home.home, 0);
const folder = folders.sort().at(-1);
const memory = JSON.parse(readFileSync(join(home.data, 'memory.json'), 'utf8'));
const summary = {
  sim: SIM, lang: LANG, seconds: Math.round((Date.now() - t0) / 1000), ok: Boolean(result?.ok), stopped: result?.stopped ?? null,
  cards: seen.map((c) => ({ at: c.at, serious: c.serious, title: c.text.split('\n').slice(0, 2).join(' / ') })),
  files: folder ? readdirSync(folder) : [],
  costUsd: memory.commissions.at(-1)?.costUsd ?? null,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
