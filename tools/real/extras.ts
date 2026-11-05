/**
 * What tools/real/check.ts does not ask of real Claude Code: what a further round reports, what calling a run off
 * reports, and whether Claude Code stops by itself when the app is killed.
 *
 *   $env:LAMPLIGHT_TEST_KEY = "sk-ant-..."    # PowerShell
 *   npx tsx tools/real/extras.ts --out sim-out/real-extras
 *                                             # add --sim to try it with the stand-in, --only round,calloff,kill for some
 *
 * The key is read from LAMPLIGHT_TEST_KEY only. Spending: a round $0.20 and a further round $0.20, calling off $0.40,
 * killing $0.40, so at most about $1.20 in all. Claude Code checks its cap between steps, so a step can pass it a little.
 *
 * It writes report.json to the folder, with the figures only. Windows only, like W11.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const SIM = args.includes('--sim');
const CHILD = opt('--child');
const ONLY = opt('--only') ? new Set(opt('--only')!.split(',')) : null;
const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT), '..', '..');
const OUT = resolve(opt('--out') ?? join(ROOT, 'sim-out', 'real-extras'));

const key = SIM ? 'sk-ant-api03-simulated-0000000000000000000000000000000000000000' : process.env.LAMPLIGHT_TEST_KEY;
if (!key) {
  console.error('Set LAMPLIGHT_TEST_KEY first (PowerShell: $env:LAMPLIGHT_TEST_KEY = "sk-ant-..."). Nothing was run.');
  process.exit(1);
}
if (SIM) {
  process.env.LAMPLIGHT_CLAUDE_PATH = join(ROOT, 'tools', 'sim', 'claude.mjs');
  process.env.SIM_SPEED = '400';
}

const { setLocale } = await import('../../app/shared/i18n');
setLocale('en');
const { runAgent } = await import('../../app/main/agent-runner');
const { DecisionBroker } = await import('../../app/main/decision-broker');
const { findClaude } = await import('../../app/main/claude-locator');
const { claudeVersion } = await import('../../app/main/claude-version');
const { SpendLedger } = await import('../../app/main/spend');
type Raw = import('../../app/shared/types').RawAgentEvent;

const claudePath = findClaude({ platform: process.platform, env: process.env, home: homedir(), exists: existsSync, sdkBinary: false });
if (claudePath === null) {
  console.error('Claude Code is not installed on this computer. Nothing was run.');
  process.exit(1);
}
process.env.LAMPLIGHT_CLAUDE_PATH = claudePath;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LONG = 'Write a story of about 500 words to story-1.txt. Then write its sequel of about 500 words to story-2.txt, '
  + 'then a third part of about 500 words to story-3.txt, then a fourth to story-4.txt. Do them one at a time.';

/** Yes to ordinary steps, the first option to questions, no to serious ones: what check.ts answers. */
function broker() {
  const b: InstanceType<typeof DecisionBroker> = new DecisionBroker((req) => {
    const choice = req.kind === 'question' ? '0' : req.kind === 'serious' ? 'deny' : 'allow';
    setTimeout(() => b.answer({ id: req.id, choice }), 50);
  });
  return b;
}

const run = (name: string, prompt: string, usd: number, more: Partial<Parameters<typeof runAgent>[0]> = {}) => {
  const workDir = join(OUT, 'work', name);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(join(OUT, 'recordings'), { recursive: true });
  return runAgent({
    prompt, workDir, recordingPath: join(OUT, 'recordings', `${name}.jsonl`), broker: broker(), emit: () => {},
    credentials: { source: 'env', apiKey: key }, maxBudgetUsd: usd, ...more,
  });
};

const recorded = (name: string) => {
  const file = join(OUT, 'recordings', `${name}.jsonl`);
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Raw) : [];
};
const messages = (name: string) => recorded(name).filter((e) => e.source === 'message').map((e) => e.payload as Record<string, unknown>);
/** The results Claude Code reported, as it reported them. */
const reports = (name: string) => messages(name).filter((m) => m.type === 'result')
  .map((m) => ({ subtype: m.subtype, total_cost_usd: m.total_cost_usd, usage: m.usage, session_id: m.session_id }));
/** Whether the model answered at all, which is the proof that money went. */
const answers = (name: string) => messages(name).filter((m) => m.type === 'assistant').length;

/** Until the model has answered, so the run has really cost something. */
async function firstAnswer(name: string, seconds: number) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (answers(name) > 0) return true;
    await sleep(500);
  }
  return false;
}

/** --child: the app, as far as Claude Code can tell. The parent kills this process. */
if (CHILD) {
  const running = run(CHILD, LONG, 0.4);
  void firstAnswer(CHILD, 120).then(() => console.log('answered'));
  await running;
  process.exit(0);
}

type Proc = { ProcessId: number; ParentProcessId: number; Name: string };
function processes(): Proc[] {
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(out) as Proc[];
}
function descendants(pid: number): Proc[] {
  const all = processes();
  const found: Proc[] = [];
  const walk = (parent: number) => {
    for (const p of all) if (p.ParentProcessId === parent && p.Name !== 'conhost.exe') { found.push(p); walk(p.ProcessId); }
  };
  walk(pid);
  return found;
}
const stillThere = (procs: Proc[]) => {
  const all = processes();
  return procs.filter((p) => all.some((a) => a.ProcessId === p.ProcessId && a.Name === p.Name));
};
const newestWrite = (dir: string) => Math.max(...readdirSync(dir).map((f) => statSync(join(dir, f)).mtimeMs));

mkdirSync(OUT, { recursive: true });
const report: Record<string, unknown> = {
  when: new Date().toISOString(), sim: SIM, claudeCode: await claudeVersion(claudePath),
};
const save = () => writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const wanted = (name: string) => !ONLY || ONLY.has(name);

if (wanted('round')) {
  console.log('A round, then a further round of the same session...');
  const ledger = new SpendLedger(join(OUT, 'round-spend.json'));
  const workDir = join(OUT, 'work', 'round-1');
  let session: string | undefined;
  const first = await run('round-1', 'Create the file hello.txt with one short line in it. Do nothing else.', 0.2, { onSession: (id) => { session = id; } });
  const addedFirst = ledger.record(workDir, session, first.costUsd);
  // The same folder, as the shop does it.
  const second = await run('round-2', 'Add a second short line to hello.txt. Do nothing else.', 0.2, { workDir, resume: session });
  const addedSecond = ledger.record(workDir, session, second.costUsd);
  report.round = {
    first: { ok: first.ok, error: first.error, costUsd: first.costUsd, reports: reports('round-1'), ledgerAdded: addedFirst },
    second: { ok: second.ok, error: second.error, costUsd: second.costUsd, reports: reports('round-2'), ledgerAdded: addedSecond },
    ledgerTotal: ledger.forCommission(workDir),
  };
  save();
  console.log(`  reported $${first.costUsd ?? '?'} then $${second.costUsd ?? '?'}; the ledger has $${ledger.forCommission(workDir)}`);
}

if (wanted('calloff')) {
  console.log('Calling a run off once the model has answered...');
  const ledger = new SpendLedger(join(OUT, 'calloff-spend.json'));
  const workDir = join(OUT, 'work', 'calloff');
  const abort = new AbortController();
  let session: string | undefined;
  const running = run('calloff', LONG, 0.4, { abort, onSession: (id) => { session = id; } });
  const answered = await firstAnswer('calloff', 120);
  await sleep(1500);
  const t0 = Date.now();
  abort.abort();
  const result = await running;
  const added = ledger.record(workDir, session, result.costUsd);
  report.calloff = {
    answeredBeforeCalling: answered, answers: answers('calloff'), error: result.error, costUsd: result.costUsd,
    reports: reports('calloff'), ledgerAdded: added, secondsToStop: Math.round((Date.now() - t0) / 1000),
    reachedTheLedger: added > 0,
  };
  save();
  console.log(`  ${added > 0 ? `the ledger has $${added}` : 'nothing reached the ledger'}, after ${answers('calloff')} answers`);
}

if (wanted('kill')) {
  console.log('Killing the app under a running commission, and watching for two minutes...');
  const child = spawn(process.execPath, ['--import', 'tsx', SCRIPT, '--child', 'kill', '--out', OUT, ...(SIM ? ['--sim'] : [])],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env: process.env });
  await new Promise<void>((done) => {
    child.stdout.on('data', (d: Buffer) => { if (String(d).includes('answered')) done(); });
    child.on('exit', () => done());
  });
  const procs = descendants(child.pid!);
  const dir = join(OUT, 'work', 'kill');
  child.kill();
  const killedAt = Date.now();
  const watched: { seconds: number; alive: string[]; lastWriteSeconds: number | null }[] = [];
  for (const seconds of [2, 10, 30, 60, 120]) {
    await sleep(killedAt + seconds * 1000 - Date.now());
    const alive = stillThere(procs);
    watched.push({ seconds, alive: alive.map((p) => p.Name), lastWriteSeconds: readdirSync(dir).length ? Math.round((newestWrite(dir) - killedAt) / 1000) : null });
    if (!alive.length) break;
  }
  const left = stillThere(procs);
  // Our own commission's processes only, picked by being this run's children: it must not go on spending.
  for (const p of left) execFileSync('taskkill', ['/F', '/PID', String(p.ProcessId)], { stdio: 'ignore' });
  report.kill = {
    answers: answers('kill'), children: procs.map((p) => p.Name), watched, stoppedByItself: left.length === 0,
    filesAfterwards: readdirSync(dir), reports: reports('kill'),
  };
  save();
  console.log(left.length ? `  still running after two minutes: ${left.map((p) => p.Name).join(', ')}. Stopped now.` : `  all stopped by themselves within ${watched.at(-1)?.seconds} seconds`);
}

console.log(`\nReport: ${join(OUT, 'report.json')}`);
