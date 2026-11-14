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
  when?: { agent?: OneOrMany; tool?: OneOrMany; risk?: OneOrMany; choice?: OneOrMany; failStreak?: { lt?: number; gte?: number } };
  extra?: CommandSpec[];
};

export type AnimTable = Record<'staff' | 'cat', { available: string[]; fallback: Record<string, { anim: string; bubble?: Bubble; prop?: string }> }>;

export const parseRules = (text: string) => parse(text) as Rule[];
export const parseAnimTable = (text: string) => parse(text) as AnimTable;


const REVIEW_PASSED = pattern('reviewPassed');
const REVIEW_FAILED = pattern('reviewFailed');

const has = (v: OneOrMany | undefined, x: string | undefined) =>
  v === undefined || (x !== undefined && (Array.isArray(v) ? v.includes(x) : v === x));

export function matches(rule: Rule, e: AiEvent): boolean {
  if (rule.on !== e.kind) return false;
  const w = rule.when;
  if (!w) return true;
  if (!has(w.agent, e.agent) || !has(w.tool, e.tool) || !has(w.risk, e.risk) || !has(w.choice, e.choice)) return false;
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
  /** Subagents each helper is handling; Xiaoju and Laoshi take one at a time and the rest wait their turn. */
  private errands = new Map<ActorId, number>();

  constructor(private rules: Rule[], private anims: AnimTable, private ctx: TranslateContext = {}) {}

  /** A new commission (or a replay): its brief and what memory brings to it. */
  setContext(ctx: TranslateContext) {
    this.ctx = ctx;
  }

  /** Hot reload: swap rules and the animation table without touching current states. */
  reload(rules: Rule[], anims: AnimTable) {
    this.rules = rules;
    this.anims = anims;
  }

  translate(e: AiEvent): CharacterCommand[] {
    if (e.kind === 'session_start') {
      this.states.reset();
      this.errands.clear();
    }
    if (e.kind === 'subagent_start' || e.kind === 'subagent_stop') return this.errand(e);
    return this.apply(e);
  }

  private apply(e: AiEvent): CharacterCommand[] {
    const rule = this.rules.find((r) => matches(r, e));
    if (!rule) return [];
    const out: CharacterCommand[] = [];
    for (const spec of [rule, ...(rule.extra ?? [])]) {
      const cmd = this.build(spec, e);
      if (cmd) out.push(cmd);
    }
    return out;
  }

  /**
   * A helper already busy with one subagent doesn't start a second: Adeng says it will wait its turn,
   * and when the helper finishes one it sets off on the next.
   */
  private errand(e: AiEvent): CharacterCommand[] {
    const actor = AGENT_ACTOR[e.agent];
    const n = this.errands.get(actor) ?? 0;
    if (e.kind === 'subagent_start') {
      this.errands.set(actor, n + 1);
      if (n === 0) return this.apply(e);
      return [{
        actor: 'adeng', state: this.states.get('adeng'), priority: PRIORITY.subagent,
        line: { group: 'sub_queue', vars: { who: strings.actors[actor] }, flags: [`who_${actor}`] },
      }];
    }
    this.errands.set(actor, Math.max(0, n - 1));
    const back = this.apply(e);
    return n > 1 ? [...back, ...this.apply({ ...e, kind: 'subagent_start', target: undefined })] : back;
  }

  private build(spec: CommandSpec, e: AiEvent): CharacterCommand | null {
    const actor = spec.actor === '{agent}' ? AGENT_ACTOR[e.agent] : spec.actor;
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
      cmd.line = {
        group: spec.lines,
        // Variable names match the placeholders used in lines/cafe.yaml.
        vars: { ...this.ctx.vars, target, file: target, topic: target, question: target, choice: target, brief: this.ctx.brief ?? strings.defaults.brief },
        flags: [...(this.ctx.flags ?? []), ...(e.kind === 'subagent_stop' ? reviewFlags(e.target) : [])],
      };
      if (spec.own_lines) cmd.line.speaker = actor;
    }
    return cmd;
  }
}
