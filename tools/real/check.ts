/**
 * Real-Claude check: runs three small commissions through the app's own runner, prompts and event
 * normalizer against the Claude Code installed on this computer, then writes a report to compare with
 * the stand-in Claude (tools/sim).
 *
 *   $env:ANTHROPIC_API_KEY = "sk-ant-..."     # PowerShell; the key is only read from the environment
 *   npx tsx tools/real/check.ts               # add --lang en for English, --sim to try it with the stand-in
 *
 * Spending: each commission stops at $0.40 (the SDK's own cap), and no new one starts once the total
 * reaches $1.20, so the whole check stays under about $1.60. Questions get the first option, ordinary
 * permissions are allowed, and serious steps (deleting files) are declined, as the default would be.
 *
 * Output: lamplight-real-check-<time>/ in the current folder, with the work, and report.zip to send back:
 * the summary, the event shapes and the recordings, with the home folder and any key replaced.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const SIM = args.includes('--sim');
const LANG = (args[args.indexOf('--lang') + 1] === 'en' && args.includes('--lang') ? 'en' : 'zh-CN') as 'en' | 'zh-CN';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PER_RUN_USD = 0.4;
const STOP_AT_USD = 1.2;

const { setLocale } = await import('../../app/shared/i18n');
setLocale(LANG);
const { strings } = await import('../../app/shared/i18n');
const { runAgent } = await import('../../app/main/agent-runner');
const { commissionPrompt, demoPrompt, prepareDemoFolder, commissionTitle } = await import('../../app/main/commission');
const { copyMaterials } = await import('../../app/main/materials');
const { DecisionBroker } = await import('../../app/main/decision-broker');
const { normalizeAll } = await import('../../app/main/event-normalizer');
const { redactSecrets } = await import('../../app/main/api-key');
const { findClaude } = await import('../../app/main/claude-locator');
const { claudeVersion } = await import('../../app/main/claude-version');
const { zip } = await import('../../app/main/zip');
type Form = import('../../app/shared/types').CommissionForm;
type Raw = import('../../app/shared/types').RawAgentEvent;

const key = SIM ? 'sk-ant-api03-simulated-0000000000000000000000000000000000000000' : process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('Set ANTHROPIC_API_KEY first (PowerShell: $env:ANTHROPIC_API_KEY = "sk-ant-..."). Nothing was run.');
  process.exit(1);
}
if (SIM) {
  process.env.LAMPLIGHT_CLAUDE_PATH = join(ROOT, 'tools', 'sim', 'claude.mjs');
  process.env.SIM_SPEED = '0';
}

// The Claude Code a shipped app would use: the one installed on this computer, not the SDK's own copy.
const claudePath = findClaude({ platform: process.platform, env: process.env, home: homedir(), exists: existsSync, sdkBinary: false });
if (claudePath === null) {
  console.error('Claude Code is not installed on this computer. Install it first (https://code.claude.com/docs/en/setup). Nothing was run.');
  process.exit(1);
}
process.env.LAMPLIGHT_CLAUDE_PATH = claudePath;
const version = await claudeVersion(claudePath);

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const OUT = resolve(`lamplight-real-check-${stamp}${SIM ? '-sim' : ''}`);
mkdirSync(OUT, { recursive: true });

const zh = LANG === 'zh-CN';
const samples = join(OUT, 'samples');
mkdirSync(samples, { recursive: true });
const note = join(samples, 'notes.txt');
writeFileSync(note, zh ? '房子在 3 楼，合同写着提前一个月通知。押金 3000 元。\n' : 'Flat on the 3rd floor; the lease asks for a month\'s notice. Deposit: 3000.\n');

const COMMISSIONS: { name: string; form: Form; prepare?: (dir: string) => void; prompt: (form: Form) => string }[] = [
  {
    name: 'page',
    form: { template: 'page', want: zh ? '帮我做一个记录每天喝了几杯水的小网页。' : 'Make me a small web page to count the glasses of water I drink.' },
    prompt: (f) => commissionPrompt(f),
  },
  {
    name: 'letter-with-materials',
    form: { template: 'letter', want: zh ? '帮我写一封给房东的信，说下个月底退租。' : 'Write a letter to my landlord about moving out at the end of next month.', materials: [note] },
    prepare: (dir) => { copyMaterials(dir, [note]); },
    prompt: (f) => commissionPrompt(f),
  },
  {
    name: 'demo',
    form: { demo: true, want: strings.ui.demoFill },
    prepare: (dir) => prepareDemoFolder(dir, join(ROOT, 'demo', 'check.js')),
    prompt: (f) => demoPrompt(f),
  },
];

type Outcome = {
  name: string; ok: boolean; error?: string; costUsd?: number; seconds: number;
  claudeCodeVersion?: string; kinds: Record<string, number>; checks: Record<string, boolean>; decisions: string[];
};
const outcomes: Outcome[] = [];
const shapes: Record<string, string[]> = {};
let total = 0;

for (const c of COMMISSIONS) {
  if (total >= STOP_AT_USD) {
    console.log(`Stopping before ${c.name}: $${total.toFixed(2)} spent so far.`);
    break;
  }
  const dir = join(OUT, 'work', c.name);
  mkdirSync(dir, { recursive: true });
  c.prepare?.(dir);
  const recording = join(OUT, 'recordings', `${c.name}.jsonl`);
  mkdirSync(join(OUT, 'recordings'), { recursive: true });
  const decisions: string[] = [];
  // Answers as a careful user would by default: the first option, yes to ordinary steps, no to serious ones.
  const broker: InstanceType<typeof DecisionBroker> = new DecisionBroker((req) => {
    const choice = req.kind === 'question' ? '0' : req.kind === 'serious' ? 'deny' : 'allow';
    decisions.push(`${req.kind}: ${req.title} -> ${choice}`);
    setTimeout(() => broker.answer({ id: req.id, choice }), 50);
  });
  console.log(`Running ${c.name} (${commissionTitle(c.form)})...`);
  const t0 = Date.now();
  let initVersion: string | undefined;
  const result = await runAgent({
    prompt: c.prompt(c.form), workDir: dir, recordingPath: recording, broker,
    emit: () => {}, onInit: (info) => { initVersion = info.claudeCodeVersion; },
    credentials: { source: 'env', apiKey: key }, maxBudgetUsd: PER_RUN_USD,
  });
  total += result.costUsd ?? 0;

  const raw = readFileSync(recording, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Raw);
  for (const e of raw) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const kind = e.source === 'message' ? `message:${String(p.type)}${p.subtype ? `/${String(p.subtype)}` : ''}` : `${e.source}:${e.name}`;
    shapes[kind] = [...new Set([...(shapes[kind] ?? []), ...Object.keys(p)])].sort();
  }
  const events = normalizeAll(raw);
  const kinds: Record<string, number> = {};
  for (const e of events) kinds[`${e.kind}${e.agent !== 'main' ? `@${e.agent}` : ''}`] = (kinds[`${e.kind}${e.agent !== 'main' ? `@${e.agent}` : ''}`] ?? 0) + 1;
  const has = (k: string) => events.some((e) => e.kind === k);
  const hooks = raw.filter((e) => e.source === 'hook') as { name: string; payload: Record<string, unknown> }[];
  const checks: Record<string, boolean> = {
    finished: result.ok,
    'claude reported its version': Boolean(initVersion),
    'a subagent went out and came back': has('subagent_start') && has('subagent_stop'),
  };
  // The demo states its plan in words; the other two are free to keep a to-do list, and the page usually does.
  if (c.name !== 'demo') {
    checks['to-do list became the plan'] = events.some((e) => e.kind === 'plan' && (e.todos?.length ?? 0) > 0);
    checks['to-do list was ticked off'] = has('progress');
  }
  if (c.name === 'letter-with-materials') {
    checks['handed-over file was read'] = hooks.some((h) => h.name === 'PreToolUse' && h.payload.tool_name === 'Read'
      && String((h.payload.tool_input as Record<string, unknown>)?.file_path ?? '').includes(strings.ui.files.materials));
  }
  if (c.name === 'demo') {
    checks['asked the colour'] = has('ask_user');
    checks['deleting drafts was serious'] = events.some((e) => e.kind === 'permission' && e.risk === 'serious');
    checks['the check failed, then passed'] = events.some((e) => e.kind === 'tool_fail') && events.some((e) => e.kind === 'tool_ok' && e.tool === 'Bash');
    checks['drafts were kept (declined)'] = existsSync(join(dir, 'draft-1.html'));
  }
  outcomes.push({
    name: c.name, ok: result.ok, error: result.ok ? undefined : `${result.error ?? ''} ${result.detail ?? ''}`.trim(),
    costUsd: result.costUsd, seconds: Math.round((Date.now() - t0) / 1000), claudeCodeVersion: initVersion, kinds, checks, decisions,
  });
  console.log(`  ${result.ok ? 'done' : 'stopped'}, about $${(result.costUsd ?? 0).toFixed(2)}`);
}

const report = {
  when: new Date().toISOString(), sim: SIM, lang: LANG, platform: process.platform,
  claudeCode: { path: claudePath === undefined ? '(SDK copy)' : '(installed)', ...version },
  totalUsd: Math.round(total * 100) / 100, outcomes,
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'shapes.json'), JSON.stringify(shapes, null, 2));

// What goes back: no key, and the home folder (which usually carries a name) replaced.
const clean = (text: string) => redactSecrets(text.split(homedir()).join('~').split(key).join('(key)'));
const entries = [
  { name: 'report.json', data: clean(JSON.stringify(report, null, 2)) },
  { name: 'shapes.json', data: clean(JSON.stringify(shapes, null, 2)) },
  ...COMMISSIONS.filter((c) => existsSync(join(OUT, 'recordings', `${c.name}.jsonl`)))
    .map((c) => ({ name: `recordings/${c.name}.jsonl`, data: clean(readFileSync(join(OUT, 'recordings', `${c.name}.jsonl`), 'utf8')) })),
];
writeFileSync(join(OUT, 'report.zip'), zip(entries));

console.log(`\nAbout $${report.totalUsd.toFixed(2)} spent. Claude Code ${version.version ?? '(unknown)'}.`);
for (const o of outcomes) {
  const failed = Object.entries(o.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(`${o.ok ? 'OK  ' : 'STOP'} ${o.name}${failed.length ? `  (not seen: ${failed.join('; ')})` : ''}`);
}
console.log(`\nSend this file back: ${join(OUT, 'report.zip')}`);
