#!/usr/bin/env node
// Compare a real-Claude check with the same check against the stand-in, and say what needs a look.
//
//   node tools/real/compare.mjs <real folder> <sim folder> [--update-baseline]
//
// Both folders are what tools/real/check.ts writes (report.json, shapes.json); the real one may be missing
// (no key), and then only the stand-in is checked. Prints Markdown (for a GitHub job summary) and exits 1 when:
// - something the shop relies on did not hold in a real run (REQUIRED below), or
// - the stand-in itself failed a check (our own bug), or
// - the real run showed an event kind or a tool name that neither the stand-in nor tools/real/baseline.json
//   knows: Claude Code changed, and the stand-in (tools/sim) or the app should learn it.
// --update-baseline adds what the real run showed to the baseline, once it has been looked at.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const [realDir, simDir] = args.filter((a) => !a.startsWith('--'));
const UPDATE = args.includes('--update-baseline');
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'baseline.json');

/** Must hold in every real run: the shop is built on these. */
const REQUIRED = new Set([
  'finished', 'claude reported its version', 'one result, at the end', 'every command line could be read',
  'handed-over file was read', 'asked the colour', 'deleting drafts was serious', 'drafts were kept (declined)',
  'the check failed, then passed',
]);
// Everything else (a to-do list, sending a helper out) is Claude's own choice: reported, never a failure.

const load = (dir, name) => {
  const f = dir && join(dir, name);
  return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const real = load(realDir, 'report.json');
const realShapes = load(realDir, 'shapes.json') ?? {};
const sim = load(simDir, 'report.json');
const simShapes = load(simDir, 'shapes.json') ?? {};
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { kinds: [], tools: [] };

const out = [];
const say = (line = '') => out.push(line);
let failed = false;

say('# Real-Claude check');
say();
if (!sim) {
  say('No stand-in report: run `tools/real/check.ts --sim` first.');
  failed = true;
} else {
  const bad = sim.outcomes.flatMap((o) => Object.entries(o.checks).filter(([, v]) => !v).map(([k]) => `${o.name}: ${k}`));
  say(`**Stand-in:** ${bad.length ? `✗ ${bad.join('; ')}` : `✓ all checks (${sim.outcomes.length} commissions)`}`);
  if (bad.length) failed = true;
}

if (!real) {
  say();
  say('**Real run:** skipped (no `LAMPLIGHT_TEST_KEY`). Add it as a repository secret to run against Claude Code.');
} else {
  const cc = real.claudeCode ?? {};
  say(`**Real run:** Claude Code ${cc.version ?? '(unknown)'}${cc.tested ? ` (the app was tried with ${cc.tested})` : ''}, about $${real.totalUsd.toFixed(2)}.`);
  say();
  say('| Commission | Cost | Must hold | Claude\'s choice |');
  say('|---|---|---|---|');
  for (const o of real.outcomes) {
    const must = Object.entries(o.checks).filter(([k]) => REQUIRED.has(k));
    const free = Object.entries(o.checks).filter(([k]) => !REQUIRED.has(k));
    const broken = must.filter(([, v]) => !v).map(([k]) => k);
    if (broken.length) failed = true;
    const mark = ([k, v]) => `${v ? '✓' : '✗'} ${k}`;
    say(`| ${o.name} | $${(o.costUsd ?? 0).toFixed(2)} | ${broken.length ? broken.map((k) => `✗ ${k}`).join('<br>') : `✓ ${must.length}`} | ${free.map(mark).join('<br>')} |`);
  }
  if (sim) {
    const missing = sim.outcomes.map((o) => o.name).filter((n) => !real.outcomes.some((o) => o.name === n));
    if (missing.length) say(`\nNot run this time (budget): ${missing.join(', ')}.`);
  }

  // What Claude Code showed that the stand-in does not play and the baseline does not list.
  const simKinds = new Set(Object.keys(simShapes));
  const simTools = new Set((sim?.outcomes ?? []).flatMap((o) => [...(o.initTools ?? []), ...(o.toolsUsed ?? [])]));
  const realTools = [...new Set(real.outcomes.flatMap((o) => [...(o.initTools ?? []), ...(o.toolsUsed ?? [])]))].sort();
  const newKinds = Object.keys(realShapes).filter((k) => !simKinds.has(k) && !baseline.kinds.includes(k)).sort();
  const newTools = realTools.filter((t) => !simTools.has(t) && !baseline.tools.includes(t));
  const goneTools = [...simTools].filter((t) => !realTools.includes(t) && !baseline.tools.includes(t) && real.outcomes.some((o) => (o.initTools ?? []).length)).sort();
  say();
  if (newKinds.length || newTools.length) {
    failed = true;
    say('**New in Claude Code** (teach the stand-in in `tools/sim`, check the app reads it, then `--update-baseline`):');
    if (newKinds.length) say(`- event kinds: ${newKinds.map((k) => `\`${k}\``).join(', ')}`);
    if (newTools.length) say(`- tools: ${newTools.map((t) => `\`${t}\``).join(', ')}`);
  } else {
    say('**New in Claude Code:** nothing beyond the stand-in and the baseline.');
  }
  if (goneTools.length) say(`\nThe stand-in offers tools this Claude Code did not: ${goneTools.map((t) => `\`${t}\``).join(', ')}.`);

  // Field-level differences are many and mostly unused by the app: listed for reading, never a failure.
  const extra = Object.keys(realShapes).filter((k) => simKinds.has(k))
    .map((k) => [k, realShapes[k].filter((f) => !(simShapes[k] ?? []).includes(f))]).filter(([, f]) => f.length);
  if (extra.length) {
    say();
    say('<details><summary>Fields only the real run has (for reference)</summary>');
    say();
    for (const [k, f] of extra) say(`- \`${k}\`: ${f.join(', ')}`);
    say();
    say('</details>');
  }

  if (UPDATE) {
    const next = {
      kinds: [...new Set([...baseline.kinds, ...newKinds])].sort(),
      tools: [...new Set([...baseline.tools, ...newTools])].sort(),
    };
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    say(`\nBaseline updated: ${BASELINE}`);
  }
}

console.log(out.join('\n'));
process.exit(failed && !UPDATE ? 1 : 0);
