import { fill, strings } from '../../shared/i18n';
import { shopTimeline } from '../../shared/days';
import { localMonth } from '../../shared/localday';
import { monthStats } from '../../shared/stats';
import { formatUsd } from '../../shared/money';
import { PROJECT_CAP_CHOICES, type DataDamage, type LamplightApi, type Memory } from '../../shared/types';
import { MONTH_CAP_DEFAULT } from '../../main/budget';
import { el } from './dom';
import { closeButton, closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const N = strings.ui.notebook;
/** Past commissions drawn at a time; the shop keeps every one of them. */
const NOTEBOOK_PAGE = 20;

const duration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60);
  return m ? fill(N.ledgerMinutes, { m: String(m), s }) : fill(N.ledgerSeconds, { s });
};

/** This month at a glance, from what each round left behind; kept on this computer only, and clearable on its own. */
function ledger(api: LamplightApi, memory: Memory, spent: number): HTMLElement | null {
  const s = monthStats(memory, localMonth(new Date()));
  if (!s.since) return null;
  const kinds = N.ledgerKind as Record<string, string>;
  const lines = s.rounds ? [
    fill(N.ledgerWorks, { works: String(s.works), rounds: String(s.rounds), time: duration(s.averageSeconds) }),
    spent ? fill(N.ledgerSpent, { cost: formatUsd(spent) }) : null,
    s.failures.length ? fill(N.ledgerFailures, { list: s.failures.map((f) => fill(kinds[f.kind] ?? kinds.failed, { n: String(f.n) })).join(N.ledgerJoin) }) : null,
    s.waits ? fill(N.ledgerWaits, { n: String(s.waits), time: duration(s.waitedSeconds) }) : null,
  ] : [N.ledgerNone];
  const section = el('section.notebook-ledger', {}, el('h4', {}, N.ledgerTitle),
    ...lines.filter((l): l is string => Boolean(l)).map((l) => el('div', {}, l)),
    el('div.notebook-choice', {}, fill(N.ledgerSince, { date: s.since })),
    el('button.link.notebook-ledger-clear', { type: 'button', onclick: async () => {
      await api.clearStats();
      section.replaceChildren(el('h4', {}, N.ledgerTitle), el('div', {}, N.ledgerCleared));
    } }, N.ledgerClear));
  return section;
}

function pages(api: LamplightApi, memory: Memory, spent: number, revise?: (id: string, title: string) => void): HTMLElement[] {
  if (!memory.commissions.length && !memory.stuckNotes.length) return [el('div.notebook-empty', {}, N.empty)];
  const newest = [...memory.commissions].reverse();
  // A project's cap (B8) sits with its latest commission, until projects have a board of their own (B2).
  const capOf = (c: Memory['commissions'][number]) => {
    const p = memory.projects.find((x) => x.id === c.project && x.commissions.at(-1) === c.id);
    if (!p) return null;
    const select = el('select.project-cap', { 'aria-label': `${N.projectCap} \u00B7 ${p.title}` }, ...PROJECT_CAP_CHOICES.map((usd) =>
      el('option', { value: usd, selected: usd === (p.capUsd ?? 0) }, usd ? formatUsd(usd) : N.projectCapNone))) as HTMLSelectElement;
    select.addEventListener('change', () => void api.setProjectCap(p.id, Number(select.value)));
    return el('label.notebook-choice.project-cap-row', {}, N.projectCap, ' ', select);
  };
  const entry = (c: Memory['commissions'][number]) =>
    el('li', {},
      el('div', {}, el('span.notebook-date', {}, c.date), ' ', el('b', {}, c.title), ' \u00B7 ', c.result === 'done' ? N.done : N.failed,
        c.costUsd ? ` \u00B7 ${fill(N.cost, { cost: formatUsd(c.costUsd) })}` : null,
        c.folder && c.result === 'done' ? el('button.link.notebook-open', { type: 'button', onclick: () => void api.openCommissionFolder(c.id) }, N.openFolder) : null,
        c.folder && c.result === 'done' && revise ? el('button.link.notebook-revise', { type: 'button', onclick: () => revise(c.id, c.title) }, N.revise) : null),
      ...Object.entries(c.choices).map(([q, a]) => el('div.notebook-choice', {}, fill(N.choice, { q, a }))),
      ...(c.asks ?? []).map((a) => el('div.notebook-choice', {}, fill(N.asked, { ask: a.ask }))),
      capOf(c));
  const commissions = el('ul');
  let drawn = 0;
  const more = el('li.notebook-more', {}, el('button.link', { type: 'button', onclick: () => {
    const first = draw();
    first?.setAttribute('tabindex', '-1');
    first?.focus();
  } }));
  const draw = () => {
    const batch = newest.slice(drawn, drawn + NOTEBOOK_PAGE);
    drawn += batch.length;
    const rows = batch.map(entry);
    for (const row of rows) commissions.insertBefore(row, more.isConnected ? more : null);
    if (drawn < newest.length) {
      (more.firstChild as HTMLElement).textContent = fill(N.more, { n: String(newest.length - drawn) });
      if (!more.isConnected) commissions.append(more);
    } else more.remove();
    return rows[0];
  };
  draw();
  const stuck = [...memory.stuckNotes].reverse().map((s) => el('li', {}, el('span.notebook-date', {}, s.date), ' ', fill(N.stuckLine, s)));
  const shop = memory.shop;
  const days = shop?.done ? el('section.notebook-days', {}, el('h4', {}, N.days),
    el('div', {}, fill(N.doneCount, { n: String(shop.done) })),
    el('ul', {}, ...shopTimeline(memory).map((d) => el('li', {}, el('span.notebook-date', {}, d.date), ' ', d.text)))) : null;
  return [
    ledger(api, memory, spent),
    days,
    newest.length ? el('section', {}, el('h4', {}, N.commissions), commissions) : null,
    stuck.length ? el('section', {}, el('h4', {}, N.stuck), el('ul', {}, ...stuck)) : null,
  ].filter((n): n is HTMLElement => n !== null);
}

/** Data files could not be read when the shop opened. `budget` is what a commission may spend now. */
export function showDataTrouble(damage: DataDamage, budget: number) {
  const said = [
    damage.notebook && { restored: N.troubleRestored, lost: N.troubleLost, missing: N.troubleMissing }[damage.notebook],
    damage.settings && fill(N.troubleSettings, { budget }),
    damage.ledger && N.troubleLedger,
    // A notebook that went missing left nothing behind.
    (damage.notebook !== 'missing' || damage.settings || damage.ledger) && N.troubleKept,
  ].filter((s): s is string => Boolean(s));
  replaceOpen(el('div.card.paper.notebook-trouble', {},
    closeButton(),
    el('div.card-scroll', {}, withPortrait('adeng', 'unsure', el('div.card-title', {}, N.troubleTitle), ...said.map((s) => el('div', {}, s)))),
    el('div.actions', {}, el('button.default', { type: 'button', onclick: closePanel }, N.troubleOk))));
}

/** On upgrading: the shop now has a monthly cap, set above the default from what was spent before. Said once. */
export function showMonthCapNews(capUsd: number) {
  const R = strings.ui.run;
  replaceOpen(el('div.card.paper.month-cap-news', {},
    closeButton(),
    withPortrait('adeng', 'calm', el('div.card-title', {}, R.monthCapNewsTitle), el('div', {}, fill(R.monthCapNewsText, { cap: formatUsd(capUsd), default: formatUsd(MONTH_CAP_DEFAULT) }))),
    el('div.actions', {}, el('button.default', { type: 'button', onclick: closePanel }, R.capOk))));
}

/** "Change it a bit" on an old commission, set by the shop once it can take one (main.ts). */
let reviseOld: ((id: string, title: string) => void) | undefined;
export function onNotebookRevise(fn: (id: string, title: string) => void) {
  reviseOld = fn;
}
/** Told when everything was forgotten, so the shop can put away what it gathered. */
let forgotten: (() => void) | undefined;
export function onNotebookForget(fn: () => void) {
  forgotten = fn;
}

/** Adeng's notebook: everything the shop remembers, and a way to forget it all (asked twice). */
export async function showNotebook(api: LamplightApi) {
  const [memory, spent] = await Promise.all([api.getMemory(), api.spendThisMonth()]);
  const body = el('div.notebook-pages', { tabindex: 0 }, ...pages(api, memory, spent, reviseOld));
  const actions = el('div.actions');
  const ask = () => {
    actions.replaceChildren(el('button', { onclick: confirm, disabled: !memory.commissions.length && !memory.stuckNotes.length }, N.forget));
    actions.querySelector('button')?.focus();
  };
  const confirm = () => {
    actions.replaceChildren(
      el('div.notebook-warn', {}, N.forgetConfirm),
      el('button', { onclick: forget }, N.forgetYes),
      el('button.default', { onclick: ask }, N.keep));
    actions.querySelector<HTMLButtonElement>('button.default')?.focus();
  };
  const forget = async () => {
    if (!(await api.clearMemory())) {
      actions.replaceChildren(el('div.notebook-warn', {}, N.forgetBusy), el('button', { onclick: ask }, N.keep));
      return;
    }
    forgotten?.();
    body.replaceChildren(el('div.notebook-empty', {}, N.forgotten));
    actions.replaceChildren(el('button.default', { onclick: closePanel }, '\u2713'));
    actions.querySelector('button')?.focus();
  };
  replaceOpen(el('div.card.paper.notebook', { role: 'dialog', 'aria-label': N.title },
    closeButton(),
    withPortrait('adeng', 'calm', el('div.card-title', {}, N.title), el('div', {}, N.sectionText)),
    body,
    actions,
  ));
  ask();
  // Start at the top of the page, not at the first link further down.
  body.focus();
  body.scrollTop = 0;
}
