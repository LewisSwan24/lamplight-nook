import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { strings } from '../shared/i18n';
import type { CommissionForm } from '../shared/types';

// Agents reply in Chinese because the user reads their results.
export const REPLY_LANGUAGE = 'Always reply in Simplified Chinese.';

const HOUSE_RULES = [
  'Work only inside the current folder.',
  'When looking things up would help, send the researcher subagent; do not research yourself.',
  'When a design choice is genuinely up to the user, ask with the AskUserQuestion tool instead of guessing.',
  'Before finishing, send the reviewer subagent to check the result.',
  'Write the user-facing page text in Simplified Chinese.',
  REPLY_LANGUAGE,
].join('\n');

/** Prompt for an ordinary commission built from the form. */
export function commissionPrompt(form: CommissionForm): string {
  const lines = [`The user's request: ${form.want}`];
  if (form.details) lines.push(`Particulars: ${form.details}`);
  if (form.audience) lines.push(`Who it is for: ${form.audience}`);
  return `${lines.join('\n')}\n\n${HOUSE_RULES}`;
}

/**
 * Prompt for a commission that stopped part-way (network failure, crash, app closed).
 * With the earlier session resumed the agent has its own history; without it, it starts over from the folder.
 */
export function continuePrompt(form: CommissionForm, resumed: boolean): string {
  if (resumed) return `The commission stopped part-way. Continue from where you left off and finish it.\n${REPLY_LANGUAGE}`;
  const original = form.demo ? demoPrompt(form) : commissionPrompt(form);
  return `${original}\n\nAn earlier attempt was interrupted. Files it made may already be in this folder: look at them first and continue from them instead of starting over.`;
}

/**
 * The fixed demo commission. The steps are spelled out so that a real run always covers the storyboard:
 * research, drafts, a real failing check, a color question, a serious delete, a review, done.
 */
export function demoPrompt(form: CommissionForm): string {
  return [
    `The user's request: ${form.want}`,
    '',
    'Follow these steps in order:',
    '1. Send the researcher subagent to find out what simple, good-looking expense-tracking pages usually contain. Keep it short.',
    '2. Write two quick layout sketches as draft-1.html and draft-2.html.',
    '3. Write the real page as index.html: a single self-contained file with an amount input, a category, a list of today\'s entries, a daily total, and localStorage persistence.',
    '4. Run `node check.js` in this folder. It is the shop\'s acceptance check: run it, do not open or edit it. If it fails, fix index.html from its output and run it again until it passes. Verify only with `node check.js`; never create files outside this folder.',
    `5. Ask the user with the AskUserQuestion tool which main color they prefer, with exactly two options: "${strings.demo.colors[0]}" (cream white) and "${strings.demo.colors[1]}" (light mint). Apply the answer to index.html. If they leave it to you, pick one and say why.`,
    '6. Delete draft-1.html and draft-2.html with a single shell command.',
    '7. Send the reviewer subagent to check index.html. Fix anything it reports as a real problem.',
    '8. Finish with two or three sentences on what you made.',
    '',
    HOUSE_RULES,
  ].join('\n');
}

/** Put the demo's check script into the commission folder before the run starts. */
export function prepareDemoFolder(workDir: string, checkScript: string) {
  copyFileSync(checkScript, join(workDir, 'check.js'));
}

/** Files present in a folder (absolute paths), used to protect pre-existing files from being overwritten. */
export function snapshot(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).map((f) => join(dir, f)));
}

/** What the commission produced, for the result card. The main output is index.html if present. */
export function collectOutputs(workDir: string, before: Set<string>): { files: string[]; main?: string } {
  const files = [...snapshot(workDir)].filter((f) => !before.has(f));
  const main = files.find((f) => /index\.html$/i.test(f)) ?? files.find((f) => /\.html?$/i.test(f));
  return { files, main };
}
