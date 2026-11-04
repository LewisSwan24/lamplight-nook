import { fill, strings } from '../../shared/i18n';
import { shopTimeline } from '../../shared/days';
import { formatUsd } from '../../shared/money';
import type { LamplightApi, Memory } from '../../shared/types';
import { el } from './dom';
import { closeButton, closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const N = strings.ui.notebook;

function pages(api: LamplightApi, memory: Memory, revise?: (id: string, title: string) => void): HTMLElement[] {
  if (!memory.commissions.length && !memory.stuckNotes.length) return [el('div.notebook-empty', {}, N.empty)];
  const commissions = [...memory.commissions].reverse().map((c) =>
    el('li', {},
      el('div', {}, el('span.notebook-date', {}, c.date), ' ', el('b', {}, c.title), ' \u00B7 ', c.result === 'done' ? N.done : N.failed,
        c.costUsd ? ` \u00B7 ${fill(N.cost, { cost: formatUsd(c.costUsd) })}` : null,
        c.folder && c.result === 'done' ? el('button.link.notebook-open', { type: 'button', onclick: () => void api.openCommissionFolder(c.id) }, N.openFolder) : null,
        c.folder && c.result === 'done' && revise ? el('button.link.notebook-revise', { type: 'button', onclick: () => revise(c.id, c.title) }, N.revise) : null),
      ...Object.entries(c.choices).map(([q, a]) => el('div.notebook-choice', {}, fill(N.choice, { q, a }))),
      ...(c.asks ?? []).map((a) => el('div.notebook-choice', {}, fill(N.asked, { ask: a.ask })))));
  const stuck = [...memory.stuckNotes].reverse().map((s) => el('li', {}, el('span.notebook-date', {}, s.date), ' ', fill(N.stuckLine, s)));
  const shop = memory.shop;
  const days = shop?.done ? el('section.notebook-days', {}, el('h4', {}, N.days),
    el('div', {}, fill(N.doneCount, { n: String(shop.done) })),
    el('ul', {}, ...shopTimeline(memory).map((d) => el('li', {}, el('span.notebook-date', {}, d.date), ' ', d.text)))) : null;
  return [
    days,
    commissions.length ? el('section', {}, el('h4', {}, N.commissions), el('ul', {}, ...commissions)) : null,
    stuck.length ? el('section', {}, el('h4', {}, N.stuck), el('ul', {}, ...stuck)) : null,
  ].filter((n): n is HTMLElement => n !== null);
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
  const ask = () => actions.replaceChildren(el('button', { onclick: confirm, disabled: !memory.commissions.length && !memory.stuckNotes.length }, N.forget));
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
