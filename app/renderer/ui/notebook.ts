import { fill, strings } from '../../shared/i18n';
import { shopTimeline } from '../../shared/days';
import { formatUsd } from '../../shared/money';
import type { LamplightApi, Memory } from '../../shared/types';
import { el } from './dom';
import { closeButton, closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const N = strings.ui.notebook;
/** Past commissions drawn at a time; the shop keeps every one of them. */
const NOTEBOOK_PAGE = 20;

function pages(api: LamplightApi, memory: Memory, revise?: (id: string, title: string) => void): HTMLElement[] {
  if (!memory.commissions.length && !memory.stuckNotes.length) return [el('div.notebook-empty', {}, N.empty)];
  const newest = [...memory.commissions].reverse();
  const entry = (c: Memory['commissions'][number]) =>
    el('li', {},
      el('div', {}, el('span.notebook-date', {}, c.date), ' ', el('b', {}, c.title), ' \u00B7 ', c.result === 'done' ? N.done : N.failed,
        c.costUsd ? ` \u00B7 ${fill(N.cost, { cost: formatUsd(c.costUsd) })}` : null,
        c.folder && c.result === 'done' ? el('button.link.notebook-open', { type: 'button', onclick: () => void api.openCommissionFolder(c.id) }, N.openFolder) : null,
        c.folder && c.result === 'done' && revise ? el('button.link.notebook-revise', { type: 'button', onclick: () => revise(c.id, c.title) }, N.revise) : null),
      ...Object.entries(c.choices).map(([q, a]) => el('div.notebook-choice', {}, fill(N.choice, { q, a }))),
      ...(c.asks ?? []).map((a) => el('div.notebook-choice', {}, fill(N.asked, { ask: a.ask }))));
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
    days,
    newest.length ? el('section', {}, el('h4', {}, N.commissions), commissions) : null,
    stuck.length ? el('section', {}, el('h4', {}, N.stuck), el('ul', {}, ...stuck)) : null,
  ].filter((n): n is HTMLElement => n !== null);
}

/** The notebook could not be read when the shop opened. */
export function showNotebookTrouble(kind: 'restored' | 'lost') {
  replaceOpen(el('div.card.paper.notebook-trouble', { role: 'dialog', 'aria-label': N.troubleTitle },
    closeButton(),
    withPortrait('adeng', 'unsure', el('div.card-title', {}, N.troubleTitle), el('div', {}, kind === 'restored' ? N.troubleRestored : N.troubleLost)),
    el('div.actions', {}, el('button.default', { type: 'button', onclick: closePanel }, N.troubleOk))));
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
  const memory = await api.getMemory();
  const body = el('div.notebook-pages', { tabindex: 0 }, ...pages(api, memory, reviseOld));
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
    await api.clearMemory();
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
