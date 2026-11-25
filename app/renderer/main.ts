import { homeScene, isScene, type RoomId } from '../shared/scenes';
import Phaser from 'phaser';
import replayText from '../../demo/subagents.jsonl?raw';
import zhTrial from '../../demo/trial.zh-CN.jsonl?raw';
import enTrial from '../../demo/trial.en.jsonl?raw';
import { normalizeAll } from '../main/event-normalizer';
import { fill, locale, shorten, strings } from '../shared/i18n';
import type { ActorId, AnchorId, CharacterCommand, CommissionForm, CommissionResult, EnvStatus, LamplightApi, PendingRound, RawAgentEvent, RunInfo, RunResult, Settings, GuestId, UpdateOffer } from '../shared/types';
import { setMix, setPeriod, sfx } from './audio/sound';
import { CafeScene } from './game/CafeScene';
import { StreetScene } from './game/StreetScene';
import { GardenPlanner, GardenTalk, gardenOpen, outdoorsFor } from './game/garden';
import { outsideFlags } from './game/weather';
import { hourOf } from './game/crowd';
import { VisitPlanner, pickVisit, welcomeGuests } from './game/guests';
import { ACTORS, ANCHORS, BOARD_SLATE, CANVAS, ZONES, integerScale, toolIconPx, uiScale } from './game/layout';
import { Chatter, type ShopMood } from './stage/chatter';
import { progressDue } from './stage/progress';
import { onRuleBookChange, ruleBook } from './stage/rulebook';
import { openingTurns, pickLine } from './translator/lines';
import { Stage, replay } from './stage/stage';
import { recordLine, setCaptionBar, showCaptionLog } from './ui/captions';
import { askerOf, dismissDecision, showDecision } from './ui/decision';
import { showMeeting } from './ui/meeting';
import { updateHotspots } from './ui/hotspots';
import { formatUsd } from '../shared/money';
import { answerFirst, boardSteps, budgetLine, clearWorkSigns, commissionFormOpen, renderBoard, setReplayBadge, showPlan, showActorCard, showCommissionForm, showResult, showResultPreview } from './ui/panels';
import { ACTIVE_FPS, applyFps, framesPerSecond, type Loop } from './game/pacer';
import { closeRunning, hasFailureCard, onCapGo, refreshRunning, showFailure, showInterrupted, showPending, showRunning } from './ui/run';
import { type ObjectId, objectReaction } from './game/objects';
import { showLegal, showNotReady, showSettings, showTrialEnd, showWelcome } from './ui/setup';
import { onNotebookForget, showDataTrouble, onNotebookRevise, showMonthCapNews, showNotebook } from './ui/notebook';
import { showGrant } from './ui/connections';
import { showShelf } from './ui/shelf';
import { onProjectMeet, renderPins, showProjects, showTimeline } from './ui/projects';
import { projectColor } from '../shared/project-colors';
import { birthdayToday } from '../shared/days';
import { localDay } from '../shared/localday';
import { ROOM_CREW, STAFF, apprenticeHere, apprenticeNews } from '../shared/staff';
import { type GrowthId, type Made, bedNews, madeOf, shortWork } from '../shared/growth';
import { showRevise } from './ui/revise';
import { showUpdateLetter } from './ui/letter';
import { askMoveIn } from './ui/move-in';
import { type BubbleBox, placeBubbles } from './ui/bubble-layout';
import { emoteEl } from './ui/emotes';
import { mountToolbar, noteEvent, setCalling, setOutsideButton, setWorking, syncToolbar, view } from './ui/toolbar';
import { el, layer } from './ui/dom';
import { MOVERS, OPEN, entering, followsOrder, roomFor } from './game/town';
import type { StreetShop } from '../shared/dispatch';
import { TOWN_MOVE } from '../shared/town';
import { isStreetShop, roomGrown, townCounts, townNews, type TownCounts } from '../shared/towngrow';
import { leftBehind, nextChapter, waiting, type Stories, type Teller } from '../shared/stories';
import { showStory } from './ui/story';

declare global {
  interface Window { lamplight: LamplightApi }
}

document.title = strings.app.title;
document.documentElement.lang = locale();

/**
 * The home shop's room is always there; another room gone into from the street is built in place beside it, and
 * `scene` and `stage` are whichever room is on screen (road-to-1.4.md D2). The garden, the neighbours, what the shop
 * gathered and the works shelf stay the home shop's.
 */
const home = new CafeScene(homeScene());
let scene: CafeScene = home;
/** What the page hangs on a room (clicks, sounds, lines said): set on the home shop below, copied to a room gone into. */
const ROOM_HOOKS = ['onGuestIn', 'onView', 'onBellClick', 'onActorClick', 'onSound', 'onSay', 'onStreet', 'onObjectClick', 'onYouClick',
  'boardInUse', 'onBoardClick', 'onWorksClick', 'onCounterClick', 'onWallCard'] as const satisfies readonly (keyof CafeScene)[];
const street = new StreetScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS.width,
  height: CANVAS.height,
  pixelArt: true,
  backgroundColor: '#1b1712',
  scene: [home, street],
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
      // The crews' flags (B9) stay in sight too.
      const flags = scene.flagBoxes().map((f) => ({ left: rect.left + f.left * s, right: rect.left + f.right * s, top: rect.top + f.top * s, bottom: rect.top + f.bottom * s }));
      for (const [key, place] of placeBubbles(bubbles, cards, [chalk], window.innerWidth, flags)) {
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
    // The project cards pinned on the same slate, while nothing is chalked on it.
    const pins = document.getElementById('board-pins');
    if (pins) {
      const b = BOARD_SLATE;
      Object.assign(pins.style, { left: `${rect.left + b.x * s}px`, top: `${rect.top + b.y * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px`, fontSize: `${s}px` });
      pins.hidden = scene.boardInUse();
    }
  }
  requestAnimationFrame(drawLabels);
}
requestAnimationFrame(drawLabels);

const homeStage = new Stage(home);
let stage = homeStage;
stage.onEvent = noteEvent;
stage.onElsewhere = (cmd) => elsewhere(cmd);

/**
 * Every room at work stays (road-to-1.4.md D3): the home shop always, another while a round is played in it or it does an
 * errand for one, or while it is on screen. Each has its own scene and Stage; the one on screen is `scene` and `stage`.
 */
type Room = { scene: CafeScene; stage: Stage };
const rooms = new Map<RoomId, Room>([[home.room, { scene: home, stage: homeStage }]]);
const building = new Map<RoomId, Promise<Room>>();
/** Where each round under way is played: its shop, or the home shop's room. */
const runRoom = new Map<string, RoomId>();
const roomOfRun = (run?: string): RoomId => (run !== undefined && runRoom.get(run)) || home.room;
/** The rounds a room does an errand for (D3): it stays while any of them is under way. */
const helping = new Map<RoomId, Set<string>>();

/** A room, built the first time it is needed and kept out of sight until it is gone into; it takes the home shop's hooks. */
function roomOf(room: RoomId): Promise<Room> {
  const have = rooms.get(room);
  if (have) return Promise.resolve(have);
  const making = building.get(room) ?? (async () => {
    const next = new CafeScene(room);
    for (const hook of ROOM_HOOKS) Object.assign(next, { [hook]: home[hook] });
    game.scene.add(room, next, true);
    next.sys.setVisible(false);
    await next.ready;
    next.setOutside(true);
    showTownIn(room, next);
    if (current) next.setReducedMotion(current.reducedMotion || systemCalm.matches);
    const built = { scene: next, stage: new Stage(next) };
    built.stage.onEvent = noteEvent;
    built.stage.onElsewhere = (cmd) => elsewhere(cmd);
    built.stage.onScreen = false;
    built.stage.catchingUp = document.hidden;
    if (pendingContext) built.stage.setCommission(pendingContext);
    rooms.set(room, built);
    building.delete(room);
    return built;
  })();
  building.set(room, making);
  return making;
}

/** Another shop's part in an errand (D3): played in that shop, which stays while the round it helps is under way. */
function elsewhere(cmd: CharacterCommand) {
  const room = cmd.room!;
  if (cmd.run !== undefined) helping.set(room, new Set([...(helping.get(room) ?? []), cmd.run]));
  void roomOf(room).then((r) => r.stage.take([{ ...cmd, room: undefined }]));
}

/** Take down the rooms with nothing left to do: never the home shop, nor the one on screen. */
function tidyRooms() {
  const under = new Set(live().map((r) => r.run));
  for (const [room, r] of rooms) {
    if (room === home.room || r.scene === scene) continue;
    const help = [...(helping.get(room) ?? [])].filter((run) => under.has(run));
    helping.set(room, new Set(help));
    if (help.length || [...under].some((run) => roomOfRun(run) === room)) continue;
    r.stage.dispose();
    game.scene.remove(room);
    rooms.delete(room);
  }
}

/** The stage of the round the running card is about: the first under way. */
const leadStage = () => rooms.get(roomOfRun(live()[0]?.run))?.stage ?? stage;

// Small talk when the shop is quiet: never while working, while a card waits for the user, or when hidden.
let replaying = false;
const chatter = new Chatter(ruleBook(home.room).chats, ruleBook(home.room).lines.idle_mutter ?? [], Date.now());
onRuleBookChange(() => chatter.reload(ruleBook(home.room).chats, ruleBook(home.room).lines.idle_mutter ?? []));
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
  if (atHome()) tendGarden(!busy);
  bringLetter(!busy && !blocked && scene.view === 'shop');
  if (atHome()) dropIn(!busy && !blocked && scene.view === 'shop');
  if (running && !blocked) sayProgress();
}, 5000);

// The back garden: when the shop is quiet someone wanders out now and then; work calls everyone back in,
// and so do rain and nightfall.
const gardenPlanner = new GardenPlanner(Date.now());
/** The garden, the neighbours dropping in, what the shop gathered and the works shelf are the home shop's (D2). */
const atHome = () => scene === home;
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
  const chat = pickVisit(ruleBook(home.room).chats, guest, scene.outside(), scene.period, present, heardVisits, shopDays);
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
  const say = gardenTalk.next(now, ruleBook(home.room).lines.garden ?? [], scene.gardenVisitors(), scene.outside().sky);
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
  // Said in the room of the first round under way, by whoever leads there: Adeng at home, a shop's own person (D3).
  const at = rooms.get(roomOfRun(live()[0]?.run)) ?? { scene, stage };
  const voice: ActorId = isScene(at.scene.room) ? 'adeng' : ROOM_CREW[at.scene.room][ROOM_CREW[at.scene.room].length - 1];
  if (!progressDue(runStartedAt, progressSaidAt, now) || at.scene.busyTalking(voice)) return;
  const lines = ruleBook(at.scene.room).lines.progress ?? [];
  const k = progressCount % Math.max(1, lines.length);
  const { done, left, doing } = at.stage.progress();
  const vars: Record<string, string> = { minutes: String(Math.round((now - runStartedAt) / 60_000)), done: String(done), left: String(left) };
  if (doing) vars.doing = doing;
  // Take the lines in turn; one that can't be filled (nothing under way) passes to the next.
  const picked = pickLine([...lines.slice(k), ...lines.slice(0, k)], [], vars);
  const turns = picked?.map((t) => ({ ...t, speaker: t.speaker === 'adeng' ? voice : t.speaker })).filter((t) => t.speaker === voice);
  if (!turns?.length) return;
  progressSaidAt = now;
  progressCount++;
  void at.stage.talk(turns);
}

// A meeting about one round: the bell on the counter calls one about the first under way, at the big table; a project's
// card on the board calls one about that project's round, at the blackboard (road-to-1.2.md B9). Its crew comes over:
// everyone in the shop but whoever works for another round, who carry on. What the user says goes to that round, and
// the crew at the meeting does not move for the work while it lasts. One meeting at a time.
let meetingOpen = false;
let meetingCount = 0;
/** A line said at the meeting, by those at it; Adeng's lines are said by the crew's lead. */
function sayFrom(group: string, k = 0, crew: ActorId[] = STAFF, lead: ActorId = 'adeng') {
  const lines = ruleBook(scene.room).lines[group] ?? [];
  const turns = pickLine([...lines.slice(k % Math.max(1, lines.length)), ...lines.slice(0, k % Math.max(1, lines.length))], [], {});
  const voiced = (turns ?? []).map((t) => ({ ...t, speaker: t.speaker === 'adeng' ? lead : t.speaker }));
  const present = voiced.filter((t, i) => crew.includes(t.speaker) && scene.anchorOf(t.speaker) !== null && voiced.findIndex((x) => x.speaker === t.speaker) === i);
  return present.length ? stage.talk(present) : Promise.resolve();
}
async function meeting(run = live()[0]?.run, place: AnchorId = 'table') {
  const about = live().find((r) => r.run === run);
  if (!about || meetingOpen) return;
  scene.setHint('bell', false);
  meetingOpen = true;
  sfx('ding');
  const lead = stage.leadOf(about.run);
  const here = STAFF.filter((a) => scene.anchorOf(a) !== null && (stage.crewOf(a) ?? about.run) === about.run);
  stage.holdStill(here);
  const before = new Map(here.map((a) => [a, scene.anchorOf(a)!]));
  // Qingdai's crew meets on her side of the blackboard: whoever joins it takes the second crew's places for the meeting.
  if (lead === 'qingdai') for (const a of here) if (stage.crewOf(a) === undefined) scene.setCrew(a, null, true);
  void sayFrom('meeting_call', meetingCount, here, lead);
  // The card opens straight away; the crew gathers meanwhile.
  const gathered = Promise.all(here.map((a) => scene.walkTo(a, place)));
  const note = await showMeeting(current?.avatar, stage.together || place === 'board' ? about.project.title : undefined, lead);
  await gathered;
  const heard = note ? await window.lamplight.addNote(note, about.run) : false;
  if (note) void sayFrom(heard ? 'meeting_heard' : 'meeting_late', meetingCount, here, lead);
  meetingCount++;
  stage.carryOn();
  stage.redress();
  // Whoever no command has sent elsewhere goes back to where they were.
  for (const [a, spot] of before) if (scene.anchorOf(a) === place && spot !== place) void scene.walkTo(a, spot);
  meetingOpen = false;
}
scene.onBellClick = () => void meeting();
onProjectMeet((row) => {
  const r = live().find((x) => x.project.id === row.id || x.run === row.id);
  if (r) void meeting(r.run, 'board');
});

// Frame pacing: 30 a second while anything is going on, 15 once the shop has been quiet for a while; 20 and 10 to save power.
let lastInput = Date.now();
for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel']) window.addEventListener(type, () => { lastInput = Date.now(); }, { passive: true, capture: true });
const pace = () => {
  const fps = framesPerSecond({ busy: running !== null, sinceInputMs: Date.now() - lastInput, saving: current?.powerSaving });
  if (game.loop.fpsLimit !== fps) applyFps(game.loop as unknown as Loop, fps);
};
setInterval(pace, 5000);

// Out of sight (minimized, or hidden to the tray) the stage skips the acting; back in view, it is up to date.
const syncVisibility = () => { for (const r of rooms.values()) r.stage.catchingUp = document.hidden; };
document.addEventListener('visibilitychange', syncVisibility);
scene.onActorClick = (actor) => showActorCard(actor, stage.actorInfo(actor), view.detailed);
scene.onSound = sfx;
// Lines from a replay (the trial) are marked in the caption log, so they never pass for real work.
scene.onSay = (who, text) => recordLine(who, replaying ? text + strings.ui.replayTag : text);
scene.onStreet = (open) => document.body.classList.toggle('street-open', open);

// Decisions from the main process: show the dialog or serious card, send the answer back.
// One at a time, in the order they came, so two cards never sit on top of each other.
let decisions = Promise.resolve();
/** Requests a paired phone answered first (E4); one still in the queue is never shown. */
const answeredOnPhone = new Set<string>();
window.lamplight.onDecisionSettled(({ id }) => {
  answeredOnPhone.add(id);
  dismissDecision(id);
});
window.lamplight.onDecision((req) => {
  // A question from a shop out of sight (D3): its front lights up on the toolbar until it is answered or gone into.
  const from = roomOfRun(req.run);
  if (from !== scene.room) setCalling(from);
  decisions = decisions.then(async () => {
    // In a street shop its own person asks (D3).
    const asker = isScene(from) ? undefined : ROOM_CREW[from][ROOM_CREW[from].length - 1];
    const choice = answeredOnPhone.has(req.id) ? '' : await showDecision(req, live().length > 1, asker);
    setCalling(null, from);
    if (answeredOnPhone.delete(req.id)) return recordLine(askerOf(req, asker), `${req.title} ${strings.ui.lan.answeredOnPhone}`);
    await window.lamplight.answerDecision({ id: req.id, choice });
  }).catch((e) => append(`decision failed: ${e}`));
});
// What the shop has gathered with the user, and the works shelf; refreshed whenever a commission comes back.
let shopDays: { done: number; told: Set<string>; made: Made; lastWork?: string; town: TownCounts } = { done: 0, told: new Set(), made: {}, town: townCounts({ done: 0 }, homeScene()) };
/** What the town has grown (road-to-1.4.md D5): the street and its inset in every room, and a shop's own pieces inside it. */
function showTownIn(room: RoomId, at: CafeScene) {
  at.setTown(shopDays.town);
  if (isStreetShop(room)) at.growth.setGrown(roomGrown(room, shopDays.town.shops[room]).map((id) => `${room}-${id}`));
}
/** How many works were on the shelf before this result came back (the shelf only shows from the first). */
let worksKept = 0;
/** `justFinished`: a work has just come back, so the apprentice it brings walks in rather than simply being there. */
async function refreshShop(fresh: GrowthId[] = [], justFinished = false) {
  const state = await window.lamplight.shopState();
  // The scene builds its props on its first frame; wait for it when the shop has only just opened.
  while (!home.growth) await new Promise((r) => setTimeout(r, 100));
  home.growth.setGrown(state.grown.map((g) => g.id), fresh);
  home.growth.setWorks(state.works.map((w) => w.icon));
  home.garden.setWorksDone(state.done);
  homeStage.setApprentice(apprenticeHere(state.done), justFinished && apprenticeNews(shopDays.done, state.done));
  shopDays = { done: state.done, told: new Set(state.told), made: madeOf(state.works), lastWork: state.works[0] && shortWork(state.works[0].title), town: townCounts(state, homeScene()) };
  street.setTown(shopDays.town);
  tellAbout(state);
  showTownIn(home.room, home);
  for (const [room, built] of rooms) showTownIn(room, built.scene);
  worksKept = state.works.length;
  const projects = await window.lamplight.projectBoard();
  projectsKept = projects.length;
  renderPins(projects);
}
/**
 * The neighbours' stories (road-to-1.4.md D4): who has a chapter waiting, by the shop's clock, stands out on the street
 * with a bubble; what the chapters told have left stands there too. Nothing else says a chapter is waiting.
 */
let tales: { stories: Stories; done: number; today: string } = { stories: {}, done: 0, today: '' };
function tellAbout(state: { done: number; today: string; town?: { stories: Stories } }) {
  tales = { stories: state.town?.stories ?? {}, done: state.done, today: state.today };
  street.setStories(waiting(tales.stories, tales.done, tales.today), leftBehind(tales.stories));
}
/** A waiting neighbour was clicked: the chapter on a card, written down as told once the card is closed. */
function hearStory(who: Teller) {
  const chapter = nextChapter(who, tales.stories, tales.done, tales.today);
  if (chapter === null) return;
  showStory(who, chapter, () => void window.lamplight.tellStory(who).then(async () => tellAbout(await window.lamplight.shopState())));
}
/** How many projects there are: with any, the blackboard doubles as the project board when nothing is chalked on it. */
let projectsKept = 0;
/** Something new in the shop: someone says a word about it. */
function noticeGrowth(ids: GrowthId[]) {
  const id = ids.at(-1);
  if (id) sayOnce(`grow_${id}`, GROWTH_LINE_DELAY_MS);
}
const GROWTH_LINE_DELAY_MS = 4000;
/** After anything new in the home shop has had its word: what grew in the town (D5). */
const TOWN_LINE_DELAY_MS = 7000;
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
function sayOnce(line: string, delay: number, said?: () => void, vars: Record<string, string> = {}) {
  const due = Date.now() + delay;
  const asked = forgotten;
  onceLines = onceLines.then(async () => {
    await wait(due - Date.now());
    while (asked === forgotten) {
      const turns = pickLine(ruleBook(home.room).lines.grow ?? [], [line], vars) ?? [];
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
scene.onObjectClick = (id) => (id === 'board' && projectsKept ? void showProjects(window.lamplight) : clickObject(id));
scene.onYouClick = () => void stage.answer('adeng', strings.ui.objects.you);
// The post office's cork board (plan-1.6.md F2): a kept postcard opens its visit again; the bare board, Pip says it is bare.
scene.onWallCard = (i) => (i === null ? void stage.answer('axin', strings.ui.visit.wallEmpty) : void window.lamplight.openKeptPostcard(i));
scene.boardInUse = () => running !== null || boardSteps().length > 0;
scene.onBoardClick = () => {
  scene.setHint('board', false);
  if (running) openProgress();
  else showPlan(boardSteps());
};
scene.onWorksClick = () => void showShelf(window.lamplight, (id, title) => void revise(id, title), (project) => void showTimeline(window.lamplight, project));
onNotebookForget(() => {
  forgotten++;
  void refreshShop();
});
window.lamplight.onResult((result) => {
  const before = shopDays.done;
  const town = shopDays.town;
  void refreshShop(result.grew ?? [], true).then(() => {
    for (const news of townNews(town, shopDays.town)) {
      sayOnce(news.line, TOWN_LINE_DELAY_MS, undefined, news.shop ? { shop: strings.ui.town.shops[news.shop] } : {});
    }
    noticeBeds(bedNews(before, shopDays.done));
    // Adeng introduces the apprentice once they are through the door.
    if (apprenticeNews(before, shopDays.done)) sayOnce('grow_apprentice', APPRENTICE_LINE_DELAY_MS);
  });
  noticeGrowth(result.grew ?? []);
});
// A commission that stopped has its own card, which says what to do; putting a result card away first would end it.
window.lamplight.onResult((result) => {
  if (result.run) results.set(result.run, result);
  if (!hasFailureCard(result.error)) resultCard(result);
});
// A round's thumbnail (C1) comes after its result: kept with the result, so a card that waited or comes back has it too.
window.lamplight.onResultPreview(({ run, png }) => {
  const result = results.get(run);
  if (result) result.preview = png;
  showResultPreview(run, png);
});
/** The latest results by round, and the rounds whose card has been up: a notice clicked later brings its card back (B6). */
const results = new Map<string, CommissionResult>();
const resultShown = new Set<string>();
function resultCard(result: CommissionResult) {
  void whenFree().then(() => {
    if (result.run) resultShown.add(result.run);
    showResult(result, {
      open: (path, how) => window.lamplight.openOutput(path, how),
      openSource: (n) => void window.lamplight.openSource(result.run ?? '', n),
      revise: (id) => void revise(id),
      restore: (id) => window.lamplight.restorePrevious(id),
      undo: (id) => window.lamplight.undoWork(id),
      firstWork: worksKept === 0,
      report: () => void window.lamplight.writeToUs({ about: 'content', title: result.project?.title ?? lastWant ?? undefined }),
    });
  });
}
// A notice about a finished round was clicked: its card is up, still to come after the one being read, or put away already.
window.lamplight.onOpenResult((run) => {
  const result = results.get(run);
  if (result && resultShown.has(run) && !document.querySelector(`.result-card[data-run="${run}"]`)) resultCard(result);
});
// A scheduled round ended (B6): its sound and, if it stopped, its card, as for one the user started.
window.lamplight.onScheduled((r) => void run(r.title, async () => r));
/**
 * With two rounds at once (B5) one may end while the user is filling in the next slip, or reading the other's result: its
 * card waits until that is put away, rather than wiping it.
 */
async function whenFree() {
  while (document.querySelector('#ui form.commission, #ui form.revise, #ui .result-card, #ui .consult')) await wait(ONCE_RETRY_MS);
}

// The counter holds the commission form; while a commission runs it shows what is being made instead.
let running: string | null = null;
/** The rounds under way and in the queue, as the main process last said (road-to-1.2.md B5). */
let runList: RunInfo[] = [];
const live = () => runList.filter((r) => r.state !== 'queued');
window.lamplight.onRuns((list) => {
  const was = live().length > 0;
  const fresh = list.filter((r) => r.state === 'queued' && !runList.some((x) => x.run === r.run));
  const before = new Set(live().map((r) => r.run));
  runList = list;
  const now = live();
  for (const r of now) runRoom.set(r.run, roomFor(r.shop, homeScene()));
  // Each room hears only of its own rounds (D3).
  for (const [room, r] of rooms) {
    const mine = now.filter((x) => roomOfRun(x.run) === room);
    r.stage.keepRuns(mine.map((x) => x.run));
    r.stage.setRuns(mine.map((x) => ({ run: x.run, title: x.project.title, color: projectColor(x.color) })));
  }
  for (const r of now) if (!before.has(r.run)) started(r.run, r.shop);
  for (const run of [...runRoom.keys()]) if (!now.some((r) => r.run === run)) runRoom.delete(run);
  tidyRooms();
  running = now[0]?.project.title ?? null;
  if (!was && now.length) void workBegins(now[0].project.title);
  if (was && !now.length) workEnds();
  // A round that has to wait is said so once, with why.
  for (const r of fresh) greet(fill(r.waits === 'money' ? strings.ui.run.queuedMoney : strings.ui.run.queued, { title: r.project.title }));
  refreshRunning();
});
/** When the user last placed an order, and when they last went into a room or out on the street themselves (D3). */
let placedAt: number | undefined;
let movedAt = 0;
/** How long Adeng takes to reach the home shop's door with the slip, and to come back from the shop. */
const SLIP_TO_DOOR_MS = 2500;
const SLIP_BACK_MS = 12_000;
/** Into a room: from the street, from the calling button, or following an order (set in openShop). */
let showRoom: (room: RoomId, byUser: boolean) => Promise<void> = async () => {};
/**
 * A round starts (D3). In a street shop: the shop is made ready, and Adeng takes the slip out of the home shop's door and
 * is back a little later. The view goes along to the round's room if the user placed it and has stayed put since.
 */
function started(run: string, shop: RunInfo['shop']) {
  const room = roomOfRun(run);
  const away = shop !== undefined && shop !== 'home';
  if (away) {
    void roomOf(room);
    homeStage.dispatch(run, shop as StreetShop);
    setTimeout(() => homeStage.homeAgain(), SLIP_BACK_MS);
  }
  if (followsOrder({ placedAt, movedAt }) && scene.room !== room) setTimeout(() => void showRoom(room, false), away && scene === home ? SLIP_TO_DOOR_MS : 0);
  placedAt = undefined;
}
/** The first round starts: you come in with the slip and wait by the lamp while it is made. */
async function workBegins(want: string) {
  setWorking(true);
  scene.showShop();
  tendGarden(false);
  scene.sendGuestAway();
  void scene.youArrive();
  runStartedAt = Date.now();
  progressSaidAt = undefined;
  scene.setFormWaiting(false);
  scene.setBell(true);
  // The very first commission: show what the bell and the blackboard are for, once they are there to be seen.
  if (worksKept === 0) {
    scene.setHint('bell', true);
    scene.setHint('board', true);
    setTimeout(() => { if (running === want) greet(strings.ui.run.firstHint); }, FIRST_HINT_MS);
  }
  runBudget = (await window.lamplight.getSettings()).budgetUsd;
}
/** The last round under way has ended. */
function workEnds() {
  closeRunning();
  setWorking(false);
  scene.setHint('bell', false);
  scene.setHint('board', false);
  runMaterials = [];
  scene.setFormWaiting(true);
  scene.setBell(false);
  void scene.youLeave();
}
/** How long into the first commission Adeng says what the bell and the blackboard are for. */
const FIRST_HINT_MS = 5000;
/** What the last commission (or round of changes) was, for a report about what came back. */
let lastWant: string | null = null;
/**
 * One round, from asking for it to its card. The shop's look while work is under way follows the main process's list of
 * rounds (onRuns above), since a round may wait in the queue first and two may run at once (B5).
 */
async function run(want: string, start: () => Promise<RunResult | null>) {
  lastWant = want;
  const r = await start();
  if (!r) return;
  sfx(r.ok ? 'success' : 'fail');
  append(r.ok ? `done. folder: ${r.workDir}` : `failed: ${r.error ?? 'see recording'}\nrecording: ${r.recordingPath}`);
  if (r.ok) return;
  // No card to put away (called off, no key, no Claude Code): with nothing else going on, the plan goes now.
  // A cap's card offers to carry on only work that was under way; the vars say where the cap stands.
  const again = r.cap && !r.carryOn ? null : () => void run(want, () => window.lamplight.retryCommission(r.run));
  const cap: Record<string, string> = r.cap ? { spent: formatUsd(r.cap.spentUsd), cap: formatUsd(r.cap.capUsd), left: formatUsd(r.cap.leftUsd), project: r.cap.project ?? '', person: r.cap.person ?? '' } : {};
  if (hasFailureCard(r.error)) await whenFree();
  if (!showFailure(window.lamplight, r.error ?? '', again, { cost: formatUsd(r.spentThisRun ?? r.costUsd ?? 0), ...cap }, r.cap ? undefined : r.workDir, (r.budget ?? []).map(budgetLine)) && !live().some((x) => x.run !== r.run)) clearWorkSigns();
}
/** The one card for work under way. */
function openProgress() {
  showRunning(window.lamplight, () => ({
    run: live()[0]?.run ?? '',
    others: runList.slice(1).map((r) => ({ title: r.project.title, queued: r.state === 'queued' })),
    want: running ?? '',
    startedAt: runStartedAt,
    budgetUsd: runBudget,
    steps: boardSteps(),
    realPlan: leadStage().planIsReal,
    now: leadStage().latestDoing,
    staff: STAFF.filter((actor) => actor !== 'xiaodou' || apprenticeHere(shopDays.done)).map((actor) => ({ actor, state: leadStage().actorInfo(actor).state, doing: leadStage().actorInfo(actor).doing ?? '' })),
  }), { meet: () => void meeting(), actor: (actor) => showActorCard(actor, leadStage().actorInfo(actor), view.detailed), another: () => void newCommission([], true) });
}

/** The user chose to go ahead with an old Claude Code; not asked again until the app restarts. */
let oldClaudeOk = false;
/** What the shop needs before a commission: Claude Code, a key, and (unless waved through) a recent enough Claude Code. */
const notReady = (env: EnvStatus) => !env.hasClaude || !env.hasApiKey || (env.claudeCompat === 'old' && !oldClaudeOk);

/** `another`: asked for from the running card, so a second commission is taken while the first is under way (B5). */
async function newCommission(dropped: string[] = [], another = false) {
  if (answerFirst()) return;
  if (running && !another) {
    if (dropped.length) return greet(strings.ui.materials.busy);
    return openProgress();
  }
  // Check what the shop needs before the form is filled in, not after.
  const env = await window.lamplight.envStatus();
  if (notReady(env)) return showNotReady(window.lamplight, env, startTrial, () => void newCommission(dropped), () => { oldClaudeOk = true; void newCommission(dropped); });
  const handed = dropped.length ? await window.lamplight.handOver(dropped, []) : undefined;
  const settings = await window.lamplight.getSettings();
  const form = await showCommissionForm(window.lamplight, settings.budgetUsd, handed, await window.lamplight.monthBudget(), settings.modelTier);
  if (!form) return;
  append(`commission: ${form.want}${form.demo ? ' (demo)' : ''}`);
  placedAt = Date.now();
  await prepare(form);
  runMaterials = (form.materials ?? []).map((m) => m.split(/[\\/]/).pop()!);
  await run(form.want, () => window.lamplight.startCommission(form));
}

/**
 * "Change it a bit": what to change, in the user's words, then another round in the same folder.
 * `title` is shown when the commission was picked from the notebook rather than the card just handed over.
 */
async function revise(id: string, title?: string) {
  // Another round may be under way: this one runs beside it, or waits in the queue behind its own project's (B5).
  const env = await window.lamplight.envStatus();
  if (notReady(env)) return showNotReady(window.lamplight, env, startTrial, () => void revise(id, title), () => { oldClaudeOk = true; void revise(id, title); });
  const ask = await showRevise(current?.avatar, title);
  if (!ask) return;
  append(`revise ${id}: ${ask}`);
  placedAt = Date.now();
  const { flags, vars } = await window.lamplight.recallForRevision(id);
  nextContext({ brief: shorten(ask), flags, vars });
  await run(ask, () => window.lamplight.reviseCommission({ id, ask }));
}
onNotebookRevise((id, title) => void revise(id, title));
// A cap's card leads to where the cap is changed.
onCapGo({ settings: () => void showSettings(window.lamplight, applySettings, 'work'), notebook: () => void showNotebook(window.lamplight) });

/** Tell the stage what the commission is about and what Adeng remembers that bears on it. */
async function prepare(form: CommissionForm) {
  const brief = form.demo ? strings.demo.brief : shorten(form.want);
  const recall = await window.lamplight.recallForCommission(form);
  // The demo's one question is the colour question, which has its own line.
  const kind = [...(form.template ? [`tpl_${form.template}`] : []), ...(form.materials?.length ? ['handed'] : [])];
  nextContext({ brief, ...recall, flags: [...recall.flags, ...(form.demo ? ['demo_color'] : []), ...kind] });
}
/**
 * What the next round to start is about goes to every room (D3): the round takes it in whichever shop it is played. A
 * room built later for it starts from the same.
 */
let pendingContext: Parameters<Stage['setCommission']>[0] | undefined;
function nextContext(ctx: Parameters<Stage['setCommission']>[0]) {
  pendingContext = ctx;
  for (const r of rooms.values()) r.stage.setCommission(ctx);
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
  // Saving power takes effect at once, not at the pacer's next look.
  pace();
  scene.setYouLook(s.avatar);
  // Furnishing is the home shop's; the shops along the street are as they are drawn.
  const room = scene.room;
  if (isScene(room)) scene.setFurnishing(s.furnish[room]);
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
  const turns = openingTurns(ruleBook(scene.room).lines.app_open ?? [], flags, outsideFlags(scene.outside()), { ...vars, name });
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
  const shopShown = refreshShop();
  void noticeBirthday();
  let settings = await api.getSettings();
  applySettings(settings);
  // A shop from before 1.4 moves onto the street once (road-to-1.4.md D7); the welcome back waits for it.
  const days = await api.shopState();
  const moving = settings.onboarded && Boolean(days.town) && !days.told.includes(TOWN_MOVE);
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
  } else if (settings.name && !moving) {
    setTimeout(() => void greetBack(settings.name), 1200);
  }
  // After the welcome, so that nothing on it can be pushed aside; the same two the scene opens.
  // The town's street (road-to-1.4.md D1): out of the door and back in on the same page; the work inside goes on.
  let outside = false;
  const goOut = (out: boolean, byUser = true) => {
    if (out === outside) return;
    if (byUser) movedAt = Date.now();
    outside = out;
    scene.setOutside(out);
    // The street button keeps focus otherwise, and the arrow keys and Enter would go to it.
    if (out) (document.activeElement as HTMLElement | null)?.blur();
    // A new day may have brought a chapter since the shop last looked (D4).
    if (out) void window.lamplight.shopState().then(tellAbout);
    if (out) game.scene.run('street', { at: scene.room });
    else game.scene.sleep('street');
    document.body.classList.toggle('outside', out);
    setOutsideButton(out);
  };
  const streetNote = el('div.street-note.paper', { role: 'status', hidden: true });
  layer().append(streetNote);
  let noteTimer = 0;
  street.tint = () => scene.tint;
  street.walker = () => scene.streetWalker();
  street.outside = () => scene.outside();
  street.calm = () => scene.reducedMotion;
  street.hour = () => hourOf(scene.period, new Date().getHours());
  street.onActor = (id) => scene.onActorClick(id);
  street.onNeighbour = hearStory;
  street.onFront = (id, open) => {
    const go = entering(id, { here: scene.room });
    if (go === 'back') return goOut(false);
    if (go === 'visit') return void enterRoom(id as RoomId, true);
    say(strings.ui.town.notes[id]);
  };
  /**
   * Into another room, on the same page (D2): built the first time, it becomes `scene` and `stage`. The room left behind
   * waits out of sight and goes on working (D3); one with nothing left to do is taken down, unless it is the home shop.
   * `byUser`: gone into by the user, from the street or the calling button, rather than following an order.
   */
  const enterRoom = async (room: RoomId, byUser: boolean) => {
    if (byUser) movedAt = Date.now();
    const next = await roomOf(room);
    setCalling(null, room);
    if (next.scene !== scene) {
      const left = rooms.get(scene.room);
      left?.scene.setOutside(true);
      if (left) left.stage.onScreen = false;
      scene = next.scene;
      stage = next.stage;
      stage.onScreen = true;
      if (current) applySettings(current);
    }
    if (outside) goOut(false, byUser);
    else scene.setOutside(false);
    tidyRooms();
    // The postcards opened since last time are on the board by the time anyone looks.
    if (room === 'post') void window.lamplight.keptPostcards().then((cards) => next.scene.setPostcards(cards));
  };
  showRoom = enterRoom;
  const say = (text: string) => {
    streetNote.textContent = text;
    streetNote.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => { streetNote.hidden = true; }, 3000);
  };
  /**
   * The move onto the street: out of the door, the four carry the shop in, back inside, and what it had gathered settles
   * into place. A click or a key cuts it short, and everything is in place at once; with calm motion nothing walks. Shown once.
   */
  const moveToTown = async (grown: GrowthId[], calm: boolean) => {
    let cut = false;
    if (!calm) {
      scene.growth.setGrown([]);
      goOut(true);
      streetNote.textContent = strings.ui.town.moving;
      streetNote.hidden = false;
      const skip = (e: Event) => {
        if (e instanceof KeyboardEvent && !['Escape', 'Enter', ' '].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        street.endParade();
      };
      window.addEventListener('pointerdown', skip, true);
      window.addEventListener('keydown', skip, true);
      cut = await street.parade(MOVERS, home.room);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      streetNote.hidden = true;
      goOut(false);
    }
    // Cut short, they are simply there.
    scene.growth.setGrown(grown, calm || cut ? [] : grown);
    shopDays.told.add(TOWN_MOVE);
    await api.markTold(TOWN_MOVE);
  };
  window.addEventListener('keydown', (e) => {
    if (!outside || (e.target as HTMLElement).closest?.('input, textarea, select, button, [role=dialog]')) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => street.pan(-1),
      ArrowRight: () => street.pan(1),
      Enter: () => { const id = street.facing(); street.onFront(id, OPEN.has(id)); },
      Escape: () => goOut(false),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  });
  mountToolbar(api, applySettings, { order: scene.onCounterClick, projects: () => void showProjects(api), shelf: scene.onWorksClick, street: () => goOut(!outside), calling: (room) => void enterRoom(room, true) });
  syncToolbar(settings);
  if (moving) {
    await shopShown;
    await moveToTown(days.grown.map((g) => g.id), settings.reducedMotion || systemCalm.matches);
    greet(fill(strings.ui.town.moved, { name: settings.name }));
  }
  // Rounds left unfinished when the app last closed. Those a shutdown interrupted come on one card (B7); otherwise the
  // earliest is offered, the rest next time.
  const left = await api.pendingRounds();
  const carry = (l: PendingRound) => void prepare(l.form).then(() => run(l.form.want, () => api.resumePending(l.run)));
  const oneByOne = (list: PendingRound[]) => { if (list[0]) showPending(api, list[0], () => carry(list[0]), () => oneByOne(list.slice(1))); };
  const cut = left.filter((l) => l.state === 'interrupted');
  if (cut.length) {
    showInterrupted(cut, {
      all: () => cut.forEach(carry),
      each: () => oneByOne(cut),
      none: () => cut.forEach((l) => void api.dropPending(l.run)),
    });
  } else if (left[0]) oneByOne(left.slice(0, 1));
  // Said once, when nothing else is on the table: a card that came up mid-commission would be pushed away unread.
  while (running || document.querySelector('#ui > .card, #ui > form.card, .backdrop')) await wait(ONCE_RETRY_MS);
  const damage = await api.dataDamage();
  // Read again: the limit may have changed while the card waited.
  if (damage.notebook || damage.settings || damage.ledger) showDataTrouble(damage, (await api.getSettings()).budgetUsd);
  while (document.querySelector('#ui > .card')) await wait(ONCE_RETRY_MS);
  const raised = await api.monthCapNews();
  if (raised) showMonthCapNews(raised);
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
      showMonthCapNews,
      showMeeting: () => showMeeting(),
      showRevise: (title?: string) => showRevise(undefined, title),
      showShelf: () => showShelf(api, () => {}, () => {}),
      showProjects: () => showProjects(api),
      showTimeline: (id: string) => showTimeline(api, id),
      showNotebook: (at?: 'connections') => showNotebook(api, at),
      showGrant,
      showCaptionLog,
      showPending: (form: CommissionForm) => showPending(api, { run: 'r0', form }, () => {}),
      showInterrupted: (titles: string[]) => showInterrupted(titles.map((title, i) => ({ run: `r${i}`, state: 'interrupted', form: { want: title }, title })), { all: () => {}, each: () => {}, none: () => {} }),
      showUpdateLetter: (offer: UpdateOffer) => showUpdateLetter(offer, () => {}),
    };
    // pretendRunning: show what the shop looks like mid-commission (bell out, form away) without running one.
    const pretendRunning = (on: boolean) => { running = on ? 'debug' : null; setWorking(on); scene.setFormWaiting(!on); scene.setBell(on); };
    // `rooms`: every room at work just now (D3), by room, with its scene and stage.
    Object.assign(window, { lamplightDebug: { get scene() { return scene; }, street, get stage() { return stage; }, rooms, ui, view, replay: startReplay, pretendRunning, welcome } });
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
  // Played in the room of its round (D3); a room still being built takes its events once it is drawn, in order.
  const play = (r: Room) => {
    r.stage.speed = 1;
    r.stage.handle(e);
    refreshRunning();
  };
  const room = roomOfRun(e.run);
  const ready = rooms.get(room);
  if (ready && !building.has(room)) play(ready);
  else void roomOf(room).then(play);
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
