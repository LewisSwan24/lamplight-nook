import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import { projectColor } from '../../shared/project-colors';
import type { LamplightApi, ProjectRow, ProjectTimeline, TimelineRow } from '../../shared/types';
import { el, layer } from './dom';
import { duration } from './notebook';
import { closeButton, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const P = strings.ui.projects;
/** Project cards pinned on the blackboard at most; the rest are on the board card. */
const PINS = 6;

const plain = (s: string) => s.replace(/[*#`]+/g, '').replace(/\s+/g, ' ').trim();
const roundCount = (n: number) => (n === 1 ? P.roundsOne : fill(P.rounds, { n: String(n) }));
const swatch = (color: number) => el('span.project-swatch', { 'aria-hidden': 'true', style: `background:${projectColor(color)}` });

/** One project on the board: what it is called, when it was last touched, its rounds and spending, and where it stands. */
function boardRow(api: LamplightApi, p: ProjectRow): HTMLElement {
  return el('li.project-row', {},
    swatch(p.color),
    el('div.project-text', {},
      el('button.link.project-open', { type: 'button', onclick: () => void showTimeline(api, p.id) }, p.title),
      el('div.hint', {}, [fill(P.touched, { date: p.touched }), roundCount(p.rounds), fill(P.spent, { usd: formatUsd(p.usd) })].join(' · '))),
    el(`span.project-status.${p.status}`, {}, P.status[p.status]));
}

/** The project board (road-to-1.2.md B2): one row per project, latest touched first, the ones put away folded up. */
export async function showProjects(api: LamplightApi) {
  const rows = await api.projectBoard();
  const out = rows.filter((p) => !p.archived);
  const away = rows.filter((p) => p.archived);
  renderPins(rows);
  replaceOpen(el('div.card.paper.project-card', { role: 'dialog' },
    closeButton(),
    withPortrait('adeng', 'happy', el('div.card-title', {}, P.title), el('div', {}, rows.length ? P.text : P.empty)),
    rows.length ? el('div.project-list', { tabindex: 0 },
      el('ul.projects', {}, ...out.map((p) => boardRow(api, p))),
      away.length ? el('details.projects-away', {}, el('summary', {}, fill(P.archived, { n: String(away.length) })),
        el('ul.projects', {}, ...away.map((p) => boardRow(api, p)))) : null) : null,
  ));
}

/** What a round was: the change asked for, the commission itself, or going back to an earlier one. */
const roundWhat = (r: TimelineRow) => (r.restoredFrom ? fill(P.restoredFrom, { n: String(r.restoredFrom) }) : plain(r.what));

/** A project's timeline: one row per round, each with its version to open, go back to or branch off from. */
export async function showTimeline(api: LamplightApi, id: string, said = '') {
  const t = await api.projectTimeline(id);
  if (!t) return;
  const note = el('div.hint.timeline-note', { role: 'status' }, said);
  const again = (text: string) => {
    void showTimeline(api, id, text);
    void api.projectBoard().then(renderPins);
  };
  const row = (r: TimelineRow) => {
    const rowNote = el('div.hint.round-note', { role: 'status' });
    const revert = el('button.link.round-revert', { type: 'button' }, P.revert) as HTMLButtonElement;
    // Going back changes the folder, so it is asked twice; what is there now is kept first.
    revert.addEventListener('click', async () => {
      if (!revert.classList.contains('sure')) {
        revert.classList.add('sure');
        revert.textContent = P.revertSure;
        rowNote.textContent = fill(P.revertAsk, { n: String(r.n) });
        return;
      }
      revert.disabled = true;
      if (await api.revertProject(id, r.n)) again(fill(P.reverted, { n: String(r.n) }));
      else rowNote.textContent = P.failed;
    });
    const fork = async () => {
      const made = await api.forkProject(id, r.n);
      if (!made) return void (rowNote.textContent = P.failed);
      const forked = await api.projectTimeline(made);
      again(fill(P.forked, { title: forked!.project.title }));
    };
    // Going back costs nothing and takes no time: such a round has neither.
    const meta = r.restoredFrom ? '' : [r.usd ? fill(P.cost, { usd: formatUsd(r.usd) }) : P.noCost, r.seconds ? fill(P.took, { time: duration(r.seconds) }) : null].filter(Boolean).join(' · ');
    return el('li.round', {},
      el('div.round-head', {}, el('b', {}, fill(P.round, { n: String(r.n) })), ` · ${r.date}`),
      el('div.round-what', {}, roundWhat(r)),
      r.summary ? el('div.round-summary', {}, plain(r.summary)) : null,
      el('div.hint.round-meta', {}, meta),
      r.kept
        ? el('div.round-actions', {},
          el('button.link.round-open', { type: 'button', onclick: async () => { rowNote.textContent = (await api.openVersion(id, r.n)) ? P.opened : P.failed; } }, P.open),
          revert,
          t.project.lent ? null : el('button.link.round-fork', { type: 'button', onclick: () => void fork() }, P.fork))
        : el('div.hint.round-gone', {}, r.gone ? P.gone : P.none),
      rowNote);
  };
  const gone = t.rounds.filter((r) => r.gone).map((r) => r.n);
  const p = t.project;
  replaceOpen(el('div.card.paper.project-card.timeline-card', { role: 'dialog' },
    closeButton(),
    el('div.card-title', {}, swatch(p.color), ' ', p.title),
    el('div.hint', {}, [P.status[p.status], roundCount(p.rounds), fill(P.spent, { usd: formatUsd(p.usd) })].join(' · ')),
    t.from ? el('div.hint.timeline-from', {}, fill(P.from, { title: t.from.title, n: String(t.from.round) })) : null,
    p.lent ? el('div.hint.timeline-lent', {}, P.lent) : null,
    gone.length ? el('div.hint.timeline-gone', {}, fill(P.goneRounds, { list: gone.join(strings.app.listSeparator) })) : null,
    note,
    el('ol.timeline', { tabindex: 0 }, ...[...t.rounds].reverse().map(row)),
    el('div.actions', {},
      el('button.timeline-archive', { type: 'button', onclick: async () => { await api.archiveProject(id, !p.archived); void showProjects(api); } }, p.archived ? P.unarchive : P.archive),
      el('button.default.timeline-back', { type: 'button', onclick: () => void showProjects(api) }, P.back)),
  ));
}

/**
 * The blackboard doubles as the project board when nothing is chalked on it: a little card for each project, in its
 * colour, the latest touched first. Hidden while there is a plan on it (main.ts).
 */
export function renderPins(rows: ProjectRow[]) {
  let pins = document.getElementById('board-pins');
  if (!pins) {
    pins = el('div.board-pins', { id: 'board-pins', 'aria-hidden': 'true' });
    layer().append(pins);
  }
  pins.replaceChildren(...rows.filter((p) => !p.archived).slice(0, PINS).map((p) =>
    el('span.pin-card', { style: `background:${projectColor(p.color)}`, title: p.title }, el('span.pin-head'), el('span.pin-line'), el('span.pin-line.short'))));
}
