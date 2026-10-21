import { mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  query,
  type AgentDefinition,
  type CanUseTool,
  type HookCallback,
  type HookEvent,
} from '@anthropic-ai/claude-agent-sdk';
import { strings } from '../shared/i18n';
import type { AiEvent, RawAgentEvent, RunResult } from '../shared/types';
import { EventNormalizer } from './event-normalizer';
import { Recorder } from './recorder';
import { classify } from './risk-classifier';

// Results are shown to a Chinese-speaking user, so agents answer in Chinese.
const REPLY_LANGUAGE = 'Always reply in Simplified Chinese.';

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

export function isInside(workDir: string, target: string): boolean {
  const abs = isAbsolute(target) ? target : resolve(workDir, target);
  const rel = relative(workDir, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

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
};

/**
 * Developers may test locally with their own signed-in Claude Code subscription (LAMPLIGHT_DEV_SUBSCRIPTION=1).
 * Builds shipped to other people must use an API key.
 */
export function hasCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) || env.LAMPLIGHT_DEV_SUBSCRIPTION === '1';
}

/** Run one task, recording every message, hook call and permission decision. */
export async function runAgent({ prompt, workDir, recordingPath, emit, emitAi }: RunOptions): Promise<RunResult> {
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

  const hookRecorder: HookCallback = async (input) => {
    record({ source: 'hook', name: input.hook_event_name, payload: input });
    return {};
  };
  const hooks = Object.fromEntries(HOOK_EVENTS.map((ev) => [ev, [{ hooks: [hookRecorder] }]]));
  const allow = interimPermission(workDir);
  const ticker = setInterval(() => sendAi(normalizer.tick(Date.now())), 1000);

  try {
    let ok = false;
    for await (const message of query({
      prompt,
      options: {
        cwd: workDir,
        agents: SUBAGENTS,
        hooks,
        // Ignore Claude Code settings on the user's machine; behavior is defined by this app only.
        settingSources: [],
        canUseTool: async (toolName, input, opts) => {
          const result = await allow(toolName, input, opts);
          // Risk is recorded but not enforced yet; DecisionBroker will hand serious cases to the user.
          const { risk, reason } = classify(toolName, input, { workDir });
          record({ source: 'permission', name: toolName, payload: { input, result, risk, reason, agent_id: opts.agentID } });
          return result;
        },
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
