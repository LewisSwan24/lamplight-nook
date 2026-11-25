import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { TEMPLATES } from '../shared/templates';
import { CONSULT_CAP_USD, CONSULT_MESSAGES, type CommissionTemplate, type ConsultLine } from '../shared/types';
import { REPLY_LANGUAGE } from './commission';

/**
 * A talk with Adeng before a commission is written (road-to-1.2.md B4): a few lines of chat, then a slip filled in for the
 * user to look over. Only talk: no tools, no files, a small cap of its own (Q-B1), and the model in settings, but never
 * the best one (plan-1.6.md F6).
 */
/** Claude Code's alias for the cheapest Haiku of the day, so no model id goes out of date: what a talk ran on before 1.6. */
export const CONSULT_MODEL = 'haiku';
export { CONSULT_CAP_USD, CONSULT_MESSAGES };

/** Where the ledger keeps a talk: `consult:<id>`, then `|<session>` as for a commission's folder. */
export const consultFolder = (id: string) => `consult:${id}`;

export const CONSULT_PROMPT = [
  'You are Adeng, who keeps the counter at Lamplight Nook, a small shop whose staff make things for people: web pages, write-ups, letters, tables, plans, photo albums, résumés, reading notes, travel guides and small tools.',
  'Before a commission is written, you chat with the customer to find out four things: what they want made, who it is for, what material they have, and what form the result should take.',
  'Ask about one thing at a time, in two or three short, friendly sentences. Do not write code, do not make the thing yourself, and do not ask to see files: you only ever learn the names of the files they hand over.',
  'Once the four things are clear, say so in a sentence and tell them they can have it written up as a slip.',
  REPLY_LANGUAGE,
].join('\n');

/** What the last turn asks for, as the user's message. */
export const FINISH_PROMPT = 'Write the commission up now, from everything said so far: want is what to make, in one or two sentences in the '
  + "customer's own words; details is everything else agreed, in one short paragraph; audience is who it is for; template is "
  + `the kind of work it is, one of ${TEMPLATES.map((t) => t.id).join(', ')}, or empty when none fits.`;

/** The slip the last turn writes. */
export const BRIEF_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    want: { type: 'string' },
    details: { type: 'string' },
    audience: { type: 'string' },
    template: { type: 'string' },
  },
  required: ['want'],
};

/** The options of one turn. Only the last one (`finish`) asks for the slip as JSON. */
export function consultOptions(o: { cwd: string; maxBudgetUsd: number; env: Record<string, string | undefined>; finish: boolean; resume?: string; claude?: string; model?: string }): Options {
  return {
    cwd: o.cwd,
    model: o.model ?? CONSULT_MODEL,
    systemPrompt: CONSULT_PROMPT,
    tools: [],
    maxTurns: 1,
    // As for a commission: nothing from Claude Code's own settings or MCP servers on this machine.
    settingSources: [],
    mcpServers: {},
    strictMcpConfig: true,
    maxBudgetUsd: o.maxBudgetUsd,
    resume: o.resume,
    env: o.env,
    pathToClaudeCodeExecutable: o.claude,
    ...(o.finish ? { outputFormat: { type: 'json_schema' as const, schema: BRIEF_SCHEMA } } : {}),
  };
}

/** What the user said, and the names (never the places) of any files handed over that Adeng has not heard of yet. */
export function userMessage(text: string, files: string[]): string {
  if (!files.length) return text;
  const names = files.map((f) => f.split(/[\\/]/).pop()!);
  return `${text}\n\n(Files handed over, by name only: ${names.join(', ')}.)`;
}

/** How one turn went: Adeng's reply, the slip on the last turn, and the session's running cost. */
export type Turn = { ok: boolean; budget: boolean; sessionId?: string; text?: string; output?: unknown; costUsd?: number };

export async function consultTurn(prompt: string, options: Options): Promise<Turn> {
  const turn: Turn = { ok: false, budget: false };
  // Claude Code may end with an error after its result; what the result said still counts.
  try {
    for await (const m of query({ prompt, options })) {
      if (m.type === 'system' && m.subtype === 'init') turn.sessionId = m.session_id;
      if (m.type !== 'result') continue;
      turn.sessionId = m.session_id;
      turn.ok = m.subtype === 'success' && !m.is_error;
      turn.budget = m.subtype === 'error_max_budget_usd';
      turn.text = m.subtype === 'success' && m.result.trim() ? m.result.trim() : undefined;
      turn.output = m.subtype === 'success' ? m.structured_output : undefined;
      turn.costUsd = m.total_cost_usd;
    }
  } catch {
    turn.ok = false;
  }
  return turn;
}

/** What goes on the commission slip. */
export type Brief = { want: string; details?: string; audience?: string; template?: CommissionTemplate };

/** The slip from the last turn: its structured output, or JSON in its words. Null when neither has a want. */
export function briefFrom(output: unknown, text: string | undefined): Brief | null {
  const parse = (s: string): unknown => {
    const json = /\{[\s\S]*\}/.exec(s)?.[0];
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  };
  const raw = typeof output === 'string' ? parse(output) : output ?? (text ? parse(text) : null);
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string).trim() : undefined);
  const want = str('want');
  if (!want) return null;
  const template = TEMPLATES.find((t) => t.id === str('template'))?.id;
  return { want, ...(str('details') ? { details: str('details') } : {}), ...(str('audience') ? { audience: str('audience') } : {}), ...(template ? { template } : {}) };
}

/**
 * No slip could be read, or the cap came first: the first thing the user said is the want, and the whole talk the details,
 * each line after who said it and the language's colon.
 */
export function briefFromChat(lines: ConsultLine[], names: { you: string; adeng: string }, colon = ': '): Brief {
  const want = lines.find((l) => l.who === 'you')?.text ?? '';
  return { want, details: lines.map((l) => `${names[l.who]}${colon}${l.text}`).join(' ') };
}
