import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import { projectColor } from '../../shared/project-colors';
import type { LamplightApi, ProjectBrief, ProjectRow, TimelineRow } from '../../shared/types';
import { BRIEF_LAST_ROUND_CHARS, BRIEF_PREF_CHARS, BRIEF_PREFS_MAX } from '../../shared/types';
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
  const q = p.queue;
  // A new commission waiting in the queue has no project yet, so nothing to open; any queued round can be called off.
  const name = p.fresh ? el('span.project-name', {}, p.title) : el('button.link.project-open', { type: 'button', onclick: () => void showTimeline(api, p.id) }, p.title);
  const why = q ? el('div.hint.project-waits', {}, q.waits === 'money' ? P.waitMoney : q.waits === 'project' ? P.waitProject : fill(P.waitSlot, { list: q.behind.join(strings.app.listSeparator) })) : null;
  const callOff = q ? el('button.link.project-call-off', { type: 'button', onclick: async () => { await api.cancelCommission(q.run); void showProjects(api, P.calledOff); } }, P.cancelQueued) : null;
  return el('li.project-row', {},
    swatch(p.color),
    el('div.project-text', {},
      name,
      el('div.hint', {}, p.fresh ? fill(P.touched, { date: p.touched }) : [fill(P.touched, { date: p.touched }), roundCount(p.rounds), fill(P.spent, { usd: formatUsd(p.usd) })].join(' · ')),
      why, callOff),
    el(`span.project-status.${p.status}`, {}, P.status[p.status]));
}

/** The project board (road-to-1.2.md B2): one row per project, latest touched first, the ones put away folded up. */
export async function showProjects(api: LamplightApi, said = '') {
  const rows = await api.projectBoard();
  const out = rows.filter((p) => !p.archived);
  const away = rows.filter((p) => p.archived);
  renderPins(rows);
  replaceOpen(el('div.card.paper.project-card', { role: 'dialog' },
    closeButton(),
    withPortrait('adeng', 'happy', el('div.card-title', {}, P.title), el('div', {}, rows.length ? P.text : P.empty)),
    said ? el('div.hint.projects-note', { role: 'status' }, said) : null,
    rows.length ? el('div.project-list', { tabindex: 0 },
      el('ul.projects', {}, ...out.map((p) => boardRow(api, p))),
      away.length ? el('details.projects-away', {}, el('summary', {}, fill(P.archived, { n: String(away.length) })),
        el('ul.projects', {}, ...away.map((p) => boardRow(api, p)))) : null) : null,
  ));
}

const B = P.brief;

/**
 * "What the staff remember" at the top of a timeline (road-to-1.2.md B3): what the project is for, the preferences, where
 * the last round left off and when the user last changed it. It can be changed (each item rewritten, a preference removed
 * or added), and the project forgotten, which is asked twice. `again` draws the timeline afresh with a note.
 */
function briefBlock(api: LamplightApi, id: string, brief: ProjectBrief, again: (said: string) => void): HTMLElement {
  const box = el('section.brief', { 'aria-label': B.title });
  const item = (label: string, ...body: (Node | string)[]) => el('div.brief-item', {}, el('div.brief-label', {}, label), ...body);
  const text = (s: string | undefined) => el('div.brief-text', {}, s ? plain(s) : el('span.hint', {}, B.nothing));
  const view = () => {
    const note = el('div.hint.brief-note', { role: 'status' });
    const forget = el('button.link.brief-forget', { type: 'button' }, B.forget) as HTMLButtonElement;
    forget.addEventListener('click', async () => {
      if (!forget.classList.contains('sure')) {
        forget.classList.add('sure');
        forget.textContent = B.forgetSure;
        note.textContent = B.forgetAsk;
        return;
      }
      forget.disabled = true;
      if (await api.forgetProject(id)) again(B.forgot);
      else note.textContent = P.failed;
    });
    box.replaceChildren(
      el('div.brief-head', {}, el('b', {}, B.title), brief.edited ? el('span.hint', {}, ` · ${fill(B.edited, { date: brief.edited })}`) : null),
      el('div.hint', {}, B.text),
      item(B.purpose, text(brief.purpose)),
      item(B.prefs, brief.prefs.length ? el('ul.brief-prefs', {}, ...brief.prefs.map((p) => el('li', {}, p))) : text('')),
      item(B.lastRound, text(brief.lastRound)),
      el('div.brief-actions', {}, el('button.link.brief-edit', { type: 'button', onclick: edit }, B.edit), forget),
      note);
  };
  const edit = () => {
    const purpose = el('textarea.brief-purpose', { rows: 2, 'aria-label': B.purpose }) as HTMLTextAreaElement;
    purpose.value = brief.purpose;
    const prefs = el('ul.brief-prefs.editing');
    const addPref = (value: string) => {
      const input = el('input.brief-pref', { type: 'text', maxlength: BRIEF_PREF_CHARS, 'aria-label': B.prefs }) as HTMLInputElement;
      input.value = value;
      const li = el('li', {}, input, el('button.link.brief-remove', { type: 'button', onclick: () => { li.remove(); more.disabled = false; } }, B.removePref));
      prefs.append(li);
      more.disabled = prefs.children.length >= BRIEF_PREFS_MAX;
      return input;
    };
    const more = el('button.link.brief-add', { type: 'button', onclick: () => addPref('').focus() }, B.addPref) as HTMLButtonElement;
    for (const p of brief.prefs) addPref(p);
    const last = el('textarea.brief-last', { rows: 2, maxlength: BRIEF_LAST_ROUND_CHARS, 'aria-label': B.lastRound }) as HTMLTextAreaElement;
    last.value = brief.lastRound ?? '';
    const note = el('div.hint.brief-note', { role: 'status' });
    const save = async (e: Event) => {
      e.preventDefault();
      const kept = Array.from(prefs.querySelectorAll<HTMLInputElement>('input.brief-pref'), (i) => i.value);
      if (await api.saveBrief(id, { purpose: purpose.value, prefs: kept, lastRound: last.value })) again(B.saved);
      else note.textContent = P.failed;
    };
    box.replaceChildren(el('form.brief-form', { onsubmit: save },
      el('div.brief-head', {}, el('b', {}, B.title)),
      item(B.purpose, purpose),
      item(B.prefs, prefs, el('div.brief-more', {}, more, el('span.hint', {}, fill(B.prefLimit, { n: String(BRIEF_PREFS_MAX), chars: String(BRIEF_PREF_CHARS) })))),
      item(B.lastRound, last),
      el('div.actions.brief-save-row', {},
        el('button.default.brief-save', { type: 'submit' }, B.save),
        el('button.brief-cancel', { type: 'button', onclick: view }, B.cancel)),
      note));
    purpose.focus();
  };
  view();
  return box;
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
    el('div.timeline-scroll', { tabindex: 0 },
      briefBlock(api, id, t.brief, again),
      el('ol.timeline', {}, ...[...t.rounds].reverse().map(row))),
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
