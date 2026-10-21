import type { ActorId, AiEvent, CharacterCommand } from '../../shared/types';
import type { CafeScene } from '../game/CafeScene';
import { Director } from '../translator/director';
import { toLineBook } from '../translator/lines';
import { Translator } from '../translator/translator';
import { onRuleBookChange, ruleBook } from './rulebook';

/** How long a line or bubble stays up, per bubble of text. */
const SPEAK_MS = 2200;
const ACTION_MS = 1200;

/** Fill `{name}` placeholders in a line; unknown ones are dropped rather than shown raw. */
const fillLine = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');

/**
 * Glue between events and the scene: AiEvent -> Translator -> Director -> CafeScene.
 * Each command: walk (if needed), then show the line/bubble, then report back so the next queued command plays.
 */
export class Stage {
  private translator: Translator;
  private director: Director;
  private timers = new Map<ActorId, ReturnType<typeof setTimeout>>();

  constructor(private scene: CafeScene, opts: { brief?: string; speed?: number } = {}) {
    const book = ruleBook();
    this.translator = new Translator(book.rules, book.anims, { brief: opts.brief });
    this.director = new Director(toLineBook(book.lines));
    this.speed = opts.speed ?? 1;
    onRuleBookChange((b) => {
      this.translator.reload(b.rules, b.anims);
      this.director.setLines(toLineBook(b.lines));
    });
  }

  /** Playback speed multiplier (replays run faster). */
  speed: number;

  handle(e: AiEvent) {
    if (e.kind === 'session_start') this.director.resetCommission();
    for (const cmd of this.translator.translate(e)) {
      const now = this.director.submit(cmd);
      if (now) void this.perform(now);
    }
  }

  private async perform(cmd: CharacterCommand) {
    const { actor } = cmd;
    clearTimeout(this.timers.get(actor));
    this.scene.setStatus(actor, cmd.anim ? `${cmd.state} (${cmd.anim})` : cmd.state);
    if (cmd.moveTo) await this.scene.walkTo(actor, cmd.moveTo);
    const text = cmd.line?.vars._text;
    const bubbles = text ? text.split('\n') : [];
    if (bubbles.length || cmd.bubble) this.scene.say(actor, bubbles.length ? fillLine(bubbles[0], cmd.line!.vars) : '', cmd.bubble);
    // Show the remaining bubbles one after another.
    for (let i = 1; i < bubbles.length; i++) {
      await this.wait(SPEAK_MS);
      this.scene.say(actor, fillLine(bubbles[i], cmd.line!.vars), cmd.bubble);
    }
    this.timers.set(actor, setTimeout(() => this.done(actor), (bubbles.length ? SPEAK_MS : ACTION_MS) / this.speed));
  }

  private done(actor: ActorId) {
    this.scene.say(actor, null);
    const settled = this.translator.states.settle(actor);
    if (settled) this.scene.setStatus(actor, settled);
    const next = this.director.finished(actor);
    if (next) void this.perform(next);
  }

  private wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms / this.speed));
  }
}

/** Replay a list of events on their original timeline, sped up. Returns a cancel function. */
export function replay(stage: Stage, events: AiEvent[], speed = 3): () => void {
  if (!events.length) return () => {};
  const t0 = events[0].t;
  stage.speed = speed;
  const handles = events.map((e) => setTimeout(() => stage.handle(e), (e.t - t0) / speed));
  return () => handles.forEach(clearTimeout);
}
