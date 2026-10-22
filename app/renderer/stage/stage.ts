import { strings } from '../../shared/i18n';
import type { ActorId, AiEvent, CharacterCommand } from '../../shared/types';
import type { CafeScene } from '../game/CafeScene';
import { Director } from '../translator/director';
import { toLineBook } from '../translator/lines';
import { Translator } from '../translator/translator';
import { type ActorInfo, type BoardStep, renderBoard, showParcel } from '../ui/panels';
import { onRuleBookChange, ruleBook } from './rulebook';

/** How long each bubble of a line stays up, and how long a silent action takes. */
const SPEAK_MS = 2200;
const ACTION_MS = 1200;

const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', reviewer: 'laoshi', unknown: 'xiaoju' };

/** Fill `{name}` placeholders in a line. The Director only picks lines whose placeholders can all be filled. */
const fillLine = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');

const emptyInfo = (): ActorInfo => ({ state: 'idle', stats: { writes: 0, runs: 0, fails: 0 }, raw: [] });

/**
 * Glue between events and the scene: AiEvent -> Translator -> Director -> CafeScene.
 * Each command: walk (if needed), then show the line/bubble, then report back so the next queued command plays.
 * Also keeps what the character cards, the blackboard and the parcels show, all from real events.
 */
export class Stage {
  private translator: Translator;
  private director: Director;
  private timers = new Map<ActorId, ReturnType<typeof setTimeout>>();
  private info = new Map<ActorId, ActorInfo>();
  private board: BoardStep[] = [];
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

  actorInfo(actor: ActorId): ActorInfo {
    return this.info.get(actor) ?? emptyInfo();
  }

  handle(e: AiEvent) {
    this.onEvent(e);
    if (e.kind === 'session_start') {
      this.director.resetCommission();
      this.info.clear();
      const B = strings.ui.board;
      this.board = [
        { key: 'research', label: B.research, status: 'todo' },
        { key: 'write', label: B.write, status: 'todo' },
        { key: 'check', label: B.check, status: 'todo' },
      ];
    }
    this.track(e);
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
    if (e.kind === 'tool_start') info.doing = e.plain;
    if (e.kind === 'tool_ok' && (e.tool === 'Write' || e.tool === 'Edit')) info.stats.writes++;
    if (e.kind === 'tool_start' && (e.tool === 'Bash' || e.tool === 'PowerShell')) info.stats.runs++;
    if (e.kind === 'tool_fail') info.stats.fails++;

    const step = (key: string, status: BoardStep['status']) => {
      const s = this.board.find((b) => b.key === key);
      if (s && !(s.status === 'done' && status === 'doing')) s.status = status;
    };
    if (e.kind === 'subagent_start' && e.agent === 'researcher') step('research', 'doing');
    if (e.kind === 'subagent_stop' && e.agent === 'researcher') step('research', 'done');
    if (e.kind === 'tool_start' && e.agent === 'main' && (e.tool === 'Write' || e.tool === 'Edit')) step('write', 'doing');
    if (e.kind === 'subagent_start' && e.agent === 'reviewer') { step('write', 'done'); step('check', 'doing'); }
    if (e.kind === 'subagent_stop' && e.agent === 'reviewer') step('check', 'done');
    if (e.kind === 'done') this.board.forEach((s) => (s.status = 'done'));
    if (this.board.length) renderBoard(this.board);

    if (e.kind === 'subagent_stop' && e.target) showParcel(actor, e.target);
  }

  private async perform(cmd: CharacterCommand) {
    const { actor } = cmd;
    clearTimeout(this.timers.get(actor));
    const info = this.info.get(actor) ?? emptyInfo();
    this.info.set(actor, info);
    info.state = cmd.state;
    if (cmd.moveTo) await this.scene.walkTo(actor, cmd.moveTo);
    this.scene.play(actor, cmd.anim);
    const vars = cmd.line?.vars ?? {};
    const bubbles = vars._text ? vars._text.split('\n').map((b) => fillLine(b, vars)) : [];
    if (bubbles.length) info.lastLine = bubbles.join('');
    if (bubbles.length || cmd.bubble) this.scene.say(actor, bubbles[0] ?? '', cmd.bubble);
    // Show the remaining bubbles one after another.
    for (let i = 1; i < bubbles.length; i++) {
      await this.wait(SPEAK_MS);
      this.scene.say(actor, bubbles[i], cmd.bubble);
    }
    this.timers.set(actor, setTimeout(() => this.done(actor), (bubbles.length ? SPEAK_MS : ACTION_MS) / this.speed));
  }

  private done(actor: ActorId) {
    this.scene.say(actor, null);
    const settled = this.translator.states.settle(actor);
    if (settled) {
      this.scene.play(actor, 'idle');
      this.actorInfo(actor).state = settled;
    }
    const next = this.director.finished(actor);
    if (next) void this.perform(next);
  }

  private wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms / this.speed));
  }
}

/** Replay events on their original timeline, sped up. Returns a cancel function. */
export function replay(stage: Stage, events: AiEvent[], speed = 3, onEnd?: () => void): () => void {
  if (!events.length) return () => {};
  const t0 = events[0].t;
  stage.speed = speed;
  const handles = events.map((e) => setTimeout(() => stage.handle(e), (e.t - t0) / speed));
  const end = setTimeout(() => onEnd?.(), (events.at(-1)!.t - t0) / speed + 3000);
  return () => { handles.forEach(clearTimeout); clearTimeout(end); };
}
