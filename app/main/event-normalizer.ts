import { fill, pattern, strings } from '../shared/i18n';
import type { AiEvent, AiEventKind, Choice, RawAgentEvent, Risk } from '../shared/types';

/**
 * SDK messages / hook calls -> AiEvent. Verified against a real recording (demo/subagents.jsonl).
 *
 * Call push() for every RawAgentEvent; it returns zero or more AiEvents.
 * Call tick(now) periodically to get time-based events ("thinking" fallback, long waits).
 */

type Agent = AiEvent['agent'];
type Obj = Record<string, unknown>;

const SUBAGENT_TYPES: Agent[] = ['researcher', 'reviewer'];
/** A plan step: a line starting with a number or a bullet (ASCII or CJK punctuation). */
const STEP_LINE = /^\s*(?:\d+[.\u3001)\uff09]|[-*\u2022])\s+\S/;
const PLAN_WORDS = pattern('planWords');
const NET_ERROR = /ECONN|ETIMEDOUT|ENOTFOUND|network|fetch failed|socket hang up|overloaded|529|503/i;
const E = strings.events;

export type NormalizerOptions = {
  /** Idle time with no tool running before we infer "thinking" (fallback; thinking_tokens is preferred). */
  thinkingGapMs?: number;
  /** How long a shell command runs before it counts as a long wait. */
  longWaitMs?: number;
  /** Window for merging consecutive thinking_tokens messages into one event. */
  thinkingMergeMs?: number;
};

type Running = { tool: string; agent: Agent; target?: string; startedAt: number; longWaitSent: boolean };

const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function asAgent(type: unknown): Agent {
  if (type === undefined || type === null) return 'main';
  return SUBAGENT_TYPES.includes(type as Agent) ? (type as Agent) : 'unknown';
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function clip(s: string, n = 24): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}...` : one;
}

/** A human-readable target from tool input: file name, query, host, first words of a command. Never a full path. */
export function targetOf(tool: string, input: unknown): string | undefined {
  const i = obj(input);
  const file = str(i.file_path) ?? str(i.notebook_path) ?? str(i.path);
  switch (tool) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
      return file ? baseName(file) : undefined;
    case 'Glob': case 'Grep':
      return str(i.pattern) ? clip(str(i.pattern)!) : undefined;
    case 'WebSearch':
      return str(i.query) ? clip(str(i.query)!) : undefined;
    case 'WebFetch': {
      const url = str(i.url);
      if (!url) return undefined;
      try { return new URL(url).hostname; } catch { return clip(url); }
    }
    case 'Bash': case 'PowerShell': {
      const cmd = str(i.command);
      return cmd ? clip(cmd.trim().split(/\s+/).slice(0, 2).join(' '), 20) : undefined;
    }
    case 'Agent': case 'Task':
      return str(i.description) ? clip(str(i.description)!) : undefined;
    default:
      return undefined;
  }
}

function toolVerb(tool?: string): string {
  const verbs = strings.verbs as Record<string, string>;
  if (!tool) return verbs.none;
  return verbs[tool] ?? fill(verbs.unknown, { tool });
}

/** Plain-language description for character cards. */
export function plainOf(kind: AiEventKind, tool?: string, target?: string): string {
  const verb = toolVerb(tool);
  const withTarget = (plain: string, targeted: string) => (target ? fill(targeted, { verb, target }) : fill(plain, { verb }));
  switch (kind) {
    case 'subagent_start': return withTarget(E.subagent_start, E.subagent_start_target);
    case 'permission': return withTarget(E.permission, E.permission_target);
    case 'tool_fail': return withTarget(E.tool_fail, E.tool_fail_target);
    case 'tool_ok':
    case 'tool_start':
      return tool === 'WebSearch' ? withTarget(E.searching, E.searching_target) : withTarget(E.tool, E.tool_target);
    default:
      return E[kind];
  }
}

type EmitFn = (kind: AiEventKind, agent: Agent, extra?: Partial<AiEvent>) => void;

export class EventNormalizer {
  private seq = 0;
  private lastAt = 0;
  private lastThinkingAt = -Infinity;
  private thinkingInferred = false;
  private running = new Map<string, Running>();
  /** Agent tool_use_id -> subagent type / description / final summary. */
  private agentCalls = new Map<string, { type: Agent; description?: string; summary?: string; stopped: boolean }>();
  /** agent_id from SubagentStart -> subagent type (permission callbacks only carry agent_id). */
  private agentIds = new Map<string, Agent>();
  private failStreak = new Map<Agent, number>();
  /** tool_use_ids already counted as failures, so a hook and a tool_result don't double-count. */
  private failedIds = new Set<string>();
  private finished = false;
  /** A question or permission card is open: the agent is waiting on the user, not working or thinking. */
  private waitingForUser = false;
  /** The main agent has started working (used a tool or sent someone out). */
  private workStarted = false;
  private readonly thinkingGapMs: number;
  private readonly longWaitMs: number;
  private readonly thinkingMergeMs: number;

  constructor(opts: NormalizerOptions = {}) {
    this.thinkingGapMs = opts.thinkingGapMs ?? 5_000;
    this.longWaitMs = opts.longWaitMs ?? 30_000;
    this.thinkingMergeMs = opts.thinkingMergeMs ?? 3_000;
  }

  push(e: RawAgentEvent): AiEvent[] {
    const out: AiEvent[] = [];
    const emit: EmitFn = (kind, agent, extra = {}) => {
      out.push({
        id: `ev${++this.seq}`,
        t: e.t,
        kind,
        agent,
        plain: plainOf(kind, extra.tool, extra.target),
        raw: e,
        ...extra,
      });
    };
    this.lastAt = e.t;
    this.thinkingInferred = false;
    const p = obj(e.payload);

    if (e.source === 'hook') this.onHook(e.name, p, e.t, emit);
    else if (e.source === 'message') this.onMessage(p, e.t, emit);
    else if (e.source === 'permission') this.onPermission(e.name, p, emit);
    else if (e.source === 'decision') this.onDecision(e.name, p, emit);
    else if (e.source === 'runner' && e.name === 'cancelled') {
      this.finish();
      emit('cancelled', 'main');
    }
    for (const o of out) {
      if (o.kind === 'ask_user' || o.kind === 'permission') this.waitingForUser = true;
      if (o.kind === 'decision') this.waitingForUser = false;
    }
    return out;
  }

  /** Time-based events: inferred thinking and long-running shell commands. */
  tick(now: number): AiEvent[] {
    if (this.finished || this.lastAt === 0 || this.waitingForUser) return [];
    const out: AiEvent[] = [];
    const make = (kind: AiEventKind, agent: Agent, extra: Partial<AiEvent> = {}): AiEvent => ({
      id: `ev${++this.seq}`, t: now, kind, agent, plain: plainOf(kind, extra.tool, extra.target), ...extra,
    });
    for (const r of this.running.values()) {
      if ((r.tool === 'Bash' || r.tool === 'PowerShell') && !r.longWaitSent && now - r.startedAt >= this.longWaitMs) {
        r.longWaitSent = true;
        out.push(make('long_wait', r.agent, { tool: r.tool, target: r.target }));
      }
    }
    const idle = now - this.lastAt >= this.thinkingGapMs;
    const recentlyThought = now - this.lastThinkingAt < this.thinkingGapMs;
    const subagentOut = [...this.agentCalls.values()].some((c) => !c.stopped);
    if (idle && this.running.size === 0 && !subagentOut && !this.thinkingInferred && !recentlyThought) {
      this.thinkingInferred = true;
      this.lastThinkingAt = now;
      out.push(make('thinking', 'main'));
    }
    return out;
  }

  private onHook(name: string, p: Obj, t: number, emit: EmitFn) {
    const agent = asAgent(p.agent_type);
    const tool = str(p.tool_name);
    const id = str(p.tool_use_id);
    switch (name) {
      case 'PreToolUse': {
        if (!tool) return;
        this.workStarted = true;
        if (tool === 'Agent' || tool === 'Task') {
          const input = obj(p.tool_input);
          if (id) this.agentCalls.set(id, { type: asAgent(input.subagent_type), description: str(input.description), stopped: false });
          return; // SubagentStart produces the event
        }
        const target = targetOf(tool, p.tool_input);
        if (id) this.running.set(id, { tool, agent, target, startedAt: t, longWaitSent: false });
        if (tool === 'AskUserQuestion') return; // the permission callback produces ask_user
        emit(tool === 'TodoWrite' ? 'plan' : 'tool_start', agent, { tool, target });
        return;
      }
      case 'PostToolUse': {
        if (tool === 'Agent' || tool === 'Task') {
          this.stopSubagent(id, emit);
          return;
        }
        const r = id ? this.running.get(id) : undefined;
        if (id) this.running.delete(id);
        if (!tool || tool === 'AskUserQuestion' || tool === 'TodoWrite') return;
        if (id && this.failedIds.has(id)) return;
        this.failStreak.set(agent, 0);
        emit('tool_ok', agent, { tool, target: r?.target ?? targetOf(tool, p.tool_input), failStreak: 0 });
        return;
      }
      case 'PostToolUseFailure': {
        if (id) this.running.delete(id);
        if (!tool || (id && this.failedIds.has(id))) return;
        if (id) this.failedIds.add(id);
        this.fail(agent, tool, targetOf(tool, p.tool_input), emit);
        return;
      }
      case 'SubagentStart': {
        if (str(p.agent_id)) this.agentIds.set(str(p.agent_id)!, agent);
        const call = [...this.agentCalls.values()].find((c) => c.type === agent && !c.stopped);
        emit('subagent_start', agent, { tool: 'Agent', target: call?.description });
        return;
      }
      case 'StopFailure': {
        const msg = JSON.stringify(p);
        this.finish();
        emit(NET_ERROR.test(msg) ? 'net_error' : 'failed', 'main');
        return;
      }
      // SubagentStop fires before task_notification, so subagent_stop waits for PostToolUse(Agent) to carry the summary.
      // PermissionRequest duplicates the permission callback; Stop is covered by the result message.
      default:
        return;
    }
  }

  private onMessage(p: Obj, t: number, emit: EmitFn) {
    const type = str(p.type);
    const subtype = str(p.subtype);
    if (type === 'system') {
      if (subtype === 'init') emit('session_start', 'main');
      // The SDK retries failed API calls by itself; say so once per run of retries.
      else if (subtype === 'api_retry') {
        if (Number(p.attempt) === 1) emit('net_retry', 'main');
      }
      else if (subtype === 'thinking_tokens') {
        if (t - this.lastThinkingAt >= this.thinkingMergeMs) emit('thinking', 'main');
        this.lastThinkingAt = t;
      } else if (subtype === 'task_notification') {
        const call = this.agentCalls.get(str(p.tool_use_id) ?? '');
        if (call) call.summary = str(p.summary);
      }
      return;
    }
    if (type === 'rate_limit_event') {
      const status = str(obj(p.rate_limit_info).status);
      if (status && status !== 'allowed') emit('long_wait', 'main', { target: E.rateLimited });
      return;
    }
    if (type === 'assistant') {
      if (p.parent_tool_use_id) return; // subagents' own text doesn't go on the board
      const content = Array.isArray(obj(p.message).content) ? (obj(p.message).content as unknown[]) : [];
      const blocks = content.map(obj);
      if (blocks.some((b) => b.type === 'tool_use')) return;
      const text = blocks.filter((b) => b.type === 'text').map((b) => str(b.text) ?? '').join('\n');
      const steps = text.split('\n').filter((l) => STEP_LINE.test(l));
      // Wrap-up summaries are often lists too: once work has started, only explicit plans count.
      const looksLikePlan = !this.workStarted || PLAN_WORDS.test(text);
      if (steps.length >= 2 && looksLikePlan) emit('plan', 'main', { target: fill(E.planSteps, { n: steps.length }) });
      return;
    }
    if (type === 'user') {
      // A tool_result with is_error counts as a failure even if no failure hook fired.
      const content = Array.isArray(obj(p.message).content) ? (obj(p.message).content as unknown[]) : [];
      for (const b of content.map(obj)) {
        if (b.type !== 'tool_result' || b.is_error !== true) continue;
        const id = str(b.tool_use_id);
        if (!id || this.failedIds.has(id)) continue;
        const r = this.running.get(id);
        if (!r) continue;
        this.failedIds.add(id);
        this.running.delete(id);
        this.fail(r.agent, r.tool, r.target, emit);
      }
      return;
    }
    if (type === 'result') {
      this.finish();
      if (subtype === 'success' && p.is_error !== true) emit('done', 'main');
      else {
        const msg = JSON.stringify(p.errors ?? p.result ?? subtype ?? '');
        emit(NET_ERROR.test(msg) ? 'net_error' : 'failed', 'main');
      }
    }
  }

  private onPermission(tool: string, p: Obj, emit: EmitFn) {
    const input = p.input;
    if (tool === 'AskUserQuestion') {
      emit('ask_user', 'main', { tool, target: questionOf(input) });
      return;
    }
    const risk = str(p.risk) as Risk | undefined;
    if (risk && risk !== 'safe') {
      const agentId = str(p.agent_id);
      emit('permission', agentId ? (this.agentIds.get(agentId) ?? 'unknown') : 'main', {
        tool, target: targetOf(tool, input), risk,
      });
    }
  }

  private onDecision(tool: string, p: Obj, emit: EmitFn) {
    const agentId = str(p.agent_id);
    emit('decision', agentId ? (this.agentIds.get(agentId) ?? 'unknown') : 'main', {
      tool, choice: str(p.choice) as Choice, risk: str(p.risk) as Risk, target: str(p.label),
    });
  }

  private stopSubagent(id: string | undefined, emit: EmitFn) {
    const call = id ? this.agentCalls.get(id) : undefined;
    if (!call || call.stopped) return;
    call.stopped = true;
    emit('subagent_stop', call.type, { tool: 'Agent', target: call.summary ? clip(call.summary, 60) : call.description });
  }

  private fail(agent: Agent, tool: string, target: string | undefined, emit: EmitFn) {
    const n = (this.failStreak.get(agent) ?? 0) + 1;
    this.failStreak.set(agent, n);
    emit('tool_fail', agent, { tool, target, failStreak: n });
  }

  private finish() {
    this.finished = true;
    this.running.clear();
  }
}

function questionOf(input: unknown): string | undefined {
  const qs = obj(input).questions;
  const first = Array.isArray(qs) ? obj(qs[0]) : {};
  const q = str(first.question) ?? str(obj(input).question);
  return q ? clip(q, 30) : undefined;
}

/** Normalize a whole recording (for replay and tests). */
export function normalizeAll(events: RawAgentEvent[], opts?: NormalizerOptions): AiEvent[] {
  const n = new EventNormalizer(opts);
  const out: AiEvent[] = [];
  let prev: number | undefined;
  for (const e of events) {
    if (prev !== undefined) {
      // Tick once per second between events so inferred events appear in replays too.
      for (let t = prev + 1000; t < e.t; t += 1000) out.push(...n.tick(t));
    }
    out.push(...n.push(e));
    prev = e.t;
  }
  return out;
}
