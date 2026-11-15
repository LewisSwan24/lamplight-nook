import { currentScene } from '../shared/scenes';
import Phaser from 'phaser';
import replayText from '../../demo/subagents.jsonl?raw';
import zhTrial from '../../demo/trial.zh-CN.jsonl?raw';
import enTrial from '../../demo/trial.en.jsonl?raw';
import { normalizeAll } from '../main/event-normalizer';
import { fill, locale, shorten, strings } from '../shared/i18n';
import type { ActorId, AnchorId, CommissionForm, CommissionResult, EnvStatus, LamplightApi, RawAgentEvent, RunResult, Settings, GuestId, UpdateOffer } from '../shared/types';
import { setMix, setPeriod, sfx } from './audio/sound';
import { CafeScene } from './game/CafeScene';
import { GardenPlanner, GardenTalk, gardenOpen, outdoorsFor } from './game/garden';
import { outsideFlags } from './game/weather';
import { VisitPlanner, pickVisit, welcomeGuests } from './game/guests';
import { ACTORS, ANCHORS, BOARD_SLATE, CANVAS, ZONES, integerScale, toolIconPx, uiScale } from './game/layout';
import { Chatter, type ShopMood } from './stage/chatter';
import { progressDue } from './stage/progress';
import { onRuleBookChange, ruleBook } from './stage/rulebook';
import { openingTurns, pickLine } from './translator/lines';
import { Stage, replay } from './stage/stage';
import { recordLine, setCaptionBar, showCaptionLog } from './ui/captions';
import { showDecision } from './ui/decision';
import { showMeeting } from './ui/meeting';
import { updateHotspots } from './ui/hotspots';
import { formatUsd } from '../shared/money';
import { answerFirst, boardSteps, clearWorkSigns, commissionFormOpen, renderBoard, setReplayBadge, showPlan, showActorCard, showCommissionForm, showResult } from './ui/panels';
import { ACTIVE_FPS, applyFps, framesPerSecond, type Loop } from './game/pacer';
import { closeRunning, hasFailureCard, refreshRunning, showFailure, showPending, showRunning } from './ui/run';
import { type ObjectId, objectReaction } from './game/objects';
import { showLegal, showNotReady, showTrialEnd, showWelcome } from './ui/setup';
import { onNotebookForget, showDataTrouble, onNotebookRevise, showNotebook } from './ui/notebook';
import { showShelf } from './ui/shelf';
import { birthdayToday } from '../shared/days';
import { localDay } from '../shared/localday';
import { STAFF, apprenticeHere, apprenticeNews } from '../shared/staff';
import { type GrowthId, type Made, bedNews, madeOf, shortWork } from '../shared/growth';
import { showRevise } from './ui/revise';
import { showUpdateLetter } from './ui/letter';
import { askMoveIn } from './ui/move-in';
import { type BubbleBox, placeBubbles } from './ui/bubble-layout';
import { emoteEl } from './ui/emotes';
import { mountToolbar, noteEvent, setWorking, syncToolbar, view } from './ui/toolbar';

declare global {
  interface Window { lamplight: LamplightApi }
}

document.title = strings.app.title;
document.documentElement.lang = locale();

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
  // Only clicks on the canvas itself reach the shop; a click on a card must not go through to whoever stands behind it.
  input: { windowEvents: false },
  // Starts the frame limiter; the pacer below moves it between 30 and 15.
  fps: { limit: ACTIVE_FPS },
});

// Integer zoom keeps pixels crisp; leftover space stays dark.
function fit() {
  game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight, window.devicePixelRatio));
  const ui = uiScale(window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty('--ui', String(ui));
  document.documentElement.style.setProperty('--tool-px', String(toolIconPx(ui, window.devicePixelRatio)));
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
    const bubbles: BubbleBox[] = [];
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
      if (l.kind === 'bubble') {
        const size = el.getBoundingClientRect();
        bubbles.push({ key: l.key, x: rect.left + l.x * s, y: rect.top + l.y * s, w: size.width, h: size.height, iconOnly: !!l.icon && !l.text });
      }
    }
    if (bubbles.length) {
      const cards = Array.from(document.querySelectorAll('.card, .parcel, .dialog, .serious')).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
      const board = ZONES.find((z) => z.id === 'board')!;
      const chalk = { left: rect.left + board.x * s, right: rect.left + (board.x + board.w) * s, top: rect.top + board.y * s, bottom: rect.top + (board.y + board.h) * s };
      for (const [key, place] of placeBubbles(bubbles, cards, [chalk], window.innerWidth)) {
        const el = labelEls.get(key)!;
        el.style.left = `${place.x}px`;
        el.style.top = `${place.y}px`;
        el.style.visibility = place.visible ? '' : 'hidden';
      }
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
  const talk = chatter.next(mood, Date.now(), scene.period, scene.outside(), shopDays);
  if (talk) void stage.talk(talk.turns);
  // A one-off story is told once, ever.
  if (talk?.once) {
    shopDays.told.add(talk.id);
    void window.lamplight.markTold(talk.id);
  }
  tendGarden(!busy);
  bringLetter(!busy && !blocked && scene.view === 'shop');
  dropIn(!busy && !blocked && scene.view === 'shop');
  if (running && !blocked) sayProgress();
}, 5000);

// The back garden: when the shop is quiet someone wanders out now and then; work calls everyone back in,
// and so do rain and nightfall.
const gardenPlanner = new GardenPlanner(Date.now());
function tendGarden(quiet: boolean) {
  const { sky } = scene.outside();
  const open = gardenOpen(sky, scene.period);
  const step = gardenPlanner.next(Date.now(), quiet && open, outdoorsFor(scene.freeForGarden(), sky, scene.period));
  for (const id of step.back) {
    const home = ACTORS.find((a) => a.id === id)!.home;
    // Someone a commission already sent for is on their way; only fetch whoever is still out there.
    if (scene.isInGarden(id)) void scene.walkTo(id, home);
  }
  if (step.go) void scene.visitGarden(step.go.actor, step.go.spot);
  talkInGarden();
}

// Now and then a neighbour drops in for a word while the shop is quiet; work sends them on their way.
const visits = new VisitPlanner(Date.now());
scene.onGuestIn = (id) => void window.lamplight.markMet(id);
const heardVisits = new Set<string>();
function dropIn(quiet: boolean) {
  const guest = visits.next(Date.now(), quiet && !scene.hasGuest(), scene.period, welcomeGuests(shopDays.made));
  if (guest) welcome(guest);
}
function welcome(guest: GuestId) {
  const present = (who: string) => scene.anchorOf(who as ActorId) !== null;
  const chat = pickVisit(ruleBook().chats, guest, scene.outside(), scene.period, present, heardVisits, shopDays);
  if (chat) void scene.guestVisit(guest, chat.turns.map((t) => ({ ...t, text: fill(t.text, { lastWork: shopDays.lastWork ?? '' }) })));
}

// A new version (road-to-1.1.md A1): the postman brings the letter once the shop is quiet and nothing lies over it,
// at any hour. Sent away by work before he hands it over, he brings it again later.
let letter: UpdateOffer | null = null;
window.lamplight.onUpdate((offer) => { letter = offer; });
function bringLetter(quiet: boolean) {
  if (!letter || !quiet || scene.hasGuest() || document.querySelector('#ui > .card, #ui > form.card, .legal-backdrop')) return;
  const offer = letter;
  letter = null;
  let handed = false;
  void scene.guestVisit('postman', [{ speaker: 'postman', text: strings.ui.update.postman }, { speaker: 'adeng', text: strings.ui.update.thanks }], () => {
    handed = true;
    showUpdateLetter(offer, () => void fetchUpdate());
  }).then(() => { if (!handed) letter ??= offer; });
}
/** "Update": Adeng goes to fetch it, and says when it is in hand (it goes in when the shop closes). */
async function fetchUpdate() {
  greet(strings.ui.update.fetching);
  // The first line has its time even when the version is in hand at once.
  const [fetched] = await Promise.all([window.lamplight.downloadUpdate(), wait(GREET_MS)]);
  greet(fetched ? strings.ui.update.ready : strings.ui.update.failed);
}

// Out in the garden people say something about what they are doing, heard while you look out there.
const gardenTalk = new GardenTalk(Date.now());
function talkInGarden() {
  const now = Date.now();
  if (scene.view !== 'garden') return;
  const say = gardenTalk.next(now, ruleBook().lines.garden ?? [], scene.gardenVisitors(), scene.outside().sky);
  if (!say) return;
  // Whoever comes back in leaves what they were saying out there (CafeScene clears it).
  const hush = () => scene.isInGarden(say.actor) && scene.say(say.actor, null);
  if (!say.line) {
    scene.say(say.actor, null, 'zzz');
    setTimeout(hush, 2500);
    return;
  }
  const bubbles = say.line.bubbles;
  void (async () => {
    for (const text of bubbles) {
      if (!scene.isInGarden(say.actor)) break;
      scene.say(say.actor, text);
      await new Promise((r) => setTimeout(r, 2000 + 150 * [...text].length));
    }
    hush();
  })();
}
scene.onView = (v) => {
  document.body.classList.toggle('garden-view', v === 'garden');
  // Looking out: someone out there says something soon, instead of after a long silence.
  if (v === 'garden') gardenTalk.soon(Date.now());
};

// Long commissions: now and then Adeng says how far along it is (from the blackboard).
let runStartedAt = 0;
let runBudget = 0;
/** What was handed over for the commission under way, for the table to tell. */
let runMaterials: string[] = [];
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
  scene.setHint('bell', false);
  meetingOpen = true;
  sfx('ding');
  stage.holdStill();
  const here = STAFF.filter((a) => scene.anchorOf(a) !== null);
  const before = new Map(here.map((a) => [a, scene.anchorOf(a)!]));
  void sayFrom('meeting_call', meetingCount);
  // The card opens straight away; everyone gathers at the table meanwhile.
  const gathered = Promise.all(here.map((a) => scene.walkTo(a, 'table')));
  const note = await showMeeting(current?.avatar);
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
// Lines from a replay (the trial) are marked in the caption log, so they never pass for real work.
scene.onSay = (who, text) => recordLine(who, replaying ? text + strings.ui.replayTag : text);
scene.onStreet = (open) => document.body.classList.toggle('street-open', open);

// Decisions from the main process: show the dialog or serious card, send the answer back.
// One at a time, in the order they came, so two cards never sit on top of each other.
let decisions = Promise.resolve();
window.lamplight.onDecision((req) => {
  decisions = decisions.then(async () => {
    const choice = await showDecision(req);
    await window.lamplight.answerDecision({ id: req.id, choice });
  }).catch((e) => append(`decision failed: ${e}`));
});
// What the shop has gathered with the user, and the works shelf; refreshed whenever a commission comes back.
let shopDays: { done: number; told: Set<string>; made: Made; lastWork?: string } = { done: 0, told: new Set(), made: {} };
/** How many works were on the shelf before this result came back (the shelf only shows from the first). */
let worksKept = 0;
/** `justFinished`: a work has just come back, so the apprentice it brings walks in rather than simply being there. */
async function refreshShop(fresh: GrowthId[] = [], justFinished = false) {
  const state = await window.lamplight.shopState();
  // The scene builds its props on its first frame; wait for it when the shop has only just opened.
  while (!scene.growth) await new Promise((r) => setTimeout(r, 100));
  scene.growth.setGrown(state.grown.map((g) => g.id), fresh);
  scene.growth.setWorks(state.works.map((w) => w.icon));
  scene.garden.setWorksDone(state.done);
  stage.setApprentice(apprenticeHere(state.done), justFinished && apprenticeNews(shopDays.done, state.done));
  shopDays = { done: state.done, told: new Set(state.told), made: madeOf(state.works), lastWork: state.works[0] && shortWork(state.works[0].title) };
  worksKept = state.works.length;
}
/** Something new in the shop: someone says a word about it. */
function noticeGrowth(ids: GrowthId[]) {
  const id = ids.at(-1);
  if (id) sayOnce(`grow_${id}`, GROWTH_LINE_DELAY_MS);
}
const GROWTH_LINE_DELAY_MS = 4000;
/** After anything new in the shop has had its word. */
const BEDS_LINE_DELAY_MS = 10_000;
/** After the apprentice has walked in from the street. */
const APPRENTICE_LINE_DELAY_MS = 7000;
const ONCE_RETRY_MS = 2_000;
function noticeBeds(news: ReturnType<typeof bedNews>) {
  if (news) sayOnce(`grow_${news}`, BEDS_LINE_DELAY_MS);
}
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
/** Once a year, whenever the shop is opened that day or is still open when the day comes. */
let birthdayWaiting = '';
async function noticeBirthday() {
  const { works, done, told } = await window.lamplight.shopState();
  const age = birthdayToday(works, done);
  const key = `birthday_${age}`;
  if (!age || told.includes(key) || birthdayWaiting === key) return;
  birthdayWaiting = key;
  // Counted as said only once it has been: a shop closed before then says it the next time.
  sayOnce('grow_birthday', BEDS_LINE_DELAY_MS, () => void window.lamplight.markTold(key));
}
let today = localDay(new Date());
setInterval(() => {
  if (localDay(new Date()) === today) return;
  today = localDay(new Date());
  void noticeBirthday();
}, 60_000);
/** The lines still to be said, one at a time; forgetting everything takes them back. */
let onceLines: Promise<unknown> = Promise.resolve();
let forgotten = 0;
/** Said only once in the life of the shop, so it waits until someone is in the room to hear it, nothing lies over the shop, and the speaker is there and free. */
function sayOnce(line: string, delay: number, said?: () => void) {
  const due = Date.now() + delay;
  const asked = forgotten;
  onceLines = onceLines.then(async () => {
    await wait(due - Date.now());
    while (asked === forgotten) {
      const turns = pickLine(ruleBook().lines.grow ?? [], [line], {}) ?? [];
      const unheard = document.hidden || scene.view !== 'shop' || document.querySelector('#ui > .card, #ui > form.card, .backdrop, .legal-backdrop');
      if (!unheard && turns.every((t) => scene.anchorOf(t.speaker) !== null && !scene.busyTalking(t.speaker))) {
        said?.();
        return stage.talk(turns);
      }
      await wait(ONCE_RETRY_MS);
    }
  });
}
/** Clicking something in the shop: a line, a light, someone strolling over; never anything that costs money. */
const objectTurns = new Map<ObjectId, number>();
function clickObject(id: ObjectId) {
  const turn = objectTurns.get(id) ?? 0;
  objectTurns.set(id, turn + 1);
  const now = new Date();
  const r = objectReaction(id, {
    running: running !== null, hour: now.getHours(), minute: now.getMinutes(), sky: scene.outside().sky, period: scene.period,
    errand: scene.outOnErrand, materials: runMaterials, laoshiDoing: stage.actorInfo('laoshi').doing ?? '', turn,
  }, strings.ui.objects);
  if ('open' in r) return openProgress();
  if ('lamp' in r) return void (sfx('click'), scene.toggleLamp());
  const here = STAFF.filter((a) => scene.anchorOf(a) !== null);
  const speaker = here.includes(r.by) ? r.by : here[0];
  if (!speaker) return;
  if (r.wiggle) scene.wiggle(id);
  if (r.walk && !scene.reducedMotion) void scene.walkTo(speaker, r.walk);
  void stage.answer(speaker, r.say);
}
scene.onObjectClick = clickObject;
scene.onYouClick = () => void stage.answer('adeng', strings.ui.objects.you);
scene.boardInUse = () => running !== null || boardSteps().length > 0;
scene.onBoardClick = () => {
  scene.setHint('board', false);
  if (running) openProgress();
  else showPlan(boardSteps());
};
scene.onWorksClick = () => void showShelf(window.lamplight, (id, title) => void revise(id, title));
onNotebookForget(() => {
  forgotten++;
  void refreshShop();
});
window.lamplight.onResult((result) => {
  const before = shopDays.done;
  void refreshShop(result.grew ?? [], true).then(() => {
    noticeBeds(bedNews(before, shopDays.done));
    // Adeng introduces the apprentice once they are through the door.
    if (apprenticeNews(before, shopDays.done)) sayOnce('grow_apprentice', APPRENTICE_LINE_DELAY_MS);
  });
  noticeGrowth(result.grew ?? []);
});
// A commission that stopped has its own card, which says what to do; putting a result card away first would end it.
window.lamplight.onResult((result) => hasFailureCard(result.error) || showResult(result, {
  open: (path, how) => void window.lamplight.openOutput(path, how),
  revise: (id) => void revise(id),
  restore: (id) => window.lamplight.restorePrevious(id),
  undo: (id) => window.lamplight.undoWork(id),
  firstWork: worksKept === 0,
  report: () => void window.lamplight.writeToUs({ about: 'content', title: lastWant ?? undefined }),
}));

// The counter holds the commission form; while a commission runs it shows what is being made instead.
let running: string | null = null;
/** How long into the first commission Adeng says what the bell and the blackboard are for. */
const FIRST_HINT_MS = 5000;
/** What the last commission (or round of changes) was, for a report about what came back. */
let lastWant: string | null = null;
async function run(want: string, start: () => Promise<RunResult | null>) {
  running = want;
  setWorking(true);
  lastWant = want;
  scene.showShop();
  tendGarden(false);
  scene.sendGuestAway();
  // You come in with the slip and wait by the lamp while it is made.
  void scene.youArrive();
  runStartedAt = Date.now();
  runBudget = (await window.lamplight.getSettings()).budgetUsd;
  progressSaidAt = undefined;
  scene.setFormWaiting(false);
  scene.setBell(true);
  // The very first commission: show what the bell and the blackboard are for, once they are there to be seen.
  if (worksKept === 0) {
    scene.setHint('bell', true);
    scene.setHint('board', true);
    setTimeout(() => { if (running === want) greet(strings.ui.run.firstHint); }, FIRST_HINT_MS);
  }
  try {
    const r = await start();
    if (!r) return;
    sfx(r.ok ? 'success' : 'fail');
    append(r.ok ? `done. folder: ${r.workDir}` : `failed: ${r.error ?? 'see recording'}\nrecording: ${r.recordingPath}`);
    // No card to put away (called off, no key, no Claude Code): nothing is going on any more, so the plan goes now.
    if (!r.ok && !showFailure(window.lamplight, r.error ?? '', () => void run(want, () => window.lamplight.retryCommission()), { cost: formatUsd(r.spentThisRun ?? r.costUsd ?? 0) }, r.workDir)) clearWorkSigns();
  } finally {
    closeRunning();
    running = null;
    setWorking(false);
    scene.setHint('bell', false);
    scene.setHint('board', false);
    runMaterials = [];
    scene.setFormWaiting(true);
    scene.setBell(false);
    void scene.youLeave();
  }
}
/** The one card for work under way. */
function openProgress() {
  showRunning(window.lamplight, () => ({
    want: running ?? '',
    startedAt: runStartedAt,
    budgetUsd: runBudget,
    steps: boardSteps(),
    realPlan: stage.planIsReal,
    now: stage.latestDoing,
    staff: STAFF.filter((actor) => actor !== 'xiaodou' || apprenticeHere(shopDays.done)).map((actor) => ({ actor, state: stage.actorInfo(actor).state, doing: stage.actorInfo(actor).doing ?? '' })),
  }), { meet: () => void meeting(), actor: (actor) => showActorCard(actor, stage.actorInfo(actor), view.detailed) });
}

/** The user chose to go ahead with an old Claude Code; not asked again until the app restarts. */
let oldClaudeOk = false;
/** What the shop needs before a commission: Claude Code, a key, and (unless waved through) a recent enough Claude Code. */
const notReady = (env: EnvStatus) => !env.hasClaude || !env.hasApiKey || (env.claudeCompat === 'old' && !oldClaudeOk);

async function newCommission(dropped: string[] = []) {
  if (answerFirst()) return;
  if (running) {
    if (dropped.length) return greet(strings.ui.materials.busy);
    return openProgress();
  }
  // Check what the shop needs before the form is filled in, not after.
  const env = await window.lamplight.envStatus();
  if (notReady(env)) return showNotReady(window.lamplight, env, startTrial, () => void newCommission(dropped), () => { oldClaudeOk = true; void newCommission(dropped); });
  const handed = dropped.length ? await window.lamplight.handOver(dropped, []) : undefined;
  const form = await showCommissionForm(window.lamplight, (await window.lamplight.getSettings()).budgetUsd, handed);
  if (!form) return;
  append(`commission: ${form.want}${form.demo ? ' (demo)' : ''}`);
  await prepare(form);
  runMaterials = (form.materials ?? []).map((m) => m.split(/[\\/]/).pop()!);
  await run(form.want, () => window.lamplight.startCommission(form));
}

/**
 * "Change it a bit": what to change, in the user's words, then another round in the same folder.
 * `title` is shown when the commission was picked from the notebook rather than the card just handed over.
 */
async function revise(id: string, title?: string) {
  if (running) return openProgress();
  const env = await window.lamplight.envStatus();
  if (notReady(env)) return showNotReady(window.lamplight, env, startTrial, () => void revise(id, title), () => { oldClaudeOk = true; void revise(id, title); });
  const ask = await showRevise(current?.avatar, title);
  if (!ask) return;
  append(`revise ${id}: ${ask}`);
  const { flags, vars } = await window.lamplight.recallForRevision(id);
  stage.setCommission({ brief: shorten(ask), flags, vars });
  await run(ask, () => window.lamplight.reviseCommission({ id, ask }));
}
onNotebookRevise((id, title) => void revise(id, title));

/** Tell the stage what the commission is about and what Adeng remembers that bears on it. */
async function prepare(form: CommissionForm) {
  const brief = form.demo ? strings.demo.brief : shorten(form.want);
  const recall = await window.lamplight.recallForCommission(form);
  // The demo's one question is the colour question, which has its own line.
  const kind = [...(form.template ? [`tpl_${form.template}`] : []), ...(form.materials?.length ? ['handed'] : [])];
  stage.setCommission({ brief, ...recall, flags: [...recall.flags, ...(form.demo ? ['demo_color'] : []), ...kind] });
}
// Files dragged onto the shop are handed to Adeng: onto an open commission form, or a new one at the counter.
// Never let a dropped file open in the window itself.
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.types.includes('Files')) document.body.classList.add('drop-ready');
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop-ready'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('drop-ready');
  const paths = window.lamplight.pathsOf(Array.from(e.dataTransfer?.files ?? []));
  if (!paths.length || document.querySelector('.backdrop')) return;
  const form = commissionFormOpen();
  if (form) return void form.add(paths);
  scene.setHint('counter', false);
  void newCommission(paths);
});
scene.onCounterClick = () => {
  scene.setHint('counter', false);
  void newCommission();
};

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
  scene.setYouLook(s.avatar);
  scene.setFurnishing(s.furnish[currentScene()]);
  scene.youName = s.name;
  syncToolbar(s);
}
systemCalm.addEventListener('change', () => current && applySettings(current));

// Adeng greets the user by name; the first visit walks through setup first.
const GREET_MS = 3500;
const greet = (text: string) => {
  scene.say('adeng', text);
  setTimeout(() => scene.say('adeng', null), GREET_MS);
};
/** Welcome back, bringing up the last commission once if there is one to ask about. */
async function greetBack(name: string) {
  const { flags, vars } = await window.lamplight.recallOnOpen();
  const turns = openingTurns(ruleBook().lines.app_open ?? [], flags, outsideFlags(scene.outside()), { ...vars, name });
  if (turns) void stage.talk(turns);
}
async function openShop() {
  const api = window.lamplight;
  // The Store build's first open beside the installer build's shop: brought over or not, before anything is read.
  const move = await api.moveInOffer();
  let moved: boolean | null = null;
  if (move) {
    const yes = await askMoveIn(move);
    const ok = await api.moveIn(yes);
    if (yes) moved = ok;
  }
  // Said instead of the usual welcome back: the shop the user knows has just come over. A failed copy changed nothing.
  if (moved === false) greet(strings.ui.moveIn.failed);
  void refreshShop();
  void noticeBirthday();
  let settings = await api.getSettings();
  applySettings(settings);
  const S = strings.ui.setup;
  if (!settings.onboarded) {
    settings = await showWelcome(api, settings, await api.envStatus());
    // The name and look just picked show in the shop at once.
    applySettings(settings);
    greet(fill(S.greet, { name: settings.name }));
    // First visit: point at the counter until it has been opened once.
    scene.setHint('counter', true);
    setTimeout(() => greet(S.greetHint), 4000);
  } else if (moved) {
    greet(fill(strings.ui.moveIn.moved, { name: settings.name }));
  } else if (settings.name) {
    setTimeout(() => void greetBack(settings.name), 1200);
  }
  // After the welcome, so that nothing on it can be pushed aside; the same two the scene opens.
  mountToolbar(api, applySettings, { order: scene.onCounterClick, shelf: scene.onWorksClick });
  syncToolbar(settings);
  // A commission left unfinished when the app last closed.
  const left = await api.pendingCommission();
  if (left) showPending(api, left, () => void prepare(left).then(() => run(left.want, () => api.resumePending())));
  // Said once, when nothing else is on the table: a card that came up mid-commission would be pushed away unread.
  while (running || document.querySelector('#ui > .card, #ui > form.card, .backdrop')) await wait(ONCE_RETRY_MS);
  const damage = await api.dataDamage();
  // Read again: the limit may have changed while the card waited.
  if (damage.notebook || damage.settings || damage.ledger) showDataTrouble(damage, (await api.getSettings()).budgetUsd);
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
    const ui = {
      showFailure: (kind: string) => showFailure(api, kind, () => {}, { cost: formatUsd(0.5) }),
      showCommissionForm: () => showCommissionForm(api),
      showActorCard, showPlan, renderBoard, showDecision, showLegal: (which: 'privacy' | 'terms' | 'notices') => showLegal(api, which),
      showResult: (r: CommissionResult) => showResult(r, { open: () => {}, revise: () => {}, restore: async () => true, firstWork: true, report: () => {} }),
      showNotReady: (env: EnvStatus) => showNotReady(api, env, () => {}),
      showTrialEnd: () => showTrialEnd(() => {}),
      showDataTrouble,
      showMeeting: () => showMeeting(),
      showRevise: (title?: string) => showRevise(undefined, title),
      showShelf: () => showShelf(api, () => {}),
      showNotebook: () => showNotebook(api),
      showCaptionLog,
      showPending: (form: CommissionForm) => showPending(api, form, () => {}),
      showUpdateLetter: (offer: UpdateOffer) => showUpdateLetter(offer, () => {}),
    };
    // pretendRunning: show what the shop looks like mid-commission (bell out, form away) without running one.
    const pretendRunning = (on: boolean) => { running = on ? 'debug' : null; setWorking(on); scene.setFormWaiting(!on); scene.setBell(on); };
    Object.assign(window, { lamplightDebug: { scene, stage, ui, view, replay: startReplay, pretendRunning, welcome } });
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
  refreshRunning();
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
  scene.showShop();
  tendGarden(false);
  scene.sendGuestAway();
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
  const trialText = locale() === 'en' ? enTrial : zhTrial;
  const events = normalizeAll(trialText.split('\n').filter(Boolean).map((l: string) => JSON.parse(l) as RawAgentEvent));
  setReplayBadge(true);
  replaying = true;
  scene.showShop();
  tendGarden(false);
  scene.sendGuestAway();
  void scene.youArrive();
  scene.setFormWaiting(false);
  // A little slower than recorded, and the end card waits for the wrap-up lines to finish.
  cancelReplay = replay(stage, events, TRIAL_SPEED, () => {
    setReplayBadge(false);
    replaying = false;
    scene.setFormWaiting(true);
    void scene.youLeave();
    // The trial leaves nothing behind: a clean blackboard and no parcel on the counter.
    clearWorkSigns();
    showTrialEnd(async () => showNotReady(window.lamplight, await window.lamplight.envStatus(), undefined, () => void newCommission()));
  }, TRIAL_WRAP_UP_MS);
}
