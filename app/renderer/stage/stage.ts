import { plainOf } from '../../main/event-normalizer';
import { fill, strings } from '../../shared/i18n';
import { STAFF } from '../../shared/staff';
import type { ActorId, AiEvent, CharacterCommand } from '../../shared/types';
import type { CafeScene } from '../game/CafeScene';
import { outsideFlags } from '../game/weather';
import { Director } from '../translator/director';
import { toLineBook } from '../translator/lines';
import { type TranslateContext, Translator } from '../translator/translator';
import { type ActorInfo, renderBoard, showParcel } from '../ui/panels';
import { type BoardStep, stepsOf } from '../../shared/board';
import { onRuleBookChange, ruleBook } from './rulebook';

/** How long each bubble of a line stays up, and how long a silent action takes. */
const SPEAK_MS = 2200;
const ACTION_MS = 1200;

const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'xiaoju' };

/** Fill `{name}` placeholders in a line. The Director only picks lines whose placeholders can all be filled. */
const fillLine = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');

/** States that mean someone is no longer working for a round: their flag comes down. */
const OFF_DUTY = ['idle', 'wrapping', 'low'];
/** Standing ready is not working for a round: a helper sent home ready gets no flag, and one back from an errand drops it. */
const READY = 'ready';
/**
 * Longest project name in front of a line, in half-width places: a bubble has little room. Chinese characters take two,
 * so eight of them fit, or sixteen letters.
 */
const TITLE_WIDTH = 16;
/** From the CJK radicals on, characters are full width. */
const FULL_WIDTH = 0x2e80;

const emptyInfo = (): ActorInfo => ({ state: 'idle', stats: { writes: 0, runs: 0, fails: 0 }, raw: [] });

/** Work that makes a sound in the room. */
const ACTION_SOUNDS: Record<string, 'mallet' | 'pencil'> = { hammer: 'mallet', write: 'pencil' };

/**
 * Glue between events and the scene: AiEvent -> Translator -> Director -> CafeScene.
 * Each command: walk (if needed), then show the line/bubble, then report back so the next queued command plays.
 * Also keeps what the character cards, the blackboard and the parcels show, all from real events.
 */
export class Stage {
  private translator: Translator;
  private director: Director;
  private timers = new Map<ActorId, ReturnType<typeof setTimeout>>();
  /** Counts each actor's commands, so an older one still playing knows it has been replaced. */
  private runs = new Map<ActorId, number>();
  /**
   * Whose command each showing bubble belongs to (speaker -> command actor). Adeng can speak in Xiaoju's
   * command, so Adeng's own command finishing must not clear that line.
   */
  private owner = new Map<ActorId, ActorId>();
  private info = new Map<ActorId, ActorInfo>();
  /**
   * Each round's plan (B5). `real`: it is Claude's own to-do list, and the guessed three steps stop following events. The
   * blackboard and the running card show the lead round's: the first under way, until it ends while another goes on.
   */
  private plans = new Map<string, { board: BoardStep[]; real: boolean }>();
  private lead = '';
  private get board(): BoardStep[] { return this.plans.get(this.lead)?.board ?? []; }
  private get realPlan(): boolean { return this.plans.get(this.lead)?.real ?? false; }
  /**
   * The rounds under way (B9), by run, with the project's name and card colour. With two at once, each crew wears a flag
   * in its colour, the blackboard has a column for each, and lines carry the project's name.
   */
  private projects = new Map<string, { title: string; color: string }>();
  /** Which round each actor works for just now: the flag over their head, and the crew whose places they take. */
  private wearing = new Map<ActorId, string>();
  /** The latest thing anyone started doing, for the running card. */
  private latest = '';
  /** The window is hidden or minimized: skip the acting and keep the shop's state current (see skip). */
  catchingUp = false;
  /** Playback speed multiplier (replays run faster). */
  speed = 1;
  /** Called with every event, live or replayed (the detail strip listens here). */
  onEvent: (e: AiEvent) => void = () => {};

  constructor(private scene: CafeScene, opts: { brief?: string } = {}) {
    const book = ruleBook();
    this.translator = new Translator(book.rules, book.anims, { brief: opts.brief });
    this.director = new Director(toLineBook(book.lines));
    onRuleBookChange((b) => {
      this.translator.reload(b.rules, b.anims);
      this.director.setLines(toLineBook(b.lines));
    });
  }

  /** Xiaodou the apprentice is in the shop from the tenth work (shared/staff.ts); `walkIn` the day they come. */
  setApprentice(here: boolean, walkIn: boolean) {
    this.translator.apprentice = here;
    this.scene.setApprentice(here, walkIn);
  }

  /** Before a commission or replay starts: what it is about, and what memory may bring up. */
  setCommission(ctx: TranslateContext) {
    // Today's weather and holiday colour a few lines too (Xiaoju back from the rain, say).
    this.translator.setContext({ ...ctx, flags: [...(ctx.flags ?? []), ...outsideFlags(this.scene.outside())] });
  }

  /** A meeting: new commands for the crew at it wait instead of moving them; everyone else carries on (B9). */
  holdStill(crew: ActorId[]) {
    this.director.hold(crew);
  }

  /** The meeting is over: play each of the crew's latest command, dropping stale ones. */
  carryOn() {
    for (const cmd of this.director.letGo()) void this.perform(cmd);
  }

  /** The rounds under way, from the main process (B9): their projects' names and colours. */
  setRuns(list: { run: string; title: string; color: string }[]) {
    this.projects = new Map(list.map((r) => [r.run, { title: r.title, color: r.color }]));
    for (const [actor, run] of [...this.wearing]) if (!this.projects.has(run)) this.wearing.delete(actor);
    this.redress();
    // With nothing under way the blackboard is the result card's to clear; drawing here would bring back a plan it took off.
    if (list.length) this.drawBoard();
  }

  /** Who leads a round (B9), who works for which just now, and whether two are under way. */
  leadOf(run?: string): ActorId { return this.translator.leadOf(run); }
  crewOf(actor: ActorId): string | undefined { return this.wearing.get(actor) ?? this.translator.crews().get(actor); }
  get together(): boolean { return this.projects.size > 1; }

  /** Flags over the heads of whoever works for a round, while two are under way; and which crew's places each takes. */
  redress() {
    for (const actor of STAFF) {
      const run = this.crewOf(actor);
      const color = this.together && run !== undefined ? this.projects.get(run)?.color ?? null : null;
      this.scene.setCrew(actor, color, run !== undefined && this.leadOf(run) === 'qingdai');
    }
  }

  /** A line with its project's name in front, while two rounds are under way; as it is otherwise. */
  private named(run: string | undefined, text: string): string {
    const p = run !== undefined && this.together ? this.projects.get(run) : undefined;
    if (!p || !text) return text;
    let room = TITLE_WIDTH;
    const kept = [...p.title].filter((c) => (room -= c.codePointAt(0)! >= FULL_WIDTH ? 2 : 1) >= 0);
    const title = kept.length < [...p.title].length ? `${kept.slice(0, -1).join('').trimEnd()}…` : p.title;
    return fill(strings.ui.run.crewSays, { project: title, text });
  }

  /** The blackboard: the lead round's plan; with two under way, a column for each, Adeng's crew on the left (B9). */
  private drawBoard() {
    const both = this.translator.running.filter((r) => this.projects.has(r) && this.plans.has(r));
    if (this.together && both.length > 1) {
      both.sort((a, b) => Number(this.leadOf(a) !== 'adeng') - Number(this.leadOf(b) !== 'adeng'));
      renderBoard(this.board, both.slice(0, 2).map((r) => ({ color: this.projects.get(r)!.color, steps: this.plans.get(r)!.board })));
    } else if (this.board.length) renderBoard(this.board);
  }

  /** How far the commission has got, from the blackboard: steps done, steps left, the step under way. */
  progress(): { done: number; left: number; doing?: string } {
    const done = this.board.filter((s) => s.status === 'done').length;
    return { done, left: this.board.length - done, doing: this.board.find((s) => s.status === 'doing')?.label };
  }

  /** The running card's picture of the work: whether the plan is the staff's own, and what just started. */
  get planIsReal() { return this.realPlan; }
  get latestDoing() { return this.latest; }

  actorInfo(actor: ActorId): ActorInfo {
    return this.info.get(actor) ?? emptyInfo();
  }

  handle(e: AiEvent) {
    this.onEvent(e);
    const run = e.run ?? '';
    if (e.kind === 'session_start') {
      // A round starting while another is at work leaves the shop as it is (B5); only the first starts it afresh.
      const alone = !this.translator.running.some((r) => r !== run);
      if (alone) {
        this.director.resetCommission();
        // The draft left from before has been seen to; the outbox starts empty (C8).
        this.scene.outbox(false);
        this.info.clear();
        this.latest = '';
        this.plans.clear();
      }
      const B = strings.ui.board;
      this.plans.set(run, {
        real: false,
        board: [
          { key: 'research', label: B.research, status: 'todo' },
          { key: 'write', label: B.write, status: 'todo' },
          { key: 'check', label: B.check, status: 'todo' },
        ],
      });
      if (alone || !this.translator.running.includes(this.lead)) this.lead = run;
    }
    this.track(e);
    // The connection dropped: the lamps flicker twice while Adeng waits to try again.
    if (e.kind === 'net_retry' && !this.catchingUp) this.scene.flickerLamps();
    // Work done while out on an errand: the street inset shows her going to the shop it belongs to.
    // With the apprentice out too, it is whichever of them the street shows.
    if (e.kind === 'tool_start' && e.agent !== 'main' && !this.catchingUp) for (const who of this.translator.helpersOf(e.agent)) this.scene.errand(who, e.tool);
    // The user answered: release the freeze before the reactions are queued.
    if (e.kind === 'decision') for (const cmd of this.director.unfreeze()) void this.perform(cmd);
    for (const cmd of this.translator.translate(e)) {
      const now = this.director.submit(cmd);
      if (now) void this.perform(now);
    }
    // A round that ended takes its flags with it.
    if (e.kind === 'done' || e.kind === 'failed' || e.kind === 'cancelled') {
      for (const [actor, r] of [...this.wearing]) if (r === run) this.wearing.delete(actor);
      this.redress();
    }
    // What a helper brought back waits on the counter, from whoever brought it.
    if (e.kind === 'subagent_stop' && e.target) showParcel(this.translator.returned, e.target);
    if (e.kind === 'done' || e.kind === 'failed' || e.kind === 'cancelled') this.ended(run);
  }

  /** The rounds still under way, from the main process: any other has ended, whether or not its last event came. */
  keepRuns(live: string[]) {
    const gone = this.translator.running.filter((run) => run !== '' && !live.includes(run));
    this.translator.keepRuns(live);
    for (const run of gone) this.ended(run);
  }

  /**
   * A round has ended. Its plan stays on the blackboard while nothing else is at work; with another round going on, the
   * blackboard shows that one's plan instead.
   */
  private ended(run: string) {
    const next = this.translator.running[0];
    if (run !== this.lead) this.plans.delete(run);
    else if (next !== undefined) {
      this.plans.delete(run);
      this.lead = next;
      this.drawBoard();
    }
  }

  /** Update card info, blackboard and parcels from an event. */
  private track(e: AiEvent) {
    const actor = AGENT_ACTOR[e.agent];
    const info = this.info.get(actor) ?? emptyInfo();
    this.info.set(actor, info);
    info.raw.push(`${e.kind}${e.tool ? ` ${e.tool}` : ''}${e.target ? ` ${e.target}` : ''}`);
    // The card says what kind of thing is happening; the command itself is in the raw record and detailed mode.
    if (e.kind === 'tool_start') this.latest = info.doing = e.tool === 'Bash' || e.tool === 'PowerShell' ? plainOf(e.kind, e.tool) : e.plain;
    if (e.kind === 'tool_ok' && (e.tool === 'Write' || e.tool === 'Edit')) info.stats.writes++;
    if (e.kind === 'tool_start' && (e.tool === 'Bash' || e.tool === 'PowerShell')) info.stats.runs++;
    if (e.kind === 'tool_fail') info.stats.fails++;

    // Each round keeps its own plan (B5); the blackboard shows the lead round's.
    const plan = this.plans.get(e.run ?? '');
    if (!plan) return;
    if ((e.kind === 'plan' || e.kind === 'progress') && e.agent === 'main' && e.todos?.length) {
      plan.board = stepsOf(e.todos);
      plan.real = true;
    }
    const step = (key: string, status: BoardStep['status']) => {
      if (plan.real) return;
      const s = plan.board.find((b) => b.key === key);
      if (s && !(s.status === 'done' && status === 'doing')) s.status = status;
    };
    if (e.kind === 'subagent_start' && e.agent === 'researcher') step('research', 'doing');
    if (e.kind === 'subagent_stop' && e.agent === 'researcher') step('research', 'done');
    // Qingdai's step only appears on the board once she is asked for a design.
    if (e.kind === 'subagent_start' && e.agent === 'designer') {
      if (!plan.real && !plan.board.some((b) => b.key === 'design')) {
        plan.board.splice(plan.board.findIndex((b) => b.key === 'write'), 0, { key: 'design', label: strings.ui.board.design, status: 'todo' });
      }
      step('design', 'doing');
    }
    if (e.kind === 'subagent_stop' && e.agent === 'designer') step('design', 'done');
    if (e.kind === 'tool_start' && e.agent === 'main' && (e.tool === 'Write' || e.tool === 'Edit')) step('write', 'doing');
    if (e.kind === 'subagent_start' && e.agent === 'reviewer') { step('write', 'done'); step('check', 'doing'); }
    if (e.kind === 'subagent_stop' && e.agent === 'reviewer') step('check', 'done');
    if (e.kind === 'done') plan.board.forEach((s) => (s.status = 'done'));
    if (plan.board.length && ((e.run ?? '') === this.lead || this.together)) this.drawBoard();

  }

  /**
   * Play one command. A line may be spoken by someone other than the command's actor (Adeng sends
   * Xiaoju out) and may have a reply; each turn shows above its own speaker. Someone heading out of the
   * door finishes the exchange first, then leaves; everyone else walks first, then talks.
   */
  private async perform(cmd: CharacterCommand) {
    const { actor } = cmd;
    // A newer command for this actor (a higher priority one, or what follows an answered card) takes over:
    // this one stops before its next walk or bubble, so a question isn't still being asked after the answer.
    const run = (this.runs.get(actor) ?? 0) + 1;
    this.runs.set(actor, run);
    const replaced = () => this.runs.get(actor) !== run;
    clearTimeout(this.timers.get(actor));
    const info = this.info.get(actor) ?? emptyInfo();
    this.info.set(actor, info);
    info.state = cmd.state;
    // Working for a round (B9): its flag goes up, and its crew's places are theirs; done, or sent home, it comes down.
    if (cmd.run !== undefined && actor !== 'cat') {
      const leading = this.translator.crews().get(actor) !== undefined;
      if (OFF_DUTY.includes(cmd.state) || (cmd.state === READY && !leading)) this.wearing.delete(actor);
      else if (cmd.state !== READY) this.wearing.set(actor, cmd.run);
      this.redress();
    }
    if (this.catchingUp) return this.skip(cmd, info);
    // The post (C8): Axin sets off while the lead walks to the letter holder.
    if (cmd.post === 'deliver' || cmd.post === 'collect') void this.scene.post(cmd.post);
    const goingOut = cmd.moveTo === 'door' && actor !== 'cat';
    if (cmd.moveTo && !goingOut) await this.scene.walkTo(actor, cmd.moveTo);
    if (cmd.post === 'outbox') this.scene.outbox(true);
    if (replaced()) return;
    this.scene.play(actor, cmd.anim, cmd.prop);
    // Handing something over: the round's lead turns to whoever brings it.
    const lead = this.leadOf(cmd.run);
    if (cmd.anim === 'gift' && actor !== lead) this.scene.lookAt(lead, actor);
    const sound = ACTION_SOUNDS[cmd.action ?? cmd.anim ?? ''];
    if (sound) this.scene.onSound?.(sound);
    const vars = cmd.line?.vars ?? {};
    const split = (text: string | undefined, who: ActorId) => (text ? text.split('\n').map((b) => ({ who, text: fillLine(b, vars) })) : []);
    const [speaker, replyBy] = this.voices(cmd);
    const turns = [...split(vars._text, speaker), ...(replyBy ? split(vars._reply, replyBy) : [])];
    const own = turns.filter((t) => t.who === actor).map((t) => t.text);
    if (own.length) info.lastLine = own.join('');
    if (!turns.length && cmd.bubble) this.show(actor, actor, '', cmd.bubble);
    let last: ActorId | undefined;
    for (const [i, t] of turns.entries()) {
      if (i) await this.wait(SPEAK_MS);
      if (replaced()) return;
      if (last && last !== t.who) this.hide(actor, last);
      this.show(actor, t.who, this.named(cmd.run, t.text), t.who === actor ? cmd.bubble : undefined);
      for (const other of turns) if (other.who !== t.who) this.scene.lookAt(other.who, t.who);
      last = t.who;
    }
    if (goingOut) {
      if (turns.length) await this.wait(SPEAK_MS);
      if (replaced()) return;
      if (last) this.hide(actor, last);
      await this.scene.walkTo(actor, 'door');
    }
    if (replaced()) return;
    this.timers.set(actor, setTimeout(() => this.done(actor), (turns.length && !goingOut ? SPEAK_MS : ACTION_MS) / this.speed));
  }

  /**
   * While the window is out of sight, nothing is acted out: characters are put where the command sends
   * them and the lines go straight to the caption log, so coming back shows the shop as it is now.
   */
  private skip(cmd: CharacterCommand, info: ActorInfo) {
    const { actor } = cmd;
    for (const [who, owner] of [...this.owner]) if (owner === actor) this.hide(actor, who);
    if (cmd.moveTo) this.scene.place(actor, cmd.moveTo);
    if (cmd.post === 'outbox') this.scene.outbox(true);
    this.scene.play(actor, cmd.anim);
    const vars = cmd.line?.vars ?? {};
    const said = (text: string | undefined, who: ActorId) => text?.split('\n').forEach((b) => this.scene.onSay?.(who, this.named(cmd.run, fillLine(b, vars))));
    const [speaker, replyBy] = this.voices(cmd);
    said(vars._text, speaker);
    if (replyBy) said(vars._reply, replyBy);
    if (vars._text && speaker === actor) info.lastLine = fillLine(vars._text.replace(/\n/g, ''), vars);
    // A microtask, not a timer: timers in a hidden window are throttled and would let commands pile up.
    void Promise.resolve().then(() => this.done(actor));
  }

  /**
   * Who says a command's line and who answers. Adeng's lines in a round Qingdai leads are hers (B9); an answer she would
   * give herself is left out.
   */
  private voices(cmd: CharacterCommand): [ActorId, ActorId | undefined] {
    const vars = cmd.line?.vars ?? {};
    const lead = this.leadOf(cmd.run);
    const as = (who: ActorId) => (who === 'adeng' ? lead : who);
    const speaker = as((vars._speaker as ActorId) || cmd.actor);
    const replyBy = vars._replyBy ? as(vars._replyBy as ActorId) : undefined;
    return [speaker, replyBy === speaker ? undefined : replyBy];
  }

  private done(actor: ActorId) {
    for (const [who, owner] of [...this.owner]) if (owner === actor) this.hide(actor, who);
    const settled = this.translator.states.settle(actor);
    if (settled) {
      this.scene.play(actor, 'idle');
      this.actorInfo(actor).state = settled;
      // Back from an errand and handed it over: no longer at work for that round, unless leading it.
      if (settled === 'ready' && this.translator.crews().get(actor) === undefined && this.wearing.delete(actor)) this.redress();
    }
    const next = this.director.finished(actor);
    if (next) void this.perform(next);
  }

  /**
   * Play small talk turn by turn, each bubble up for 2 s plus 0.15 s per character (design 4.4).
   * Nobody is interrupted: if a speaker is already talking or out, the chat is skipped or cut short.
   */
  async talk(turns: { speaker: ActorId; text: string }[]): Promise<void> {
    if (turns.some((t) => this.scene.busyTalking(t.speaker))) return;
    for (const t of turns) {
      if (this.scene.busyTalking(t.speaker)) return;
      this.scene.say(t.speaker, t.text);
      // Whoever is listening turns to whoever is talking.
      for (const other of turns) if (other.speaker !== t.speaker) this.scene.lookAt(other.speaker, t.speaker);
      await new Promise((r) => setTimeout(r, 2000 + 150 * [...t.text].length));
      this.scene.say(t.speaker, null);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  /** Someone clicked something: the answer comes now, over whatever was being said. */
  async answer(speaker: ActorId, text: string): Promise<void> {
    this.scene.say(speaker, text);
    await new Promise((r) => setTimeout(r, 2000 + 150 * [...text].length));
    if (this.scene.isSaying(speaker, text)) this.scene.say(speaker, null);
  }

  private show(owner: ActorId, who: ActorId, text: string, bubble?: CharacterCommand['bubble']) {
    this.owner.set(who, owner);
    this.scene.say(who, text, bubble);
  }

  /** Clear a bubble, unless someone else's command has taken that speaker over since. */
  private hide(owner: ActorId, who: ActorId) {
    if (this.owner.get(who) !== owner) return;
    this.owner.delete(who);
    this.scene.say(who, null);
  }

  private wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms / this.speed));
  }
}

/** Replay events on their original timeline, sped up. Returns a cancel function. */
export function replay(stage: Stage, events: AiEvent[], speed = 3, onEnd?: () => void, tailMs = 3000): () => void {
  if (!events.length) return () => {};
  const t0 = events[0].t;
  stage.speed = speed;
  const handles = events.map((e) => setTimeout(() => stage.handle(e), (e.t - t0) / speed));
  const end = setTimeout(() => onEnd?.(), (events.at(-1)!.t - t0) / speed + tailMs);
  return () => { handles.forEach(clearTimeout); clearTimeout(end); };
}
