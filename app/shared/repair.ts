import { fill, strings, type LOCALES } from './i18n';
import type { AiEvent, RepairSheet } from './types';

/** The workshop's words for a repair (plan-1.8.md H9), in whichever language the shop is in. */
type Words = (typeof LOCALES)['en']['ui']['repair'];

/** What the fixer has done so far, as the workshop shows it: files read, changes made, how the tests went last. */
export type RepairTally = { read: string[]; edits: number; tests: 'none' | 'ran' | 'passed' | 'failed' };
export const NO_TALLY: RepairTally = { read: [], edits: 0, tests: 'none' };

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
/** Names shown on the line; the rest are counted. */
const SHOWN = 3;

/**
 * A command that first steps into a folder, `cd <folder> && <the rest>`: the way a fixer runs the tests of the copy it
 * was lent, which sits one folder down from where it works.
 */
export function steppingIn(command: string): { dir?: string; bare?: boolean; rest: string } {
  const m = /^cd\s+(?:"([^"]*)"|'([^']*)'|([^\s"';&|]+))\s*&&\s*(\S[\s\S]*)$/.exec(command.trim());
  return m ? { dir: m[1] ?? m[2] ?? m[3], bare: m[3] !== undefined, rest: m[4] } : { rest: command.trim() };
}

/** What a fixer puts after its tests to keep the output short: errors in with the rest, and the last lines only. */
const CUT = /\s*\|\s*(?:tail|head)(?:\s+-n)?\s+-?\d+\s*$/;
const ERRORS_IN = /\s+2>&1\s*$/;

/**
 * A test command without that: `core` is the command itself. `cut` when the output went through a pipe, whose last
 * command's exit status is the one that comes back, so it no longer says how the tests went.
 */
export function trimmedTest(command: string): { core: string; cut: boolean } {
  const c = command.trim();
  const uncut = c.replace(CUT, '');
  return { core: uncut.replace(ERRORS_IN, ''), cut: uncut !== c };
}

/** A command that runs a project's tests, in the usual ways of the usual languages, perhaps after stepping into a folder. */
export function isTestCommand(command: string): boolean {
  const c = steppingIn(command).rest;
  return /^(npm|yarn|pnpm|bun)\s+(run\s+)?(test|t)\b/.test(c)
    || /^(npx\s+)?(vitest|jest|mocha|ava|tap|pytest)\b/.test(c)
    || /^node\s+--test\b/.test(c)
    || /^python3?\s+-m\s+(pytest|unittest)\b/.test(c)
    || /^(go|cargo|dotnet|mvn|gradle)\s+test\b/.test(c);
}

/** One more thing the fixer did. Reads are told apart by name; a change counts once it went through. */
export function tallyRepair(t: RepairTally, e: AiEvent): RepairTally {
  if (e.kind === 'tool_ok' && e.tool === 'Read' && e.target && !t.read.includes(e.target)) return { ...t, read: [...t.read, e.target] };
  if (e.kind === 'tool_ok' && e.tool && EDITS.has(e.tool)) return { ...t, edits: t.edits + 1 };
  if (e.test && e.kind === 'tool_start') return { ...t, tests: 'ran' };
  if (e.test && (e.kind === 'tool_ok' || e.kind === 'tool_fail')) return { ...t, tests: e.kind === 'tool_ok' ? 'passed' : 'failed' };
  return t;
}

const TESTS = { none: 'testsNone', ran: 'testsRan', passed: 'testsPassed', failed: 'testsFailed' } as const;

/** The running card's line in the workshop. */
export function tallyLine(t: RepairTally, R: Words): string {
  if (!t.read.length && !t.edits && t.tests === 'none') return R.tallyNothing;
  const names = t.read.slice(0, SHOWN).join(strings.app.listSeparator);
  const read = !t.read.length ? '' : t.read.length > SHOWN ? fill(R.tallyReadMore, { files: names, n: t.read.length }) : fill(R.tallyRead, { files: names });
  return [read, t.edits ? fill(R.tallyEdits, { n: t.edits }) : '', R[TESTS[t.tests]]].filter(Boolean).join(' · ');
}

type Notes = { why: Map<string, string>; tests: RepairSheet['tests'] };

const path = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** The fixer's notes on why each file changed and how the tests went. Whatever is missing or malformed is left out. */
export function readNotes(text: string | undefined): Notes {
  let raw: unknown;
  try { raw = JSON.parse(text ?? ''); } catch { return { why: new Map(), tests: { ran: false } }; }
  const o = (raw && typeof raw === 'object' ? raw : {}) as { changes?: unknown; tests?: unknown };
  const why = new Map<string, string>();
  for (const c of Array.isArray(o.changes) ? o.changes : []) {
    const { file, why: w } = (c && typeof c === 'object' ? c : {}) as { file?: unknown; why?: unknown };
    if (typeof file === 'string' && typeof w === 'string' && w.trim()) why.set(path(file), w.trim());
  }
  const t = (o.tests && typeof o.tests === 'object' ? o.tests : {}) as Record<string, unknown>;
  const tests: RepairSheet['tests'] = { ran: t.ran === true };
  if (typeof t.passed === 'boolean') tests.passed = t.passed;
  for (const k of ['command', 'note'] as const) if (typeof t[k] === 'string' && (t[k] as string).trim()) tests[k] = (t[k] as string).trim();
  return { why, tests };
}

/** How the tests went, in a few words: what the fixer said, and whether the shop saw them run. */
export function testsLine(s: RepairSheet, R: Words): string {
  if (!s.tests.ran) return R.testsNotRun;
  const said = s.tests.passed === false ? R.testsFailed : s.tests.passed ? R.testsPassed : R.testsRan;
  // The words are the running card's, in the middle of its line; here they start one.
  const how = said.charAt(0).toUpperCase() + said.slice(1);
  return [how, s.tests.command && fill(R.testsCommand, { command: s.tests.command }), s.tests.note, s.testsSeen ? '' : R.testsNotSeen].filter(Boolean).join(' ');
}

/** The review sheet as a file in the commission folder: the branch, every file with its reason, the tests. */
export function sheetMarkdown(s: RepairSheet, title: string, R: Words): string {
  const lines = [`# ${R.sheetTitle}: ${title}`, '', `${R.branch}: \`${s.branch}\``, '', `## ${R.files}`, ''];
  if (!s.files.length) lines.push(R.noFiles);
  for (const f of s.files) {
    const size = f.added < 0 ? R.binary : `+${f.added} -${f.removed}`;
    lines.push(`- \`${f.path}\` (${size}): ${f.why ?? R.noWhy}`);
  }
  lines.push('', `## ${R.tests}`, '', testsLine(s, R), '');
  return lines.join('\n');
}
