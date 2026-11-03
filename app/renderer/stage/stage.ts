import { plainOf } from '../../main/event-normalizer';
import { strings } from '../../shared/i18n';
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
  private board: BoardStep[] = [];
  /** The board shows Claude's own to-do list: the guessed three steps stop following events. */
  private realPlan = false;
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

  /** Before a commission or replay starts: what it is about, and what memory may bring up. */
  setCommission(ctx: TranslateContext) {
    // Today's weather and holiday colour a few lines too (Xiaoju back from the rain, say).
    this.translator.setContext({ ...ctx, flags: [...(ctx.flags ?? []), ...outsideFlags(this.scene.outside())] });
  }

  /** A meeting: new commands wait instead of moving anyone. */
  holdStill() {
    this.director.freeze();
  }

  /** The meeting is over: play each character's latest command, dropping stale ones. */
  carryOn() {
    for (const cmd of this.director.unfreeze()) void this.perform(cmd);
  }

  /** How far the commission has got, from the blackboard: steps done, steps left, the step under way. */
  progress(): { done: number; left: number; doing?: string } {
    const done = this.board.filter((s) => s.status === 'done').length;
    return { done, left: this.board.length - done, doing: this.board.find((s) => s.status === 'doing')?.label };
  }

  actorInfo(actor: ActorId): ActorInfo {
    return this.info.get(actor) ?? emptyInfo();
  }

  handle(e: AiEvent) {
    this.onEvent(e);
    if (e.kind === 'session_start') {
      this.director.resetCommission();
      this.info.clear();
      const B = strings.ui.board;
      this.realPlan = false;
      this.board = [
        { key: 'research', label: B.research, status: 'todo' },
        { key: 'write', label: B.write, status: 'todo' },
        { key: 'check', label: B.check, status: 'todo' },
      ];
    }
    this.track(e);
    // The connection dropped: the lamps flicker twice while Adeng waits to try again.
    if (e.kind === 'net_retry' && !this.catchingUp) this.scene.flickerLamps();
    // Work done while out on an errand: the street inset shows her going to the shop it belongs to.
    if (e.kind === 'tool_start' && e.agent !== 'main' && !this.catchingUp) this.scene.errand(AGENT_ACTOR[e.agent], e.tool);
    // The user answered: release the freeze before the reactions are queued.
    if (e.kind === 'decision') for (const cmd of this.director.unfreeze()) void this.perform(cmd);
    for (const cmd of this.translator.translate(e)) {
      const now = this.director.submit(cmd);
      if (now) void this.perform(now);
    }
  }

  /** Update card info, blackboard and parcels from an event. */
  private track(e: AiEvent) {
    const actor = AGENT_ACTOR[e.agent];
    const info = this.info.get(actor) ?? emptyInfo();
    this.info.set(actor, info);
    info.raw.push(`${e.kind}${e.tool ? ` ${e.tool}` : ''}${e.target ? ` ${e.target}` : ''}`);
    // The card says what kind of thing is happening; the command itself is in the raw record and detailed mode.
    if (e.kind === 'tool_start') info.doing = e.tool === 'Bash' || e.tool === 'PowerShell' ? plainOf(e.kind, e.tool) : e.plain;
    if (e.kind === 'tool_ok' && (e.tool === 'Write' || e.tool === 'Edit')) info.stats.writes++;
    if (e.kind === 'tool_start' && (e.tool === 'Bash' || e.tool === 'PowerShell')) info.stats.runs++;
    if (e.kind === 'tool_fail') info.stats.fails++;

    if ((e.kind === 'plan' || e.kind === 'progress') && e.agent === 'main' && e.todos?.length) {
      this.board = stepsOf(e.todos);
      this.realPlan = true;
    }
    const step = (key: string, status: BoardStep['status']) => {
      if (this.realPlan) return;
      const s = this.board.find((b) => b.key === key);
      if (s && !(s.status === 'done' && status === 'doing')) s.status = status;
    };
    if (e.kind === 'subagent_start' && e.agent === 'researcher') step('research', 'doing');
    if (e.kind === 'subagent_stop' && e.agent === 'researcher') step('research', 'done');
    // Qingdai's step only appears on the board once she is asked for a design.
    if (e.kind === 'subagent_start' && e.agent === 'designer') {
      if (!this.realPlan && !this.board.some((b) => b.key === 'design')) {
        this.board.splice(this.board.findIndex((b) => b.key === 'write'), 0, { key: 'design', label: strings.ui.board.design, status: 'todo' });
      }
      step('design', 'doing');
    }
    if (e.kind === 'subagent_stop' && e.agent === 'designer') step('design', 'done');
    if (e.kind === 'tool_start' && e.agent === 'main' && (e.tool === 'Write' || e.tool === 'Edit')) step('write', 'doing');
    if (e.kind === 'subagent_start' && e.agent === 'reviewer') { step('write', 'done'); step('check', 'doing'); }
    if (e.kind === 'subagent_stop' && e.agent === 'reviewer') step('check', 'done');
    if (e.kind === 'done') this.board.forEach((s) => (s.status = 'done'));
    if (this.board.length) renderBoard(this.board);

    if (e.kind === 'subagent_stop' && e.target) showParcel(actor, e.target);
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
    if (this.catchingUp) return this.skip(cmd, info);
    const goingOut = cmd.moveTo === 'door' && actor !== 'cat';
    if (cmd.moveTo && !goingOut) await this.scene.walkTo(actor, cmd.moveTo);
    if (replaced()) return;
    this.scene.play(actor, cmd.anim);
    const sound = ACTION_SOUNDS[cmd.action ?? cmd.anim ?? ''];
    if (sound) this.scene.onSound?.(sound);
    const vars = cmd.line?.vars ?? {};
    const split = (text: string | undefined, who: ActorId) => (text ? text.split('\n').map((b) => ({ who, text: fillLine(b, vars) })) : []);
    const turns = [...split(vars._text, (vars._speaker as ActorId) || actor), ...split(vars._reply, vars._replyBy as ActorId)];
    const own = turns.filter((t) => t.who === actor).map((t) => t.text);
    if (own.length) info.lastLine = own.join('');
    if (!turns.length && cmd.bubble) this.show(actor, actor, '', cmd.bubble);
    let last: ActorId | undefined;
    for (const [i, t] of turns.entries()) {
      if (i) await this.wait(SPEAK_MS);
      if (replaced()) return;
      if (last && last !== t.who) this.hide(actor, last);
      this.show(actor, t.who, t.text, t.who === actor ? cmd.bubble : undefined);
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
    this.scene.play(actor, cmd.anim);
    const vars = cmd.line?.vars ?? {};
    const said = (text: string | undefined, who: ActorId) => text?.split('\n').forEach((b) => this.scene.onSay?.(who, fillLine(b, vars)));
    said(vars._text, (vars._speaker as ActorId) || actor);
    said(vars._reply, vars._replyBy as ActorId);
    if (vars._text && ((vars._speaker as ActorId) || actor) === actor) info.lastLine = fillLine(vars._text.replace(/\n/g, ''), vars);
    // A microtask, not a timer: timers in a hidden window are throttled and would let commands pile up.
    void Promise.resolve().then(() => this.done(actor));
  }

  private done(actor: ActorId) {
    for (const [who, owner] of [...this.owner]) if (owner === actor) this.hide(actor, who);
    const settled = this.translator.states.settle(actor);
    if (settled) {
      this.scene.play(actor, 'idle');
      this.actorInfo(actor).state = settled;
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
      await new Promise((r) => setTimeout(r, 2000 + 150 * [...t.text].length));
      this.scene.say(t.speaker, null);
      await new Promise((r) => setTimeout(r, 300));
    }
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
