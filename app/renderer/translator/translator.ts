import { parse } from 'yaml';
import { pattern, strings } from '../../shared/i18n';
import { AGENT_ACTOR, ROOM_CREW } from '../../shared/staff';
import { errandTo, type StreetShop } from '../../shared/dispatch';
import type { RoomId } from '../../shared/scenes';
import { isStreetShop } from '../../shared/towngrow';
import type { ActorId, AiEvent, AiEventKind, Bubble, CharacterCommand, Post } from '../../shared/types';
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
  /** The post this brings (C8); Axin comes at most POSTMAN_VISITS times a round. */
  post?: Post;
  /** Out of the door again once done here (road-to-1.4.md D3): Adeng after handing an order over in a shop. */
  leave?: boolean;
};

/** How often Axin comes in a round (road-to-1.3.md C8); after that Adeng goes to the letter holder alone. */
export const POSTMAN_VISITS = 2;

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
  /**
   * Who leads each round (B9): Adeng, unless he already leads another; then Qingdai, from her seat by the blackboard. The
   * helpers are shared by both crews.
   */
  private leads = new Map<string, ActorId>();
  /** The rounds that started beside another and take the second crew's places (B9). */
  private seconds = new Set<string>();
  /** How often Axin has come for each round under way (C8). */
  private visits = new Map<string, number>();
  /** Who came back with the last subagent that finished: the parcel on the counter is theirs. */
  returned: ActorId = 'xiaoju';
  /** Who is in the room on screen (D2). An errand whose usual runner is elsewhere goes to the room's own person. */
  crew: readonly ActorId[] = ROOM_CREW.cafe;
  /** The room this plays in (D3): a tool that belongs to another of the street shops sends someone there. */
  room: RoomId = 'cafe';

  private runner(agent: AiEvent['agent']): ActorId {
    const usual = AGENT_ACTOR[agent];
    return this.crew.includes(usual) ? usual : this.crew[this.crew.length - 1];
  }

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
      this.let(run);
    }
  }

  /**
   * A round is under way here: as it starts, or once it is carried on here from another shop (plan-1.8.md H4). A round's
   * lead stays known after it ends, for its last lines still to be said.
   */
  join(run: string) {
    if (!this.running.includes(run)) {
      const beside = this.running.some((r) => r !== run && !this.seconds.has(r));
      this.running.push(run);
      if (beside) this.seconds.add(run);
      else this.seconds.delete(run);
      // A street shop's own person leads every round there, the second from the second crew's places (D3).
      this.leads.set(run, this.shop ? this.crew[this.crew.length - 1] : beside ? 'qingdai' : 'adeng');
    }
    if (!this.ctxs.has(run)) this.ctxs.set(run, this.ctx);
  }

  /** A round is over: it is no longer under way, and nobody works for it any more. */
  private let(run: string) {
    const i = this.running.indexOf(run);
    if (i >= 0) this.running.splice(i, 1);
    this.ctxs.delete(run);
    this.visits.delete(run);
    for (const hands of this.hands.values()) for (let k = hands.length - 1; k >= 0; k--) if (hands[k].run === run) hands.splice(k, 1);
  }

  /**
   * Who leads a round: at home, Adeng for the first under way (and for replays), Qingdai for a second beside it; in a
   * street shop, its own person (D3).
   */
  leadOf(run = ''): ActorId {
    return this.leads.get(run) ?? (this.shop ? this.crew[this.crew.length - 1] : 'adeng');
  }

  /** Whether a round started beside another, and so its crew takes the second crew's places (B9). */
  second(run = ''): boolean {
    return this.seconds.has(run);
  }

  /** One of the street shops, where nobody from home works (D3). */
  private get shop(): boolean {
    return isStreetShop(this.room);
  }

  /** Who is working for which round just now (B9): each round's lead, and whoever is on one of its errands. */
  crews(): Map<ActorId, string> {
    const out = new Map<ActorId, string>();
    for (const run of this.running) out.set(this.leadOf(run), run);
    for (const hands of this.hands.values()) for (const h of hands) out.set(h.actor, h.run);
    return out;
  }

  /** Working for another round under way: a round's start or end does not send them home. */
  private elsewhere(actor: ActorId, run: string): boolean {
    const r = this.crews().get(actor);
    return r !== undefined && r !== run;
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
      this.join(run);
    }
    const away = e.agent === 'main' && (e.kind === 'tool_start' || e.kind === 'tool_ok' || e.kind === 'tool_fail') ? errandTo(this.room, e.tool) : undefined;
    const out = away ? this.across(e, away) : e.kind === 'subagent_start' || e.kind === 'subagent_stop' ? this.errand(e) : this.apply(e);
    if (e.kind === 'done' || e.kind === 'failed' || e.kind === 'cancelled') this.let(run);
    return out;
  }

  /**
   * The rule's commands, each actor once: in the round Qingdai leads, her own design is not handed to herself. Those the
   * rule brings along (everyone home at the end, say) leave alone whoever works for another round.
   */
  private apply(e: AiEvent, by?: ActorId): CharacterCommand[] {
    const rule = this.rules.find((r) => matches(r, e, by));
    if (!rule) return [];
    const out: CharacterCommand[] = [];
    const seen = new Set<ActorId>();
    for (const [i, spec] of [rule, ...(rule.extra ?? [])].entries()) {
      const actor = this.actorOf(spec, e);
      if (seen.has(actor) || (i > 0 && this.elsewhere(actor, e.run ?? ''))) continue;
      seen.add(actor);
      const cmd = this.build(spec, e, actor, i === 0);
      if (cmd) out.push(cmd);
    }
    return out;
  }

  /** Who plays a rule's part: Adeng's is the round's lead's, except in a street shop, where he only brings the slip (D3). */
  private actorOf(spec: CommandSpec, e: AiEvent): ActorId {
    if (spec.actor === '{agent}') return e.agent === 'main' ? this.leadOf(e.run) : this.runner(e.agent);
    return spec.actor === 'adeng' && !this.shop ? this.leadOf(e.run) : spec.actor;
  }

  /**
   * A helper already busy with one subagent doesn't start a second: the apprentice, once there, takes Xiaoju's;
   * otherwise Adeng says it will wait its turn. Whoever set off first is back first, and sets off on the next.
   */
  private errand(e: AiEvent): CharacterCommand[] {
    const lead = this.runner(e.agent);
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
      // Whoever leads the round says it will wait its turn.
      const boss = this.leadOf(e.run);
      return [{
        actor: boss, state: this.states.get(boss), priority: PRIORITY.subagent, ...(e.run !== undefined ? { run: e.run } : {}),
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

  /**
   * A tool that belongs to another street shop (D3): this room's runner sets off with it while that shop's person does it
   * over there; done, that person walks in with it, hands it over and goes back, and the runner is back at work.
   * Something that went wrong comes back too, with a drop of sweat and no word.
   */
  private across(e: AiEvent, to: StreetShop): CharacterCommand[] {
    const runner = this.runner('researcher');
    const maker = ROOM_CREW[to][ROOM_CREW[to].length - 1];
    const S = strings.ui.town.shops;
    const run = e.run !== undefined ? { run: e.run } : {};
    const said = (group: string, actor: ActorId, shop: RoomId) => ({ group, vars: { shop: S[shop] }, speaker: actor });
    if (e.kind === 'tool_start') {
      this.states.put(runner, 'out');
      return [
        { actor: runner, state: 'out', moveTo: 'door', priority: PRIORITY.subagent, ...run, line: said('cross_out', runner, to) },
        { actor: maker, room: to, state: 'working', moveTo: 'board', anim: 'write', priority: PRIORITY.work, ...run, line: said('cross_take', maker, this.room) },
      ];
    }
    const ok = e.kind === 'tool_ok';
    this.states.put(runner, 'working');
    this.states.put(maker, 'ready');
    return [
      { actor: maker, state: 'ready', moveTo: 'counter', anim: ok ? 'gift' : 'idle', priority: PRIORITY.subagent, leave: true, ...run, ...(ok ? { line: said('cross_back', maker, to) } : { bubble: 'sweat' as const }) },
      { actor: runner, state: 'working', moveTo: 'counter', anim: 'idle', priority: PRIORITY.subagent, ...run },
      { actor: maker, room: to, state: 'ready', moveTo: 'counter', anim: 'idle', priority: PRIORITY.chat, ...run },
    ];
  }

  /** An order for a street shop (D3): Adeng takes the slip out of the home shop's door, saying where it goes. */
  dispatch(run: string, shop: StreetShop): CharacterCommand[] {
    this.states.put('adeng', 'out');
    return [{ actor: 'adeng', state: 'out', moveTo: 'door', priority: PRIORITY.work, run, line: { group: 'dispatch_go', vars: { shop: strings.ui.town.shops[shop] }, speaker: 'adeng' } }];
  }

  /**
   * A round carried on here from another shop (plan-1.8.md H4): it is under way here, and whoever of this shop's people
   * sits idle gets ready for it, its lead at the counter, so the work that follows can start.
   */
  takeUp(run: string): CharacterCommand[] {
    this.join(run);
    const lead = this.leadOf(run);
    for (const actor of this.crew) if (this.states.get(actor) === 'idle') this.states.put(actor, 'ready');
    return [{ actor: lead, state: this.states.get(lead), moveTo: 'counter', priority: PRIORITY.work, run }];
  }

  /** Back from carrying an order over: Adeng is at the home shop's counter again. */
  homeAgain(): CharacterCommand[] {
    this.states.put('adeng', 'ready');
    return [{ actor: 'adeng', state: 'ready', moveTo: 'counter', anim: 'idle', priority: PRIORITY.chat }];
  }

  /** Who is out on an agent's errands just now, or the agent's own actor when nobody is. */
  helpersOf(agent: AiEvent['agent']): ActorId[] {
    const lead = this.runner(agent);
    const hands = this.hands.get(lead);
    return hands?.length ? hands.map((h) => h.actor) : [lead];
  }

  private build(spec: CommandSpec, e: AiEvent, actor: ActorId, own = true): CharacterCommand | null {
    if (actor === 'xiaodou' && !this.apprentice) return null;
    const before = this.states.get(actor);
    if (!this.states.move(actor, spec.state)) return null;
    // Same state and nothing new to do (e.g. a tool succeeded while already working): no command.
    if (before === spec.state && !spec.moveTo && !spec.lines && !spec.bubble && spec.priority === 'chat') return null;

    const cmd: CharacterCommand = { actor, state: spec.state, priority: PRIORITY[spec.priority] };
    if (e.run !== undefined) cmd.run = e.run;
    // The counter is Adeng's place: Qingdai's crew takes and hands over its work at her seat by the blackboard instead. Those
    // a rule only brings along (everyone home at the start or the end) go to their own places.
    if (spec.moveTo) cmd.moveTo = spec.moveTo === 'counter' && own && !this.shop && this.leadOf(e.run) === 'qingdai' ? 'board' : spec.moveTo;
    if (spec.anim) {
      const a = resolveAnim(this.anims, actor, spec.anim);
      cmd.anim = a.anim;
      if (a.anim !== spec.anim) cmd.action = spec.anim;
      if (a.bubble) cmd.bubble = a.bubble;
      if (a.prop) cmd.prop = a.prop;
    }
    if (spec.bubble) cmd.bubble = spec.bubble;
    if (spec.leave) cmd.leave = true;
    if (spec.post) {
      const run = e.run ?? '';
      const came = this.visits.get(run) ?? 0;
      if (spec.post === 'outbox') cmd.post = 'outbox';
      else if (came < POSTMAN_VISITS) {
        cmd.post = spec.post;
        this.visits.set(run, came + 1);
      }
    }
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
