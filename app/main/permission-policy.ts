import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { fill, strings } from '../shared/i18n';
import type { AiEvent, Choice, Risk } from '../shared/types';
import { CONNECTIONS_PAUSED } from './action-log';
import type { Asker } from './decision-broker';
import { targetOf } from './event-normalizer';
import { classify, type RiskContext } from './risk-classifier';

const D = strings.decision;

/** What the model is told when the user hands a question back to it. */
export const DELEGATE_ANSWER = 'The user left this to you. Pick the option you think is best and say briefly why.';
/** What the model is told when the user declines a step. */
export const DECLINED = 'The user declined this step. Do not retry it; find a way to continue without it.';
const BLOCKED = (reason: string) => `This app never allows this step (${reason}). Continue without it.`;

export type PolicyEvents = {
  /** Called before a decision is put to the user (or a call is classified), so the scene can react first. */
  onRequest: (tool: string, input: Record<string, unknown>, risk: Risk, reason: string, agentId?: string) => void;
  /** Called once the outcome is known. */
  onDecision: (tool: string, choice: Choice, risk: Risk, label?: string, agentId?: string) => void;
};

type Question = { question: string; header?: string; options: { label: string; description?: string }[] };

/** Files named by a delete command, for the confirm button (e.g. "delete a.html, b.html"). */
function deletedFiles(command: string): string[] {
  const m = command.match(/(?:^|[\s;&|])(?:rm|del|erase|Remove-Item)\s+(.+)$/i);
  if (!m) return [];
  // Only this command's own arguments: stop at the next ; && || | or new line ("rm a b && ls" deletes a and b).
  return m[1].split(/[;&|\n<>]/)[0].split(/\s+/).map((a) => a.replace(/^(['"])(.*)\1$/, '$2')).filter((a) => a && !a.startsWith('-'));
}

/** A specific, plain description of the action, used as the confirm button label. Never just "OK". */
export function describeAction(tool: string, input: Record<string, unknown>, ctx?: RiskContext): string {
  // The shop's own tools and the connections say in their own words what they are about to do (C4).
  const nook = ctx?.nook?.get(tool);
  if (nook) return nook.label(input);
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '');
    const files = deletedFiles(cmd);
    if (files.length) return fill(D.deleteFiles, { files: files.join(strings.app.listSeparator) });
    return fill(D.runCommand, { command: targetOf(tool, input) ?? tool });
  }
  const name = targetOf(tool, input);
  if (name && (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit')) return fill(D.writeFile, { name });
  return fill(D.useTool, { tool });
}

function agentOf(agentId: string | undefined, known: Map<string, AiEvent['agent']>): AiEvent['agent'] {
  return agentId ? (known.get(agentId) ?? 'unknown') : 'main';
}

/**
 * Permission callback for the SDK:
 * - safe calls run; blocked calls are refused outright
 * - questions and "ask" calls open the decision dialog; serious calls open the confirmation card
 * - the default on the confirmation card is to decline
 */
export function makePermissionPolicy(ctx: RiskContext, broker: Asker, events: PolicyEvents, agents = new Map<string, AiEvent['agent']>()): CanUseTool {
  return async (tool, input, opts) => {
    const agentId = opts.agentID;
    const { risk, reason, keep } = classify(tool, input, ctx);
    events.onRequest(tool, input, risk, reason, agentId);
    if (keep) ctx.keepOriginal!(keep);

    if (tool === 'AskUserQuestion') {
      const questions = (Array.isArray(input.questions) ? input.questions : []) as Question[];
      const answers: Record<string, string> = {};
      let delegated = false;
      let lastLabel: string | undefined;
      for (const q of questions) {
        const options = q.options.map((o, i) => ({ id: String(i), label: o.label, hint: o.description }));
        options.push({ id: 'delegate', label: D.delegate, hint: D.delegateHint });
        const choice = await broker.ask({
          kind: 'question', agent: agentOf(agentId, agents), tool, title: q.question, options, defaultId: '0',
        });
        if (choice === 'delegate') {
          delegated = true;
          answers[q.question] = DELEGATE_ANSWER;
        } else {
          lastLabel = q.options[Number(choice)]?.label;
          answers[q.question] = lastLabel ?? DELEGATE_ANSWER;
        }
      }
      events.onDecision(tool, delegated ? 'delegated' : 'picked', risk, lastLabel, agentId);
      return { behavior: 'allow', updatedInput: { ...input, answers } };
    }

    if (risk === 'safe') return { behavior: 'allow', updatedInput: input };
    // A connection's step that does not go ahead is written down too (C6).
    const nook = ctx.nook?.get(tool);
    const refused = () => { if (nook?.connection) ctx.round?.refused(nook, input); };
    if (risk === 'blocked') {
      events.onDecision(tool, 'denied', risk, undefined, agentId);
      refused();
      return { behavior: 'deny', message: nook?.connection && ctx.round?.paused() ? CONNECTIONS_PAUSED : BLOCKED(reason) };
    }

    const serious = risk === 'serious';
    const action = describeAction(tool, input, ctx);
    const choice = await broker.ask({
      kind: serious ? 'serious' : 'permission',
      agent: agentOf(agentId, agents),
      tool,
      title: action,
      reason,
      detail: String(input.command ?? input.file_path ?? JSON.stringify(input)),
      // An outside action says how it is undone; one that cannot be, says so (C6).
      ...(nook?.kind === 'outside' && nook.undoHow ? { undo: nook.undoHow } : nook?.kind === 'final' ? { undo: D.undoNo } : {}),
      options: [
        { id: 'deny', label: D.deny },
        { id: 'allow', label: serious ? fill(D.confirm, { action }) : D.allow },
      ],
      defaultId: serious ? 'deny' : 'allow',
    });
    const allowed = choice === 'allow';
    events.onDecision(tool, allowed ? 'allowed' : 'denied', risk, undefined, agentId);
    if (!allowed) refused();
    return allowed ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: DECLINED };
  };
}
