import { copyFileSync, existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { strings } from '../shared/i18n';
import type { CommissionForm } from '../shared/types';

const F = strings.ui.files;

/** Text files the edit template accepts, and how big they may be. */
export const EDITABLE = ['txt', 'md', 'html', 'htm', 'csv', 'json'];
export const MAX_EDIT_BYTES = 1024 * 1024;

/** How much of a folder the tidy template lists. */
const LIST_DEPTH = 2;
const LIST_MAX = 500;

// Agents reply in the app's language because the user reads their results.
const LANGUAGE = strings.app.agentLanguage;
export const REPLY_LANGUAGE = `Always reply in ${LANGUAGE}.`;

/** The last reply is shown on the result card, to someone who doesn't write code. */
export const SUMMARY_RULE = 'End with two or three plain sentences for the user, with no file names, code or colour codes: what you made, '
  + 'how you followed what they asked (including anything said in a meeting), and anything you left out and why.';

const HOUSE_RULES = [
  'Work only inside the current folder.',
  'When looking things up would help, send the researcher subagent; do not research yourself.',
  'Before building a page or anything else people will look at, send the designer subagent for the colours and layout, then follow its proposal.',
  'When a design choice is genuinely up to the user, ask with the AskUserQuestion tool instead of guessing.',
  'Before finishing, send the reviewer subagent to check the result.',
  `Write the user-facing page text in ${LANGUAGE}.`,
  SUMMARY_RULE,
  REPLY_LANGUAGE,
].join('\n');

/** Short name of a commission: its folder name and how Adeng's notebook refers to it. */
export const commissionTitle = (form: CommissionForm) => (form.demo ? strings.demo.brief : shortTitle(form.want));

/** "帮我做一个家庭聚会签到的小网页。" → "做一个家庭聚会签到的小网页": no "please" in front, no punctuation, at most 16 characters, safe as a folder name. */
export function shortTitle(want: string): string {
  const core = want.trim().replace(/^(请|麻烦)?(帮我|给我|替我)/, '').replace(/^(please\s+|can you\s+|could you\s+)+/i, '');
  const firstSentence = core.split(/[。！？!?\n]/)[0] || core;
  const title = [...firstSentence].slice(0, 16).join('').replace(/[\\/:*?"<>|\s，,。.；;：]+/g, '-').replace(/^-+|-+$/g, '');
  return title || [...want].slice(0, 16).join('').replace(/[\\/:*?"<>|\s]+/g, '-');
}

/** Add what the shop remembers about this user (may be empty) to a prompt. */
const withNotes = (prompt: string, notes = '') => (notes ? `${prompt}\n\n${notes}` : prompt);

/** Names of the files the shop puts in the folder before an edit commission. */
export const originalName = (source: string) => `${F.originalPrefix}${basename(source)}`;
export const revisedName = (source: string) => `${F.revisedPrefix}${basename(source)}`;

/** What each template asks for on top of the request itself. File names are quoted so they are unambiguous. */
function templateSteps(form: CommissionForm): string[] {
  switch (form.template) {
    case 'page':
      return [
        'Make it as a single self-contained page named "index.html": CSS and JavaScript inline, no build step, and it must work when opened straight from disk.',
        'Keep data in localStorage if the page needs to remember anything.',
      ];
    case 'research':
      return [
        'This is a research commission: do not make a web page.',
        `Send the researcher subagent to look it up, then write the findings as "${F.summary}" in ${LANGUAGE}:`,
        'a three-sentence summary first, then the key points as a list, then the sources with their links.',
        'Say plainly where sources disagree or where you are unsure.',
      ];
    case 'edit': {
      const source = form.source ?? '';
      return [
        `The document to work on is "${originalName(source)}" in this folder, a copy of the user's file.`,
        `Do not change "${originalName(source)}". Write the edited version as "${revisedName(source)}", in the same format.`,
        'In your final reply, list the main changes in two to five short points.',
      ];
    }
    case 'tidy':
      return [
        `"${F.listing}" lists what is in the user's folder "${basename(form.source ?? '')}": relative path, size in bytes, last modified date. Folders end with "/".`,
        'You cannot see that folder and must not try to look for it. Work only from the list.',
        `Write a plan for tidying it up as "${F.tidyPlan}" in ${LANGUAGE}: a suggested folder layout, which files go where,`,
        'and anything that looks like a duplicate, an old version or a leftover worth a look.',
        'Do not move, rename or delete anything: the user carries out the plan themselves.',
      ];
    default:
      return [];
  }
}

/** Prompt for an ordinary commission built from the form. */
export function commissionPrompt(form: CommissionForm, notes?: string): string {
  const lines = [`The user's request: ${form.want}`];
  if (form.details) lines.push(`Particulars: ${form.details}`);
  if (form.audience) lines.push(`Who it is for: ${form.audience}`);
  const steps = templateSteps(form);
  const body = steps.length ? `${lines.join('\n')}\n\n${steps.join('\n')}` : lines.join('\n');
  return withNotes(`${body}\n\n${HOUSE_RULES}`, notes);
}

/** What the user said in a meeting, sent to the running commission. */
export function meetingNote(text: string): string {
  return [
    'The user called the staff together for a quick word and adds this to the commission:',
    `"${text}"`,
    'Take it into account from now on. If it changes something you already made, update that too.',
    REPLY_LANGUAGE,
  ].join('\n');
}

/**
 * Prompt for a commission that stopped part-way (network failure, crash, app closed).
 * With the earlier session resumed the agent has its own history; without it, it starts over from the folder.
 */
export function continuePrompt(form: CommissionForm, resumed: boolean, notes?: string): string {
  if (resumed) return `The commission stopped part-way. Continue from where you left off and finish it.\n${REPLY_LANGUAGE}`;
  const original = form.demo ? demoPrompt(form, notes) : commissionPrompt(form, notes);
  return `${original}\n\nAn earlier attempt was interrupted. Files it made may already be in this folder: look at them first and continue from them instead of starting over.`;
}

/**
 * The fixed demo commission. The steps are spelled out so that a real run always covers the storyboard:
 * research, drafts, a real failing check, a color question, a serious delete, a review, done.
 */
export function demoPrompt(form: CommissionForm, notes?: string): string {
  return withNotes([
    `The user's request: ${form.want}`,
    '',
    'Before using any tool, state your plan as a numbered list of exactly three steps: research, write the page, check it.',
    '',
    'Follow these steps in order:',
    '1. Send the researcher subagent to find out what simple, good-looking expense-tracking pages usually contain. Keep it short.',
    '2. Write two quick layout sketches as draft-1.html and draft-2.html.',
    '3. Write the real page as index.html: a single self-contained file with an amount input, a category, a list of today\'s entries, a daily total, and localStorage persistence.',
    '4. Run `node check.js` in this folder. It is the shop\'s acceptance check: run it, do not open or edit it. If it fails, fix index.html from its output and run it again until it passes. Verify only with `node check.js`; never create files outside this folder.',
    `5. Ask the user with the AskUserQuestion tool which main color they prefer, with exactly two options: "${strings.demo.colors[0]}" (cream white) and "${strings.demo.colors[1]}" (light mint). Apply the answer to index.html. If they leave it to you, pick one and say why.`,
    '6. Delete draft-1.html and draft-2.html with a single shell command.',
    '7. Send the reviewer subagent to check index.html. Fix anything it reports as a real problem.',
    `8. ${SUMMARY_RULE}`,
    '',
    HOUSE_RULES,
  ].join('\n'), notes);
}

/** Put the demo's check script into the commission folder before the run starts. */
export function prepareDemoFolder(workDir: string, checkScript: string) {
  copyFileSync(checkScript, join(workDir, 'check.js'));
}

/**
 * Put what a template works from into the commission folder before the run starts:
 * a copy of the file to edit, or a list of the folder to tidy. The user's own files are never touched.
 */
export function prepareSource(workDir: string, form: CommissionForm) {
  if (!form.source) return;
  if (form.template === 'edit') copyFileSync(form.source, join(workDir, originalName(form.source)));
  if (form.template === 'tidy') writeFileSync(join(workDir, F.listing), listFolder(form.source), 'utf8');
}

/** A plain-text list of a folder, two levels deep, hidden files and links left out, capped in length. */
export function listFolder(root: string, maxDepth = LIST_DEPTH, max = LIST_MAX): string {
  const lines: string[] = [];
  let more = 0;
  const walk = (dir: string, rel: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(dir).sort((a, b) => a.localeCompare(b)); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      let st;
      try { st = lstatSync(join(dir, name)); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (lines.length >= max) { more++; continue; }
      const path = rel ? `${rel}/${name}` : name;
      const date = st.mtime.toISOString().slice(0, 10);
      if (st.isDirectory()) {
        lines.push(`${path}/\t-\t${date}`);
        if (depth < maxDepth) walk(join(dir, name), path, depth + 1);
      } else if (st.isFile()) {
        lines.push(`${path}\t${st.size}\t${date}`);
      }
    }
  };
  walk(root, '', 1);
  if (more) lines.push(`... and ${more} more not listed`);
  return `${lines.join('\n')}\n`;
}

/** Files present in a folder (absolute paths), used to protect pre-existing files from being overwritten. */
export function snapshot(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).map((f) => join(dir, f)));
}

/**
 * What the commission produced, for the result card. The main output is index.html if present,
 * else an edited document, else any page, else a Markdown write-up (a research summary or a tidy plan).
 */
export function collectOutputs(workDir: string, before: Set<string>): { files: string[]; main?: string } {
  const files = [...snapshot(workDir)].filter((f) => !before.has(f));
  const main = files.find((f) => /index\.html$/i.test(f))
    ?? files.find((f) => basename(f).startsWith(F.revisedPrefix))
    ?? files.find((f) => /\.html?$/i.test(f))
    ?? files.find((f) => /\.md$/i.test(f));
  return { files, main };
}
