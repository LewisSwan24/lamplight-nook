import Phaser from 'phaser';
import replayText from '../../demo/subagents.jsonl?raw';
import { normalizeAll } from '../main/event-normalizer';
import { strings } from '../shared/i18n';
import type { ActorId, AnchorId, LamplightApi, RawAgentEvent } from '../shared/types';
import { CafeScene } from './game/CafeScene';
import { ACTORS, ANCHORS, CANVAS, integerScale } from './game/layout';
import { Stage, replay } from './stage/stage';

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
  }
  requestAnimationFrame(drawLabels);
}
requestAnimationFrame(drawLabels);

const stage = new Stage(scene);

// -- Debug panel --
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const actorSel = $<HTMLSelectElement>('actor');
const anchorSel = $<HTMLSelectElement>('anchor');
for (const a of ACTORS) actorSel.add(new Option(a.name, a.id));
for (const id of Object.keys(ANCHORS)) anchorSel.add(new Option(id, id));
$('walk').addEventListener('click', () => scene.walkTo(actorSel.value as ActorId, anchorSel.value as AnchorId));

const log = $<HTMLPreElement>('log');
const append = (line: string) => { log.textContent = `${line}\n${log.textContent}`.slice(0, 20000); };

window.lamplight.envStatus().then(({ hasApiKey }) => {
  const env = $('env');
  env.textContent = hasApiKey ? 'Credentials found (API key or dev subscription).' : 'No credentials: set ANTHROPIC_API_KEY or LAMPLIGHT_DEV_SUBSCRIPTION=1.';
  env.classList.toggle('missing', !hasApiKey);
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

// Replay the bundled real recording without calling the API.
let cancelReplay = () => {};
$('replay').addEventListener('click', () => {
  cancelReplay();
  const raw: RawAgentEvent[] = replayText.split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
  const events = normalizeAll(raw);
  append(`replay: ${events.length} events at 3x`);
  for (const e of events) append(`  ${e.agent} | ${e.kind} | ${e.plain}`);
  cancelReplay = replay(stage, events, 3);
});
