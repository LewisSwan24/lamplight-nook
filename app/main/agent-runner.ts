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

/** The two subagents. Their names map directly to characters (researcher -> Xiaoju, reviewer -> Laoshi). */
export const SUBAGENTS: Record<string, AgentDefinition> = {
  researcher: {
    description: 'Finds references and reads web pages and files. Use for research. Read-only; never modifies files.',
    prompt: `You do research. Only read and search; do not modify files. Finish with a three-to-five sentence summary of what you found. ${REPLY_LANGUAGE}`,
    tools: ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'],
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
  /** Abort the run (the user cancelled the commission or closed the app). */
  abort?: AbortController;
};

export { isInside };

/** Built-in tools available to the agents. Everything else (workflows, cron, MCP...) is off. */
export const TOOLS = ['Agent', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'PowerShell', 'WebSearch', 'WebFetch', 'AskUserQuestion', 'TodoWrite'];

/**
 * Developers may test locally with their own signed-in Claude Code subscription (LAMPLIGHT_DEV_SUBSCRIPTION=1).
 * Builds shipped to other people must use an API key.
 */
export function hasCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) || env.LAMPLIGHT_DEV_SUBSCRIPTION === '1';
}

/** Run one task, recording every message, hook call and permission decision. */
export async function runAgent({ prompt, workDir, recordingPath, emit, emitAi, broker, preexisting, abort }: RunOptions): Promise<RunResult> {
  mkdirSync(workDir, { recursive: true });
  const recorder = new Recorder(recordingPath);
  const normalizer = new EventNormalizer();
  const sendAi = (events: AiEvent[]) => { if (emitAi) for (const e of events) emitAi(e); };
  const record = (e: Omit<RawAgentEvent, 't'>) => {
    const raw = recorder.write({ t: Date.now(), ...e });
    emit(raw);
    sendAi(normalizer.push(raw));
  };

  if (!hasCredentials()) {
    record({ source: 'runner', name: 'no_api_key', payload: {} });
    return { ok: false, recordingPath, workDir, error: 'no_api_key' };
  }

  // agent_id -> subagent type, so permission requests from a subagent can be attributed.
  const agents = new Map<string, AiEvent['agent']>();
  const hookRecorder: HookCallback = async (input) => {
    record({ source: 'hook', name: input.hook_event_name, payload: input });
    if (input.hook_event_name === 'SubagentStart') {
      const type = input.agent_type === 'researcher' || input.agent_type === 'reviewer' ? input.agent_type : 'unknown';
      agents.set(input.agent_id, type);
    }
    return {};
  };
  const hooks = Object.fromEntries(HOOK_EVENTS.map((ev) => [ev, [{ hooks: [hookRecorder] }]]));
  const interim = interimPermission(workDir);
  const canUseTool: CanUseTool = broker
    ? makePermissionPolicy({ workDir, preexisting }, broker, {
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
  const ticker = setInterval(() => sendAi(normalizer.tick(Date.now())), 1000);

  try {
    let ok = false;
    for await (const message of query({
      prompt,
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
      },
    })) {
      record({ source: 'message', name: message.type, payload: message });
      if (message.type === 'result') ok = message.subtype === 'success';
    }
    return { ok, recordingPath, workDir };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    record({ source: 'runner', name: 'error', payload: { error } });
    return { ok: false, recordingPath, workDir, error };
  } finally {
    clearInterval(ticker);
  }
}

/** Commission folder: ~/Documents/<app>/<commissions>/<date>-<time>-<name> (folder names come from the locale). */
export function commissionDir(documentsDir: string, name: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().slice(11, 19).replace(/:/g, '');
  return join(documentsDir, ...strings.app.commissionRoot, `${date}-${stamp}-${name}`);
}
