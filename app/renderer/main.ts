import Phaser from 'phaser';
import replayText from '../../demo/subagents.jsonl?raw';
import { normalizeAll } from '../main/event-normalizer';
import { fill, strings } from '../shared/i18n';
import type { ActorId, AnchorId, LamplightApi, RawAgentEvent } from '../shared/types';
import { CafeScene } from './game/CafeScene';
import { ACTORS, ANCHORS, BOARD_SLATE, CANVAS, integerScale } from './game/layout';
import { Stage, replay } from './stage/stage';
import { showDecision } from './ui/decision';
import { setReplayBadge, showActorCard, showCommissionForm, showNotice, showResult } from './ui/panels';

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
      if (el.textContent !== l.text) el.textContent = l.text;
      el.style.left = `${rect.left + l.x * s}px`;
      el.style.top = `${rect.top + l.y * s}px`;
    }
    for (const [key, el] of labelEls) {
      if (!seen.has(key)) { el.remove(); labelEls.delete(key); }
    }
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
scene.onActorClick = (actor) => showActorCard(actor, stage.actorInfo(actor));

// Decisions from the main process: show the dialog or serious card, send the answer back.
window.lamplight.onDecision(async (req) => {
  const choice = await showDecision(req);
  await window.lamplight.answerDecision({ id: req.id, choice });
});
window.lamplight.onResult((result) => showResult(result, (path, how) => void window.lamplight.openOutput(path, how)));

// The counter holds the commission form.
let running = false;
async function newCommission() {
  if (running) return;
  // Check what the shop needs before the form is filled in, not after.
  const env = await window.lamplight.envStatus();
  const U = strings.ui;
  if (!env.hasClaude) return showNotice(U.noClaudeTitle, U.noClaudeBody);
  if (!env.hasApiKey) return showNotice(U.noKeyTitle, U.noKeyBody);
  const form = await showCommissionForm();
  if (!form) return;
  running = true;
  append(`commission: ${form.want}${form.demo ? ' (demo)' : ''}`);
  try {
    const r = await window.lamplight.startCommission(form);
    append(r.ok ? `done. folder: ${r.workDir}` : `failed: ${r.error ?? 'see recording'}\nrecording: ${r.recordingPath}`);
  } finally {
    running = false;
  }
}
scene.onCounterClick = () => void newCommission();

// -- Debug panel --
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const actorSel = $<HTMLSelectElement>('actor');
const anchorSel = $<HTMLSelectElement>('anchor');
for (const a of ACTORS) actorSel.add(new Option(a.name, a.id));
for (const id of Object.keys(ANCHORS)) anchorSel.add(new Option(id, id));
$('walk').addEventListener('click', () => scene.walkTo(actorSel.value as ActorId, anchorSel.value as AnchorId));

const log = $<HTMLPreElement>('log');
const append = (line: string) => { log.textContent = `${line}\n${log.textContent}`.slice(0, 20000); };

window.lamplight.envStatus().then(({ hasApiKey, hasClaude }) => {
  const env = $('env');
  env.textContent = [
    hasApiKey ? 'Credentials found (API key or dev subscription).' : 'No credentials: set ANTHROPIC_API_KEY or LAMPLIGHT_DEV_SUBSCRIPTION=1.',
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
$('replay').addEventListener('click', () => {
  cancelReplay();
  const raw: RawAgentEvent[] = replayText.split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
  const events = normalizeAll(raw);
  append(`replay: ${events.length} events at 3x`);
  setReplayBadge(true);
  cancelReplay = replay(stage, events, 3, () => setReplayBadge(false));
});
