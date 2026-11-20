import type { ActorId, CharacterCommand } from '../../shared/types';

/** Priority: serious > ask > fail > subagent > work > chat. */
export const PRIORITY = { chat: 0, work: 1, subagent: 2, fail: 3, ask: 4, serious: 5 } as const;

export type DirectorOptions = {
  /** Cooldown for lines from the same group. */
  lineCooldownMs?: number;
  /** After unfreezing, low-priority commands queued longer ago than this are dropped. */
  staleMs?: number;
  now?: () => number;
};

type Queued = { cmd: CharacterCommand; at: number };

/** Line book: group -> lines. */
export type LineBook = Record<string, { id: string; text: string; when?: string; speaker?: ActorId; reply?: { speaker: ActorId; text: string } }[]>;

/**
 * Pacing:
 * - each character does one thing at a time; higher priority interrupts, otherwise it queues
 * - within a group's cooldown, only the action plays, no line
 * - a line is never repeated within one commission
 * - asking the user or serious mode freezes everything; afterwards stale low-priority commands are dropped
 */
export class Director {
  private current = new Map<ActorId, CharacterCommand>();
  private queues = new Map<ActorId, Queued[]>();
  private lastLineAt = new Map<string, number>();
  private usedLines = new Set<string>();
  private frozen = false;
  /** The crew at a meeting (B9): their commands wait, while everyone else carries on. */
  private held = new Set<ActorId>();
  private readonly cooldown: number;
  private readonly staleMs: number;
  private readonly now: () => number;

  constructor(private lines: LineBook, opts: DirectorOptions = {}) {
    this.cooldown = opts.lineCooldownMs ?? 30_000;
    this.staleMs = opts.staleMs ?? 5_000;
    this.now = opts.now ?? Date.now;
  }

  /** Swap the line book (hot reload). */
  setLines(lines: LineBook) {
    this.lines = lines;
  }

  /** New commission: forget which lines were used. */
  resetCommission() {
    this.usedLines.clear();
    this.lastLineAt.clear();
  }

  /** Submit a command. Returns the command to play now, or null if it was queued or we're frozen. */
  submit(cmd: CharacterCommand): CharacterCommand | null {
    const at = this.now();
    if (cmd.priority >= PRIORITY.ask) {
      this.frozen = true;
      return this.play(cmd);
    }
    const playing = this.current.get(cmd.actor);
    if (this.frozen || this.held.has(cmd.actor) || (playing && playing.priority >= cmd.priority)) {
      const q = this.queues.get(cmd.actor) ?? [];
      q.push({ cmd, at });
      this.queues.set(cmd.actor, q);
      return null;
    }
    return this.play(cmd);
  }

  /**
   * A character finished its current action; returns the next one, if any. Someone who fell behind skips the moves that
   * newer ones have overtaken, as after a question card: alone in a shop, one person gets every event of a round (D2).
   */
  finished(actor: ActorId): CharacterCommand | null {
    this.current.delete(actor);
    if (this.frozen || this.held.has(actor)) return null;
    const at = this.now();
    const q = (this.queues.get(actor) ?? []).filter((x, i, all) => i === all.length - 1 || at - x.at <= this.staleMs || x.cmd.priority >= PRIORITY.fail);
    const next = q.shift();
    this.queues.set(actor, q);
    return next ? this.play(next.cmd) : null;
  }

  /**
   * The ask / serious card was answered: unfreeze, drop stale low-priority commands,
   * and keep only the latest one per character (jump to the current state, don't replay history).
   */
  unfreeze(): CharacterCommand[] {
    this.frozen = false;
    return this.resume([...this.queues.keys()].filter((actor) => !this.held.has(actor)));
  }

  /** Pick up each of these actors' latest command that is still fresh; drop the rest. */
  private resume(actors: ActorId[]): CharacterCommand[] {
    const at = this.now();
    const out: CharacterCommand[] = [];
    for (const actor of actors) {
      const q = this.queues.get(actor) ?? [];
      const fresh = q.filter((x) => at - x.at <= this.staleMs || x.cmd.priority >= PRIORITY.fail);
      this.queues.set(actor, []);
      const last = fresh.at(-1);
      this.current.delete(actor);
      if (last) {
        const played = this.play(last.cmd);
        if (played) out.push(played);
      }
    }
    for (const actor of [...this.current.keys()]) {
      if ((this.current.get(actor)?.priority ?? 0) >= PRIORITY.ask) this.current.delete(actor);
    }
    return out;
  }

  /** Hold these actors where they are (the crew at a meeting); letGo() picks up from the current state. */
  hold(actors: ActorId[]) {
    this.held = new Set(actors);
  }

  /** The meeting is over: the crew at it picks up its latest fresh command. */
  letGo(): CharacterCommand[] {
    const actors = [...this.held];
    this.held.clear();
    return this.frozen ? [] : this.resume(actors);
  }

  isFrozen() {
    return this.frozen;
  }

  /** Decide whether this command speaks, and pick the line. */
  private play(cmd: CharacterCommand): CharacterCommand {
    this.current.set(cmd.actor, cmd);
    if (!cmd.line) return cmd;
    const at = this.now();
    const last = this.lastLineAt.get(cmd.line.group);
    const urgent = cmd.priority >= PRIORITY.ask;
    if (!urgent && last !== undefined && at - last < this.cooldown) {
      return { ...cmd, line: undefined };
    }
    const { flags = [], speaker, vars } = cmd.line;
    const pick = (this.lines[cmd.line.group] ?? []).find(
      (l) => !this.usedLines.has(l.id) && (!l.when || flags.includes(l.when)) && (!speaker || l.speaker === speaker) && canFill(l.text, vars),
    );
    if (!pick) return { ...cmd, line: undefined };
    this.usedLines.add(pick.id);
    this.lastLineAt.set(cmd.line.group, at);
    const said: Record<string, string> = { _id: pick.id, _text: pick.text };
    if (pick.speaker) said._speaker = pick.speaker;
    if (pick.reply) Object.assign(said, { _reply: pick.reply.text, _replyBy: pick.reply.speaker });
    return { ...cmd, line: { group: cmd.line.group, vars: { ...cmd.line.vars, ...said } } };
  }
}

/** A line is only usable if every `{name}` placeholder in it has a non-empty value. */
function canFill(text: string, vars: Record<string, string>): boolean {
  return [...text.matchAll(/\{(\w+)\}/g)].every(([, k]) => Boolean(vars[k]));
}

/** Collapse bursts of reads/searches into one "browsing" event, and cap at two events per second. */
export function mergeBurst<T extends { t: number; tool?: string; kind: string }>(events: T[], windowMs = 1000): T[] {
  const out: T[] = [];
  const reading = (e: T) => e.kind === 'tool_start' && (e.tool === 'Read' || e.tool === 'Grep' || e.tool === 'Glob');
  for (const e of events) {
    const prev = out.at(-1);
    if (prev && reading(prev) && reading(e) && e.t - prev.t < windowMs) continue;
    const inWindow = out.filter((x) => e.t - x.t < 1000);
    if (inWindow.length >= 2 && !(e.kind === 'ask_user' || e.kind === 'permission' || e.kind === 'done' || e.kind === 'failed')) continue;
    out.push(e);
  }
  return out;
}
