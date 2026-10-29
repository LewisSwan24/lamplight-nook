import Phaser from 'phaser';
import replayText from '../../demo/subagents.jsonl?raw';
import trialText from '../../demo/trial.zh-CN.jsonl?raw';
import { normalizeAll } from '../main/event-normalizer';
import { fill, strings } from '../shared/i18n';
import type { ActorId, AnchorId, CommissionForm, LamplightApi, RawAgentEvent, RunResult, Settings } from '../shared/types';
import { setMix, setPeriod, sfx } from './audio/sound';
import { CafeScene } from './game/CafeScene';
import { ACTORS, ANCHORS, BOARD_SLATE, CANVAS, integerScale } from './game/layout';
import { Chatter, type ShopMood } from './stage/chatter';
import { progressDue } from './stage/progress';
import { onRuleBookChange, ruleBook } from './stage/rulebook';
import { pickLine } from './translator/lines';
import { Stage, replay } from './stage/stage';
import { recordLine, setCaptionBar } from './ui/captions';
import { showDecision } from './ui/decision';
import { showMeeting } from './ui/meeting';
import { updateHotspots } from './ui/hotspots';
import { formatUsd } from '../shared/money';
import { setReplayBadge, showActorCard, showCommissionForm, showResult } from './ui/panels';
import { ACTIVE_FPS, applyFps, framesPerSecond, type Loop } from './game/pacer';
import { showFailure, showPending, showRunning } from './ui/run';
import { showNotReady, showTrialEnd, showWelcome } from './ui/setup';
import { emoteEl } from './ui/emotes';
import { mountToolbar, noteEvent, view } from './ui/toolbar';

declare global {
  interface Window { lamplight: LamplightApi }
}

document.title = strings.app.title;

const scene = new CafeScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS.width,
  height: CANVAS.height,
  pixelArt: true,
  backgroundColor: '#1b1712',
  scene,
  scale: { mode: Phaser.Scale.NONE },
  // Starts the frame limiter; the pacer below moves it between 30 and 15.
  fps: { limit: ACTIVE_FPS },
});

// Integer zoom keeps pixels crisp; leftover space stays dark.
function fit() {
  game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight));
}
window.addEventListener('resize', fit);
fit();

// Text overlay: map canvas coordinates to screen coordinates every frame.
const overlay = document.getElementById('labels')!;
const labelEls = new Map<string, HTMLSpanElement>();
function drawLabels() {
  if (scene.sys.isActive()) {
    const rect = game.canvas.getBoundingClientRect();
    const s = rect.width / CANVAS.width;
    // Mood bubbles are pixel art: whole screen pixels per art pixel, smaller next to a line of text.
    overlay.style.setProperty('--emote-px', `${Math.max(1, Math.floor(s * 0.75))}px`);
    overlay.style.setProperty('--emote-px-small', `${Math.max(1, Math.floor(s / 2))}px`);
    const seen = new Set<string>();
    for (const l of scene.labels()) {
      seen.add(l.key);
      let el = labelEls.get(l.key);
      if (!el) {
        el = document.createElement('span');
        el.className = `label ${l.kind}`;
        overlay.appendChild(el);
        labelEls.set(l.key, el);
      }
      const content = `${l.icon ?? ''}|${l.text}`;
      if (el.dataset.content !== content) {
        el.dataset.content = content;
        el.classList.toggle('icon-only', !!l.icon && !l.text);
        el.replaceChildren(...[l.icon ? emoteEl(l.icon) : null, l.text || null].filter((c): c is HTMLElement | string => c !== null));
      }
      el.style.left = `${rect.left + l.x * s}px`;
      el.style.top = `${rect.top + l.y * s}px`;
    }
    for (const [key, el] of labelEls) {
      if (!seen.has(key)) { el.remove(); labelEls.delete(key); }
    }
    updateHotspots(scene, rect, s);
    // The step list is chalked onto the blackboard's slate and scales with the scene.
    const board = document.getElementById('board');
    if (board) {
      const b = BOARD_SLATE;
      Object.assign(board.style, {
        left: `${rect.left + b.x * s}px`,
        top: `${rect.top + b.y * s}px`,
        width: `${b.w * s}px`,
        height: `${b.h * s}px`,
        fontSize: `${3.1 * s}px`,
      });
    }
  }
  requestAnimationFrame(drawLabels);
}
requestAnimationFrame(drawLabels);

const stage = new Stage(scene);
stage.onEvent = noteEvent;

// Small talk when the shop is quiet: never while working, while a card waits for the user, or when hidden.
let replaying = false;
const chatter = new Chatter(ruleBook().chats, ruleBook().lines.idle_mutter ?? [], Date.now());
onRuleBookChange((b) => chatter.reload(b.chats, b.lines.idle_mutter ?? []));
setInterval(() => {
  setPeriod(scene.period);
  const blocked = document.hidden || document.querySelector('.backdrop');
  const busy = running || replaying;
  const mood: ShopMood = blocked ? 'blocked' : !busy ? 'idle' : stage.actorInfo('adeng').state === 'waiting' ? 'waiting' : 'working';
  const talk = chatter.next(mood, Date.now(), scene.period);
  if (talk) void stage.talk(talk.turns);
  if (running && !blocked) sayProgress();
}, 5000);

// Long commissions: now and then Adeng says how far along it is (from the blackboard).
let runStartedAt = 0;
let progressSaidAt: number | undefined;
let progressCount = 0;
function sayProgress() {
  const now = Date.now();
  if (!progressDue(runStartedAt, progressSaidAt, now) || scene.busyTalking('adeng')) return;
  const lines = ruleBook().lines.progress ?? [];
  const k = progressCount % Math.max(1, lines.length);
  const { done, left, doing } = stage.progress();
  const vars: Record<string, string> = { minutes: String(Math.round((now - runStartedAt) / 60_000)), done: String(done), left: String(left) };
  if (doing) vars.doing = doing;
  // Take the lines in turn; one that can't be filled (nothing under way) passes to the next.
  const turns = pickLine([...lines.slice(k), ...lines.slice(0, k)], [], vars);
  if (!turns) return;
  progressSaidAt = now;
  progressCount++;
  void stage.talk(turns);
}

// A meeting: ring the bell on the counter, everyone in the shop comes to the big table, and what the user
// says goes to the running commission. Nobody moves for the work while the meeting lasts.
const STAFF: ActorId[] = ['adeng', 'xiaoju', 'laoshi'];
let meetingOpen = false;
let meetingCount = 0;
function sayFrom(group: string, k = 0) {
  const lines = ruleBook().lines[group] ?? [];
  const turns = pickLine([...lines.slice(k % Math.max(1, lines.length)), ...lines.slice(0, k % Math.max(1, lines.length))], [], {});
  const present = (turns ?? []).filter((t) => scene.anchorOf(t.speaker) !== null);
  return present.length ? stage.talk(present) : Promise.resolve();
}
async function meeting() {
  if (!running || meetingOpen) return;
  meetingOpen = true;
  sfx('ding');
  stage.holdStill();
  const here = STAFF.filter((a) => scene.anchorOf(a) !== null);
  const before = new Map(here.map((a) => [a, scene.anchorOf(a)!]));
  void sayFrom('meeting_call', meetingCount);
  // The card opens straight away; everyone gathers at the table meanwhile.
  const gathered = Promise.all(here.map((a) => scene.walkTo(a, 'table')));
  const note = await showMeeting();
  await gathered;
  const heard = note ? await window.lamplight.addNote(note) : false;
  if (note) void sayFrom(heard ? 'meeting_heard' : 'meeting_late', meetingCount);
  meetingCount++;
  stage.carryOn();
  // Whoever no command has sent elsewhere goes back to where they were.
  for (const [a, spot] of before) if (scene.anchorOf(a) === 'table' && spot !== 'table') void scene.walkTo(a, spot);
  meetingOpen = false;
}
scene.onBellClick = () => void meeting();

// Frame pacing: 30 a second while anything is going on, 15 once the shop has been quiet for a while.
let lastInput = Date.now();
for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel']) window.addEventListener(type, () => { lastInput = Date.now(); }, { passive: true, capture: true });
const pace = () => {
  const fps = framesPerSecond({ busy: running !== null, sinceInputMs: Date.now() - lastInput });
  if (game.loop.fpsLimit !== fps) applyFps(game.loop as unknown as Loop, fps);
};
setInterval(pace, 5000);

// Out of sight (minimized, or hidden to the tray) the stage skips the acting; back in view, it is up to date.
const syncVisibility = () => { stage.catchingUp = document.hidden; };
document.addEventListener('visibilitychange', syncVisibility);
scene.onActorClick = (actor) => showActorCard(actor, stage.actorInfo(actor), view.detailed);
scene.onSound = sfx;
scene.onSay = recordLine;

// Decisions from the main process: show the dialog or serious card, send the answer back.
window.lamplight.onDecision(async (req) => {
  const choice = await showDecision(req);
  await window.lamplight.answerDecision({ id: req.id, choice });
});
window.lamplight.onResult((result) => showResult(result, (path, how) => void window.lamplight.openOutput(path, how)));

// The counter holds the commission form; while a commission runs it shows what is being made instead.
let running: string | null = null;
async function run(want: string, start: () => Promise<RunResult | null>) {
  running = want;
  runStartedAt = Date.now();
  progressSaidAt = undefined;
  scene.setFormWaiting(false);
  scene.setBell(true);
  try {
    const r = await start();
    if (!r) return;
    sfx(r.ok ? 'success' : 'fail');
    append(r.ok ? `done. folder: ${r.workDir}` : `failed: ${r.error ?? 'see recording'}\nrecording: ${r.recordingPath}`);
    if (!r.ok && r.error) showFailure(window.lamplight, r.error, () => void run(want, () => window.lamplight.retryCommission()), { cost: formatUsd(r.costUsd ?? 0) });
  } finally {
    running = null;
    scene.setFormWaiting(true);
    scene.setBell(false);
  }
}
async function newCommission() {
  if (running) return showRunning(window.lamplight, running);
  // Check what the shop needs before the form is filled in, not after.
  const env = await window.lamplight.envStatus();
  if (!env.hasClaude || !env.hasApiKey) return showNotReady(window.lamplight, env, startTrial);
  const form = await showCommissionForm(window.lamplight);
  if (!form) return;
  append(`commission: ${form.want}${form.demo ? ' (demo)' : ''}`);
  await prepare(form);
  await run(form.want, () => window.lamplight.startCommission(form));
}

/** Tell the stage what the commission is about and what Adeng remembers that bears on it. */
async function prepare(form: CommissionForm) {
  const brief = form.demo ? strings.demo.brief : [...form.want].slice(0, 10).join('');
  const recall = await window.lamplight.recallForCommission(form);
  // The demo's one question is the colour question, which has its own line.
  stage.setCommission({ brief, ...recall, flags: [...recall.flags, ...(form.demo ? ['demo_color'] : [])] });
}
scene.onCounterClick = () => void newCommission();

// Settings that change how the shop looks and sounds. Less motion also follows the system setting.
const systemCalm = matchMedia('(prefers-reduced-motion: reduce)');
let current: Settings | null = null;
function applySettings(s: Settings) {
  current = s;
  setMix({ volume: s.volume, muted: s.muted, period: scene.period });
  setCaptionBar(s.captions);
  const calm = s.reducedMotion || systemCalm.matches;
  document.body.classList.toggle('reduce-motion', calm);
  scene.setReducedMotion(calm);
}
systemCalm.addEventListener('change', () => current && applySettings(current));

// Adeng greets the user by name; the first visit walks through setup first.
const greet = (text: string) => {
  scene.say('adeng', text);
  setTimeout(() => scene.say('adeng', null), 3500);
};
/** Welcome back, bringing up the last commission once if there is one to ask about. */
async function greetBack(name: string) {
  const { flags, vars } = await window.lamplight.recallOnOpen();
  const turns = pickLine(ruleBook().lines.app_open ?? [], flags, { ...vars, name });
  if (turns) void stage.talk(turns);
}
async function openShop() {
  const api = window.lamplight;
  let settings = await api.getSettings();
  mountToolbar(api, settings, applySettings);
  applySettings(settings);
  const S = strings.ui.setup;
  if (!settings.onboarded) {
    settings = await showWelcome(api, settings, await api.envStatus());
    greet(fill(S.greet, { name: settings.name }));
  } else if (settings.name) {
    setTimeout(() => void greetBack(settings.name), 1200);
  }
  // A commission left unfinished when the app last closed.
  const left = await api.pendingCommission();
  if (left) showPending(api, left, () => void prepare(left).then(() => run(left.want, () => api.resumePending())));
}
void openShop();


// -- Debug panel --
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const actorSel = $<HTMLSelectElement>('actor');
const anchorSel = $<HTMLSelectElement>('anchor');
for (const a of ACTORS) actorSel.add(new Option(a.name, a.id));
for (const id of Object.keys(ANCHORS)) anchorSel.add(new Option(id, id));
$('walk').addEventListener('click', () => scene.walkTo(actorSel.value as ActorId, anchorSel.value as AnchorId));

const log = $<HTMLPreElement>('log');
const append = (line: string) => { log.textContent = `${line}\n${log.textContent}`.slice(0, 20000); };

window.lamplight.envStatus().then(({ hasApiKey, hasClaude, debug }) => {
  // The debug panel is for development only.
  document.body.classList.toggle('debug', debug);
  // Handles for driving the scene from dev tools and screenshot scripts.
  if (debug) {
    const api = window.lamplight;
    const ui = { showRunning: (want: string) => showRunning(api, want), showFailure: (kind: string) => showFailure(api, kind, () => {}), showCommissionForm: () => showCommissionForm(api) };
    // pretendRunning: show what the shop looks like mid-commission (bell out, form away) without running one.
    const pretendRunning = (on: boolean) => { running = on ? 'debug' : null; scene.setFormWaiting(!on); scene.setBell(on); };
    Object.assign(window, { lamplightDebug: { scene, stage, ui, replay: startReplay, pretendRunning } });
  }
  const env = $('env');
  env.textContent = [
    hasApiKey ? 'Credentials found (saved key, ANTHROPIC_API_KEY, or dev subscription).' : 'No credentials: paste a key in Settings, or set ANTHROPIC_API_KEY.',
    hasClaude ? 'Claude Code found.' : 'Claude Code not installed.',
  ].join(' ');
  env.classList.toggle('missing', !hasApiKey || !hasClaude);
});

// Live runs: normalized events drive the stage and are logged.
window.lamplight.onAiEvent((e) => {
  append(`${e.agent} | ${e.kind} | ${e.plain}${e.risk ? ` (${e.risk})` : ''}`);
  stage.speed = 1;
  stage.handle(e);
});

for (const [btn, kind] of [['run-hello', 'hello'], ['run-sub', 'subagents']] as const) {
  $(btn).addEventListener('click', async () => {
    append(`start: ${kind}`);
    const r = await window.lamplight.runDebugTask(kind);
    append(r.ok ? `done. folder: ${r.workDir}\nrecording: ${r.recordingPath}` : `failed: ${r.error ?? 'see recording'}\nrecording: ${r.recordingPath}`);
  });
}

$('commission').addEventListener('click', () => void newCommission());

// Preview both decision cards with sample content (nothing is sent to the AI).
$('preview-cards').addEventListener('click', async () => {
  const D = strings.decision;
  const [cream, mint] = strings.demo.colors;
  const picked = await showDecision({
    id: 'preview-q', kind: 'question', agent: 'main', tool: 'AskUserQuestion', title: strings.demo.colorQuestion, defaultId: '0',
    options: [
      { id: '0', label: cream, hint: strings.demo.colorHints[0] },
      { id: '1', label: mint, hint: strings.demo.colorHints[1] },
      { id: 'delegate', label: D.delegate, hint: D.delegateHint },
    ],
  });
  append(`preview question -> ${picked}`);
  const action = fill(D.deleteFiles, { files: ['draft-1.html', 'draft-2.html'].join(strings.app.listSeparator) });
  const confirmed = await showDecision({
    id: 'preview-s', kind: 'serious', agent: 'main', tool: 'Bash', title: action, reason: strings.risk.delete,
    detail: 'rm draft-1.html draft-2.html', defaultId: 'deny',
    options: [{ id: 'deny', label: D.deny }, { id: 'allow', label: action }],
  });
  append(`preview serious -> ${confirmed}`);
});

// Replay the bundled real recording without calling the API.
let cancelReplay = () => {};
function startReplay(speed = 3) {
  cancelReplay();
  // The bundled recording is a stranger's commission: nothing from this user's memory applies.
  stage.setCommission({ brief: strings.demo.brief });
  const raw: RawAgentEvent[] = replayText.split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
  const events = normalizeAll(raw);
  append(`replay: ${events.length} events at ${speed}x`);
  setReplayBadge(true);
  replaying = true;
  cancelReplay = replay(stage, events, speed, () => { setReplayBadge(false); replaying = false; });
}
$('replay').addEventListener('click', () => startReplay());

/**
 * The trial: a recorded demo commission played in the shop, for people without Claude Code or a key yet.
 * It is marked as a replay throughout and spends nothing; at the end it points to setting up.
 */
const TRIAL_SPEED = 0.8;
const TRIAL_WRAP_UP_MS = 6000;
function startTrial() {
  cancelReplay();
  stage.setCommission({ brief: strings.demo.brief, flags: ['demo_color'] });
  const events = normalizeAll(trialText.split('\n').filter(Boolean).map((l: string) => JSON.parse(l) as RawAgentEvent));
  setReplayBadge(true);
  replaying = true;
  scene.setFormWaiting(false);
  // A little slower than recorded, and the end card waits for the wrap-up lines to finish.
  cancelReplay = replay(stage, events, TRIAL_SPEED, () => {
    setReplayBadge(false);
    replaying = false;
    scene.setFormWaiting(true);
    showTrialEnd(async () => showNotReady(window.lamplight, await window.lamplight.envStatus()));
  }, TRIAL_WRAP_UP_MS);
}
