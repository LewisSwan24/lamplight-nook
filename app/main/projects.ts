import type { CommissionMemo, Project, ProjectRound, RoundStat } from '../shared/types';

/** The project number that goes with a commission number: c123 is p123. */
export const projectIdFor = (commission: string) => `p${commission.slice(1)}`;

/** `id`, or the next number up that no project has. */
export function freeProjectId(id: string, taken: Set<string>): string {
  let n = Number(id.slice(1));
  while (taken.has(`p${n}`)) n++;
  return `p${n}`;
}

/** A round on the timeline without its number, from what the notebook has: how it went, what it cost, what was made. */
export function roundInfo(stat: RoundStat | undefined, usd: number | undefined, summary: string | undefined): Partial<ProjectRound> {
  return {
    ...(summary ? { summary } : {}),
    ...(usd ? { usd } : {}),
    ...(stat ? { seconds: stat.seconds, ...(stat.failure ? { failure: stat.failure } : {}) } : {}),
  };
}

/**
 * The same round once more (carried on after a stop, or tried again): it took both goes and cost both, and it ended the
 * way the last go did.
 */
export function roundAgain(was: ProjectRound, now: Omit<ProjectRound, 'n'>): ProjectRound {
  const add = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  const round: ProjectRound = { ...was, ...now, n: was.n, summary: now.summary ?? was.summary, usd: add(was.usd, now.usd), seconds: add(was.seconds, now.seconds), failure: now.failure };
  for (const k of Object.keys(round) as (keyof ProjectRound)[]) if (round[k] === undefined) delete round[k];
  return round;
}

/**
 * The timeline of a commission from before projects: its first round, then each change asked for. Rounds have been timed
 * since 1.1, so on older work only the latest ones were, and the times line up from the end. What each cost was never
 * written down, so no round has it; the project's total still comes from the ledger.
 */
function timelineOf(c: CommissionMemo): Omit<ProjectRound, 'n'>[] {
  const asks = c.asks ?? [];
  const rounds: Omit<ProjectRound, 'n'>[] = [{ commission: c.id, date: asks[0]?.date ?? c.date }, ...asks.map(({ ask, date }) => ({ commission: c.id, date, ask }))];
  const stats = (c.rounds ?? []).slice(-rounds.length);
  const from = rounds.length - stats.length;
  stats.forEach((s, i) => Object.assign(rounds[from + i], { date: s.date }, roundInfo(s, undefined, undefined)));
  if (c.summary) rounds[rounds.length - 1].summary = c.summary;
  return rounds;
}

/**
 * Give every commission without a project one (1.2's data step, and again each time the shop opens). An older version
 * saving the notebook drops the projects but leaves each commission's `project`, so commissions that shared one come
 * back together; the rest become a project of one. Changes `notebook` in place and returns the projects added.
 */
export function addProjects(notebook: { commissions: CommissionMemo[]; projects: Project[] }): string[] {
  const have = new Set(notebook.projects.map((p) => p.id));
  const without = notebook.commissions.filter((c) => !c.project || !have.has(c.project));
  if (!without.length) return [];
  const taken = new Set([...have, ...notebook.commissions.flatMap((c) => (c.project ? [c.project] : []))]);
  const groups = new Map<string, CommissionMemo[]>();
  for (const c of without) {
    if (!c.project) {
      c.project = freeProjectId(projectIdFor(c.id), taken);
      taken.add(c.project);
    }
    groups.set(c.project, [...(groups.get(c.project) ?? []), c]);
  }
  for (const [id, commissions] of groups) {
    commissions.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const rounds = commissions.flatMap(timelineOf).map((r, i) => ({ n: i + 1, ...r }));
    const [first] = commissions;
    notebook.projects.push({
      id, title: first.title, folder: first.folder, ...(first.form?.inPlace ? { lent: true } : {}), created: rounds[0].date,
      commissions: commissions.map((c) => c.id), rounds,
    });
  }
  return [...groups.keys()];
}

/**
 * Where the ledger keeps what a project cost: every folder its commissions worked in, and its talks with Adeng before a
 * commission went in (B4).
 */
export function projectFolders(project: Project, commissions: CommissionMemo[]): string[] {
  const folders = commissions.filter((c) => c.folder && project.commissions.includes(c.id)).map((c) => c.folder!);
  return [...new Set([project.folder, ...folders]), ...(project.consults ?? []).map((id) => `consult:${id}`)];
}

/** Done or stopped, as its latest commission came out. Whether it is running, queued or waiting is the main process's to say. */
export function projectSettled(project: Project, commissions: CommissionMemo[]): 'done' | 'stopped' {
  return commissions.find((c) => c.id === project.commissions.at(-1))!.result === 'done' ? 'done' : 'stopped';
}
