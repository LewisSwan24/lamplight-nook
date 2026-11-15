import { localClock, localDay } from '../shared/localday';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  query,
  type AgentDefinition,
  type CanUseTool,
  type HookCallback,
  type HookEvent,
} from '@anthropic-ai/claude-agent-sdk';
import { strings } from '../shared/i18n';
import type { AiEvent, RawAgentEvent, RunResult } from '../shared/types';
import { REPLY_LANGUAGE } from './commission';
import type { DecisionBroker } from './decision-broker';
import { EventNormalizer } from './event-normalizer';
import { makePermissionPolicy } from './permission-policy';
import { isInside } from './paths';
import { Recorder } from './recorder';
import { classify } from './risk-classifier';
import { locateClaude } from './claude-locator';
import { InputQueue } from './input-queue';
import { agentEnv, type Credentials } from './api-key';

/** The subagents. Their names map directly to characters (researcher -> Xiaoju, designer -> Qingdai, reviewer -> Laoshi). */
export const SUBAGENTS: Record<string, AgentDefinition> = {
  researcher: {
    description: 'Finds references and reads web pages and files. Use for research. Read-only; never modifies files.',
    prompt: `You do research. Only read and search; do not modify files. Finish with a three-to-five sentence summary of what you found. ${REPLY_LANGUAGE}`,
    tools: ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'],
  },
  designer: {
    description: 'Proposes the look of a page or interface before it is built: colours, type and layout. Read-only; never modifies files.',
    prompt: `You design. Before anything is built, propose how it should look: a small palette (four to six colours as hex codes, each with what it is for), fonts and sizes, and the layout from top to bottom in a few lines. Keep it simple, warm and readable, and fit it to what the user asked for. Read any files that already exist if they matter; do not modify files. Finish with the proposal only, under fifteen lines. ${REPLY_LANGUAGE}`,
    tools: ['Read', 'Glob', 'Grep'],
  },
  reviewer: {
    description: 'Checks finished work for problems. Use for the final review. Never modifies files.',
    prompt: `You review work. Read the output and list what is wrong; if nothing is wrong, say so plainly. Do not modify files. ${REPLY_LANGUAGE}`,
    tools: ['Read', 'Glob', 'Grep'],
  },
};

/** Debug tasks used to exercise the pipeline. */
export const DEBUG_PROMPTS = {
  hello: `Create hello.txt in the current folder containing one line: "Hello, Lamplight Nook". ${REPLY_LANGUAGE}`,
  subagents:
    'First use the researcher subagent to look up what sections a simple, good-looking bookkeeping page usually has. ' +
    'Then, based on the result, write notes.md in the current folder (at most 10 lines). ' +
    `Finally use the reviewer subagent to check notes.md. ${REPLY_LANGUAGE}`,
} as const;

const SAFE_READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Agent', 'Task']);
const WRITE_TOOLS = new Set(['Write', 'Edit']);


/**
 * Interim permission rule: allow read-only tools and writes inside the commission folder, deny everything else.
 * To be replaced by RiskClassifier + DecisionBroker.
 */
export function interimPermission(workDir: string): CanUseTool {
  return async (toolName, input) => {
    if (SAFE_READ_TOOLS.has(toolName)) return { behavior: 'allow', updatedInput: input };
    if (WRITE_TOOLS.has(toolName)) {
      const p = String(input.file_path ?? '');
      if (p && isInside(workDir, p)) return { behavior: 'allow', updatedInput: input };
    }
    return { behavior: 'deny', message: 'Only reading and writing inside the commission folder are allowed for now.' };
  };
}

const HOOK_EVENTS: HookEvent[] = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
  'PreCompact',
];

export type RunOptions = {
  prompt: string;
  workDir: string;
  recordingPath: string;
  emit: (e: RawAgentEvent) => void;
  /** Normalized events for the translation layer. */
  emitAi?: (e: AiEvent) => void;
  /**
   * When given, permissions go through the risk classifier and the user decides questions and risky steps.
   * Without it (debug tasks), the interim rule applies.
   */
  broker?: DecisionBroker;
  /** Files that existed in the folder before the run; overwriting them needs confirmation. */
  preexisting?: Set<string>;
  /** Working in a folder the user lent: keeps the original of each of their files before it is first changed. */
  keepOriginal?: (file: string) => void;
  /** Abort the run (the user cancelled the commission or closed the app). */
  abort?: AbortController;
  /** Continue an earlier SDK session (retry after a network failure, or after the app closed mid-commission). */
  resume?: string;
  /** Called once the SDK reports the session id, so the run can be resumed later. */
  onSession?: (sessionId: string) => void;
  /** What Claude Code said about itself as the run started (for the log; never shown to the user). */
  onInit?: (info: { claudeCodeVersion?: string; model?: string }) => void;
  /** Hands over a way to add to the running commission (a meeting note); it returns false once it is too late. */
  onInput?: (add: (text: string) => boolean) => void;
  /** The API key (or dev subscription) to run with; null when there is none. */
  credentials: Credentials | null;
  /** Stop once this run has spent this much (US dollars, Claude Code's estimate); absent means no cap. */
  maxBudgetUsd?: number;
};

/** After a result, how long the session stays open in case the agent picks up a note sent just before. */
const WRAP_UP_GRACE_MS = 1500;

/**
 * Why a run did not finish, as the user needs to hear it: the network, a busy or rate-limited service,
 * the account's billing, the key itself, or the work itself.
 */
export type FailureKind = 'net' | 'busy' | 'billing' | 'auth' | 'budget' | 'failed';

const NET_TEXT = /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket hang up|connection error/i;

export function failureKind(apiError: string | undefined, text: string, subtype?: string): FailureKind {
  if (subtype === 'error_max_budget_usd') return 'budget';
  if (apiError === 'billing_error' || apiError === 'account_on_hold') return 'billing';
  if (apiError === 'authentication_failed' || apiError === 'oauth_org_not_allowed' || apiError === 'verification_required') return 'auth';
  if (apiError === 'rate_limit' || apiError === 'overloaded' || apiError === 'server_error') return 'busy';
  if (/credit balance|billing/i.test(text)) return 'billing';
  if (/invalid (x-)?api.?key|authentication_error|\b401\b/i.test(text)) return 'auth';
  if (/rate.?limit|overloaded|\b(429|500|502|503|529)\b/i.test(text)) return 'busy';
  if (NET_TEXT.test(text)) return 'net';
  return 'failed';
}

export { isInside };

/** Built-in tools available to the agents. Everything else (workflows, cron, MCP...) is off. */
/** TodoWrite is Claude's to-do list up to Claude Code 2.1.2xx; later versions keep it with the Task* tools instead. */
export const TOOLS = ['Agent', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'PowerShell', 'WebSearch', 'WebFetch', 'AskUserQuestion', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'];

/** Run one task, recording every message, hook call and permission decision. */
export async function runAgent({ prompt, workDir, recordingPath, emit, emitAi, broker, preexisting, keepOriginal, abort, resume, onSession, onInit, onInput, credentials, maxBudgetUsd }: RunOptions): Promise<RunResult> {
  mkdirSync(workDir, { recursive: true });
  const recorder = new Recorder(recordingPath);
  const normalizer = new EventNormalizer();
  const sendAi = (events: AiEvent[]) => { if (emitAi) for (const e of events) emitAi(e); };
  const record = (e: Omit<RawAgentEvent, 't'>) => {
    const raw = recorder.write({ t: Date.now(), ...e });
    emit(raw);
    sendAi(normalizer.push(raw));
  };

  if (!credentials) {
    record({ source: 'runner', name: 'no_api_key', payload: {} });
    return { ok: false, recordingPath, workDir, error: 'no_api_key' };
  }
  const claude = locateClaude();
  if (claude === null) {
    record({ source: 'runner', name: 'no_claude', payload: {} });
    return { ok: false, recordingPath, workDir, error: 'no_claude' };
  }

  // agent_id -> subagent type, so permission requests from a subagent can be attributed.
  const agents = new Map<string, AiEvent['agent']>();
  const hookRecorder: HookCallback = async (input) => {
    record({ source: 'hook', name: input.hook_event_name, payload: input });
    if (input.hook_event_name === 'SubagentStart') {
      const type = ['researcher', 'designer', 'reviewer'].includes(input.agent_type) ? (input.agent_type as AiEvent['agent']) : 'unknown';
      agents.set(input.agent_id, type);
    }
    return {};
  };
  const hooks = Object.fromEntries(HOOK_EVENTS.map((ev) => [ev, [{ hooks: [hookRecorder] }]]));
  const interim = interimPermission(workDir);
  const canUseTool: CanUseTool = broker
    ? makePermissionPolicy({ workDir, preexisting, keepOriginal }, broker, {
        onRequest: (tool, input, risk, reason, agentId) =>
          record({ source: 'permission', name: tool, payload: { input, risk, reason, agent_id: agentId } }),
        onDecision: (tool, choice, risk, label, agentId) =>
          record({ source: 'decision', name: tool, payload: { choice, risk, label, agent_id: agentId } }),
      }, agents)
    : async (toolName, input, opts) => {
        const result = await interim(toolName, input, opts);
        // Debug tasks record the risk level without asking the user.
        const { risk, reason } = classify(toolName, input, { workDir });
        record({ source: 'permission', name: toolName, payload: { input, result, risk, reason, agent_id: opts.agentID } });
        return result;
      };
  // The SDK may throw on an error result, so what it reported before that is kept outside the try.
  let apiError: string | undefined;
  let resultText = '';
  let summary: string | undefined;
  let resultSubtype: string | undefined;
  let costUsd: number | undefined;
  const ticker = setInterval(() => sendAi(normalizer.tick(Date.now())), 1000);
  // Streaming input, so a meeting can add to the commission while it runs.
  const input = new InputQueue();
  input.push(prompt);
  onInput?.((text) => {
    const added = input.push(text, 'next');
    if (added) record({ source: 'runner', name: 'meeting_note', payload: { text } });
    return added;
  });
  abort?.signal.addEventListener('abort', () => input.close());

  try {
    let ok = false;
    for await (const message of query({
      prompt: input,
      options: {
        cwd: workDir,
        agents: SUBAGENTS,
        tools: TOOLS,
        hooks,
        // Ignore Claude Code settings and MCP servers on the user's machine; behavior is defined by this app only.
        settingSources: [],
        mcpServers: {},
        strictMcpConfig: true,
        abortController: abort,
        canUseTool,
        pathToClaudeCodeExecutable: claude ?? undefined,
        env: agentEnv(credentials, process.env),
        maxBudgetUsd,
        resume,
      },
    })) {
      record({ source: 'message', name: message.type, payload: message });
      if (message.type === 'result') input.closeSoon(WRAP_UP_GRACE_MS);
      else input.stay();
      if (message.type === 'system' && message.subtype === 'init') {
        onSession?.(message.session_id);
        onInit?.({ claudeCodeVersion: message.claude_code_version, model: message.model });
      }
      if (message.type === 'assistant' && message.error) apiError = message.error;
      if (message.type === 'result') {
        ok = message.subtype === 'success' && !message.is_error;
        resultSubtype = message.subtype;
        // A running total for the session; crash results may carry zeros, so keep the larger.
        if (typeof message.total_cost_usd === 'number') costUsd = Math.max(costUsd ?? 0, message.total_cost_usd);
        resultText = JSON.stringify('errors' in message ? message.errors : message.result);
        if (message.subtype === 'success' && typeof message.result === 'string' && message.result.trim()) summary = message.result.trim();
      }
    }
    return ok ? { ok, recordingPath, workDir, costUsd, summary } : { ok, recordingPath, workDir, costUsd, error: failureKind(apiError, resultText, resultSubtype), detail: `${resultSubtype ?? ''} ${apiError ?? ''}`.trim() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (abort?.signal.aborted) {
      record({ source: 'runner', name: 'cancelled', payload: {} });
      return { ok: false, recordingPath, workDir, costUsd, error: 'cancelled' };
    }
    record({ source: 'runner', name: 'error', payload: { error } });
    return { ok: false, recordingPath, workDir, costUsd, error: failureKind(apiError, `${error}\n${resultText}`, resultSubtype), detail: error.slice(0, 500) };
  } finally {
    clearInterval(ticker);
    input.close();
  }
}

/** One folder per commission inside the work folder: <date>-<time>-<name>. */
export function commissionDir(workRoot: string, name: string, now = new Date()): string {
  return join(workRoot, `${localDay(now)}-${localClock(now)}-${name}`);
}
