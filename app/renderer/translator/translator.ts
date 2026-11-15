import { parse } from 'yaml';
import { pattern, strings } from '../../shared/i18n';
import { AGENT_ACTOR } from '../../shared/staff';
import type { ActorId, AiEvent, AiEventKind, Bubble, CharacterCommand } from '../../shared/types';
import { PRIORITY } from './director';
import { type ActorState, StateMachine } from './state-machine';

type Priority = keyof typeof PRIORITY;
type OneOrMany = string | string[];

type CommandSpec = {
  actor: ActorId | '{agent}';
  state: ActorState;
  moveTo?: CharacterCommand['moveTo'];
  anim?: string;
  bubble?: Bubble;
  lines?: string;
  /** Only speak this actor's own lines (for groups that mix speakers). */
  own_lines?: boolean;
  priority: Priority;
};

export type Rule = CommandSpec & {
  on: AiEventKind;
  /** `by`: only when this helper takes the errand instead of the agent's own actor (the apprentice, for Xiaoju). */
  when?: { agent?: OneOrMany; tool?: OneOrMany; risk?: OneOrMany; choice?: OneOrMany; by?: ActorId; failStreak?: { lt?: number; gte?: number } };
  extra?: CommandSpec[];
};

export type AnimTable = Record<'staff' | 'cat', { available: string[]; fallback: Record<string, { anim: string; bubble?: Bubble; prop?: string }> }>;

export const parseRules = (text: string) => parse(text) as Rule[];
export const parseAnimTable = (text: string) => parse(text) as AnimTable;


const REVIEW_PASSED = pattern('reviewPassed');
const REVIEW_FAILED = pattern('reviewFailed');

const has = (v: OneOrMany | undefined, x: string | undefined) =>
  v === undefined || (x !== undefined && (Array.isArray(v) ? v.includes(x) : v === x));

export function matches(rule: Rule, e: AiEvent, by?: ActorId): boolean {
  if (rule.on !== e.kind) return false;
  const w = rule.when;
  if (!w) return true;
  if (!has(w.agent, e.agent) || !has(w.tool, e.tool) || !has(w.risk, e.risk) || !has(w.choice, e.choice) || !has(w.by, by)) return false;
  if (w.failStreak) {
    const n = e.failStreak ?? 0;
    if (w.failStreak.lt !== undefined && !(n < w.failStreak.lt)) return false;
    if (w.failStreak.gte !== undefined && !(n >= w.failStreak.gte)) return false;
  }
  return true;
}

/** Map an animation the art doesn't have yet onto one it does (rules/anim-fallback.yaml). */
export function resolveAnim(table: AnimTable, actor: ActorId, anim: string): { anim: string; bubble?: Bubble; prop?: string } {
  const t = table[actor === 'cat' ? 'cat' : 'staff'];
  if (t.available.includes(anim)) return { anim };
  return t.fallback[anim] ?? { anim: actor === 'cat' ? 'lie' : 'idle' };
}

/** Did the reviewer find problems? Picks between the "looks fine" and "found issues" lines. */
function reviewFlags(summary: string | undefined): string[] {
  if (!summary) return [];
  return REVIEW_PASSED.test(summary) && !REVIEW_FAILED.test(summary) ? ['no_issues'] : ['has_issues'];
}

export type TranslateContext = {
  /** One-line summary of the commission, used in the opening line. */
  brief?: string;
  /** Conditions from memory: has_memory / has_stuck_note. */
  flags?: string[];
  /** Values from memory for lines that use them: lastChoice, stuckNote. */
  vars?: Record<string, string>;
};

/**
 * AiEvent -> character commands. Decides who goes where, does what, and which line group to speak from;
 * the Director decides when it plays and whether a line is actually spoken.
 */
export class Translator {
  readonly states = new StateMachine();
  /**
   * Whether Xiaodou the apprentice has come to the shop (shared/staff.ts). Then Xiaoju's second errand goes to the
   * apprentice instead of waiting; checks still wait for Laoshi, since the apprentice only runs errands.
   */
  apprentice = false;
  /** Who is out on each helper's errands, and for which round, in the order they set off. Each takes one at a time. */
  private hands = new Map<ActorId, { actor: ActorId; run: string }[]>();
  /** Errands waiting for a free pair of hands, per helper: the round each is for, in the order they came. */
  private waiting = new Map<ActorId, string[]>();
  /** What each round under way is about (B5): its brief and what memory brings to it. */
  private ctxs = new Map<string, TranslateContext>();
  /** The rounds under way, in the order they started; events from a replay count as one round with no id. */
  readonly running: string[] = [];
  /** Who came back with the last subagent that finished: the parcel on the counter is theirs. */
  returned: ActorId = 'xiaoju';

  constructor(private rules: Rule[], private anims: AnimTable, private ctx: TranslateContext = {}) {}

  /**
   * A new commission (or a replay): its brief and what memory brings to it. Without a run, it is for the next round to
   * start, which takes it as its own.
   */
  setContext(ctx: TranslateContext, run?: string) {
    if (run === undefined) this.ctx = ctx;
    else this.ctxs.set(run, ctx);
  }

  /**
   * The rounds the main process says are still under way (B5). A round that ended without a last event of its own (a
   * dropped connection, Claude Code gone) is let go here, so the next round alone starts the shop afresh.
   */
  keepRuns(live: string[]) {
    for (const run of [...this.running]) {
      if (run === '' || live.includes(run)) continue;
      this.running.splice(this.running.indexOf(run), 1);
      this.ctxs.delete(run);
    }
  }

  /** Hot reload: swap rules and the animation table without touching current states. */
  reload(rules: Rule[], anims: AnimTable) {
    this.rules = rules;
    this.anims = anims;
  }

  translate(e: AiEvent): CharacterCommand[] {
    const run = e.run ?? '';
    if (e.kind === 'session_start') {
      // Another round already at work keeps its people where they are (B5); only a shop with nothing on starts afresh.
      if (!this.running.some((r) => r !== run)) {
        this.states.reset();
        this.hands.clear();
        this.waiting.clear();
      }
      if (!this.running.includes(run)) this.running.push(run);
      if (!this.ctxs.has(run)) this.ctxs.set(run, this.ctx);
    }
    const out = e.kind === 'subagent_start' || e.kind === 'subagent_stop' ? this.errand(e) : this.apply(e);
    if (e.kind === 'done' || e.kind === 'failed' || e.kind === 'cancelled') {
      const i = this.running.indexOf(run);
      if (i >= 0) this.running.splice(i, 1);
      this.ctxs.delete(run);
    }
    return out;
  }

  private apply(e: AiEvent, by?: ActorId): CharacterCommand[] {
    const rule = this.rules.find((r) => matches(r, e, by));
    if (!rule) return [];
    const out: CharacterCommand[] = [];
    for (const spec of [rule, ...(rule.extra ?? [])]) {
      const cmd = this.build(spec, e);
      if (cmd) out.push(cmd);
    }
    return out;
  }

  /**
   * A helper already busy with one subagent doesn't start a second: the apprentice, once there, takes Xiaoju's;
   * otherwise Adeng says it will wait its turn. Whoever set off first is back first, and sets off on the next.
   */
  private errand(e: AiEvent): CharacterCommand[] {
    const lead = AGENT_ACTOR[e.agent];
    const run = e.run ?? '';
    const hands = this.hands.get(lead) ?? [];
    this.hands.set(lead, hands);
    const waiting = this.waiting.get(lead) ?? [];
    this.waiting.set(lead, waiting);
    if (e.kind === 'subagent_start') {
      const free = [lead, ...(lead === 'xiaoju' && this.apprentice ? ['xiaodou' as const] : [])].find((a) => !hands.some((h) => h.actor === a));
      if (free) {
        hands.push({ actor: free, run });
        return this.apply(e, free);
      }
      waiting.push(run);
      return [{
        actor: 'adeng', state: this.states.get('adeng'), priority: PRIORITY.subagent,
        line: { group: 'sub_queue', vars: { who: strings.actors[lead] }, flags: [`who_${lead}`] },
      }];
    }
    // Whoever went out first for this round comes back. A stop with nobody out (a replay joined part-way) brings back the
    // helper's own actor.
    const mine = hands.findIndex((h) => h.run === run);
    const who = (mine >= 0 ? hands.splice(mine, 1)[0] : hands.shift())?.actor ?? lead;
    this.returned = who;
    const back = this.apply(e, who);
    const next = waiting.shift();
    if (next === undefined) return back;
    hands.push({ actor: who, run: next });
    return [...back, ...this.apply({ ...e, kind: 'subagent_start', target: undefined, run: next }, who)];
  }

  /** Who is out on an agent's errands just now, or the agent's own actor when nobody is. */
  helpersOf(agent: AiEvent['agent']): ActorId[] {
    const lead = AGENT_ACTOR[agent];
    const hands = this.hands.get(lead);
    return hands?.length ? hands.map((h) => h.actor) : [lead];
  }

  private build(spec: CommandSpec, e: AiEvent): CharacterCommand | null {
    const actor = spec.actor === '{agent}' ? AGENT_ACTOR[e.agent] : spec.actor;
    if (actor === 'xiaodou' && !this.apprentice) return null;
    const before = this.states.get(actor);
    if (!this.states.move(actor, spec.state)) return null;
    // Same state and nothing new to do (e.g. a tool succeeded while already working): no command.
    if (before === spec.state && !spec.moveTo && !spec.lines && !spec.bubble && spec.priority === 'chat') return null;

    const cmd: CharacterCommand = { actor, state: spec.state, priority: PRIORITY[spec.priority] };
    if (spec.moveTo) cmd.moveTo = spec.moveTo;
    if (spec.anim) {
      const a = resolveAnim(this.anims, actor, spec.anim);
      cmd.anim = a.anim;
      if (a.anim !== spec.anim) cmd.action = spec.anim;
      if (a.bubble) cmd.bubble = a.bubble;
      if (a.prop) cmd.prop = a.prop;
    }
    if (spec.bubble) cmd.bubble = spec.bubble;
    if (spec.lines) {
      const target = e.target ?? '';
      const ctx = this.ctxs.get(e.run ?? '') ?? this.ctx;
      cmd.line = {
        group: spec.lines,
        // Variable names match the placeholders used in lines/cafe.yaml.
        vars: { ...ctx.vars, target, file: target, topic: target, question: target, choice: target, brief: ctx.brief ?? strings.defaults.brief },
        flags: [...(ctx.flags ?? []), ...(e.kind === 'subagent_stop' ? reviewFlags(e.target) : [])],
      };
      if (spec.own_lines) cmd.line.speaker = actor;
    }
    return cmd;
  }
}
