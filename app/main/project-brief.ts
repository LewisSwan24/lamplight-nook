import type { CommissionMemo, Project, ProjectBrief, ProjectRound } from '../shared/types';
import { BRIEF_LAST_ROUND_CHARS, BRIEF_PREF_CHARS, BRIEF_PREFS_MAX } from '../shared/types';

/**
 * What the staff remember about a project between rounds (road-to-1.2.md B3), and the "project background" each round
 * starts with. Put together from what the notebook already has: no model is asked to sum anything up, so it costs nothing
 * but the characters it adds to the prompt, and these are capped.
 */

/** The longest project background, in characters (provisional until a real run). */
export const BACKGROUND_MAX = 2000;
/** Preferences kept, and the longest one. */
const PREFS_MAX = BRIEF_PREFS_MAX;
const PREF_CHARS = BRIEF_PREF_CHARS;
/** Preferences left when the background runs over, after the changes asked for have gone. */
const PREFS_WHEN_SHORT = 8;
/** Rounds whose change asked for goes in. */
const RECENT_ASKS = 3;
/** The longest "where the last round left off", so the background always fits once the purpose is cut. */
const LAST_ROUND_CHARS = BRIEF_LAST_ROUND_CHARS;
/** The longest purpose a user may write; the background cuts it shorter when it has to. */
const PURPOSE_CHARS = 4000;
/** A round that read more than this many tokens, or a session last used more than this many days ago, starts afresh. */
export const SESSION_TOKENS = 150_000;
export const SESSION_DAYS = 7;

const cut = (s: string, n: number) => s.slice(0, n);
/** "Which colour? Mint", "Font: round": a question already ending in a question mark or colon takes no colon of its own. */
const asked = (question: string) => (/[?？:：]$/.test(question.trimEnd()) ? `${question.trimEnd()} ` : `${question}: `);

/** Questions answered, as preferences: one per question, the latest answer, the latest PREFS_MAX. */
function withAnswers(prefs: string[], choices: Record<string, string>): string[] {
  let out = [...prefs];
  for (const [q, a] of Object.entries(choices)) out = [...out.filter((p) => !p.startsWith(asked(q))), cut(`${asked(q)}${a}`, PREF_CHARS)];
  return out.slice(-PREFS_MAX);
}

/**
 * The brief of a project: the one the notebook keeps once the user changed or forgot it, or else what the notebook says
 * of it so far (the first commission's request, the questions answered in it, the last round's summary).
 */
export function briefOf(project: Project, commissions: CommissionMemo[]): ProjectBrief {
  if (project.brief) return project.brief;
  const own = project.commissions.map((id) => commissions.find((c) => c.id === id)).filter((c): c is CommissionMemo => Boolean(c));
  const first = own[0];
  const purpose = first ? [first.form?.want ?? first.title, first.form?.details].filter(Boolean).join('\n') : project.title;
  const lastRound = [...project.rounds].reverse().find((r) => r.summary)?.summary;
  return {
    purpose,
    prefs: own.reduce<string[]>((prefs, c) => withAnswers(prefs, c.choices), []),
    ...(lastRound ? { lastRound: cut(lastRound, LAST_ROUND_CHARS) } : {}),
  };
}

/** After a round: what was answered joins the preferences, and its summary is where the last round left off. */
export function afterRound(brief: ProjectBrief, choices: Record<string, string>, summary: string | undefined): ProjectBrief {
  return { ...brief, prefs: withAnswers(brief.prefs, choices), ...(summary ? { lastRound: cut(summary, LAST_ROUND_CHARS) } : {}) };
}

/** What the user wrote in "what the staff remember", made to fit; null if it is not a brief. */
export function editedBrief(edit: unknown, today: string): ProjectBrief | null {
  const e = edit as Partial<ProjectBrief> | null;
  if (!e || typeof e.purpose !== 'string' || !Array.isArray(e.prefs) || (e.lastRound !== undefined && typeof e.lastRound !== 'string')) return null;
  const prefs = e.prefs.filter((p): p is string => typeof p === 'string').map((p) => cut(p.trim(), PREF_CHARS)).filter(Boolean).slice(0, PREFS_MAX);
  const lastRound = cut(e.lastRound?.trim() ?? '', LAST_ROUND_CHARS);
  return { purpose: cut(e.purpose.trim(), PURPOSE_CHARS), prefs, ...(lastRound ? { lastRound } : {}), edited: today };
}

/** The background as the prompt has it (English, like the rest of the prompt; the user's words as they wrote them). */
function written(purpose: string, prefs: string[], lastRound: string | undefined, asks: string[]): string {
  const parts = [
    purpose && `What the project is for: ${purpose}`,
    prefs.length && `What the user has settled on:\n${prefs.map((p) => `- ${p}`).join('\n')}`,
    lastRound && `Where the last round left off: ${lastRound}`,
    asks.length && `Changes asked for in the last rounds, oldest first:\n${asks.map((a) => `- ${a}`).join('\n')}`,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? `About this project (what the shop remembers of it; the user can see and change this):\n${parts.join('\n')}` : '';
}

/**
 * The project background a round starts with: the brief and the changes asked for in the last three rounds, never more
 * than BACKGROUND_MAX characters. When it runs over, the oldest changes go first, then the preferences beyond the latest
 * eight, and only then is the purpose cut short. Rounds from before the user last had the project forgotten are left out.
 */
export function projectBackground(brief: ProjectBrief, rounds: ProjectRound[]): string {
  let asks = rounds.filter((r) => r.ask && r.n > (brief.forgotAt ?? 0)).map((r) => r.ask!).slice(-RECENT_ASKS);
  let prefs = brief.prefs;
  const over = () => written(brief.purpose, prefs, brief.lastRound, asks).length - BACKGROUND_MAX;
  while (over() > 0 && asks.length) asks = asks.slice(1);
  if (over() > 0) prefs = prefs.slice(-PREFS_WHEN_SHORT);
  if (over() <= 0) return written(brief.purpose, prefs, brief.lastRound, asks);
  return written(`${brief.purpose.slice(0, brief.purpose.length - over() - 1)}…`, prefs, brief.lastRound, asks);
}

const dayNumber = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;

/**
 * Whether the next round starts a new session rather than picking up the last one: the last round read more than
 * SESSION_TOKENS, or the session was last used more than SESSION_DAYS ago. The project background and the folder carry
 * the work over. Both numbers are provisional until a real run.
 */
export function newSession(last: { date: string; contextTokens?: number }, today: string): boolean {
  return (last.contextTokens ?? 0) > SESSION_TOKENS || dayNumber(today) - dayNumber(last.date) > SESSION_DAYS;
}
