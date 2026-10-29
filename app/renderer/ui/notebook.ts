import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import type { LamplightApi, Memory } from '../../shared/types';
import { el } from './dom';
import { closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const N = strings.ui.notebook;

function pages(memory: Memory): HTMLElement[] {
  if (!memory.commissions.length && !memory.stuckNotes.length) return [el('div.notebook-empty', {}, N.empty)];
  const commissions = [...memory.commissions].reverse().map((c) =>
    el('li', {},
      el('div', {}, el('span.notebook-date', {}, c.date), ' ', el('b', {}, c.title), ' \u00B7 ', c.result === 'done' ? N.done : N.failed,
        c.costUsd ? ` \u00B7 ${fill(N.cost, { cost: formatUsd(c.costUsd) })}` : null),
      ...Object.entries(c.choices).map(([q, a]) => el('div.notebook-choice', {}, fill(N.choice, { q, a })))));
  const stuck = [...memory.stuckNotes].reverse().map((s) => el('li', {}, el('span.notebook-date', {}, s.date), ' ', fill(N.stuckLine, s)));
  return [
    commissions.length ? el('section', {}, el('h4', {}, N.commissions), el('ul', {}, ...commissions)) : null,
    stuck.length ? el('section', {}, el('h4', {}, N.stuck), el('ul', {}, ...stuck)) : null,
  ].filter((n): n is HTMLElement => n !== null);
}

/** Adeng's notebook: everything the shop remembers, and a way to forget it all (asked twice). */
export async function showNotebook(api: LamplightApi) {
  const memory = await api.getMemory();
  const body = el('div.notebook-pages', { tabindex: 0 }, ...pages(memory));
  const actions = el('div.actions');
  const ask = () => actions.replaceChildren(el('button', { onclick: confirm, disabled: !memory.commissions.length && !memory.stuckNotes.length }, N.forget));
  const confirm = () => {
    actions.replaceChildren(
      el('div.notebook-warn', {}, N.forgetConfirm),
      el('button.default', { onclick: ask }, N.keep),
      el('button', { onclick: forget }, N.forgetYes));
    actions.querySelector<HTMLButtonElement>('button.default')?.focus();
  };
  const forget = async () => {
    await api.clearMemory();
    body.replaceChildren(el('div.notebook-empty', {}, N.forgotten));
    actions.replaceChildren(el('button.default', { onclick: closePanel }, '\u2713'));
  };
  replaceOpen(el('div.card.paper.notebook', { role: 'dialog', 'aria-label': N.title },
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    withPortrait('adeng', 'calm', el('div.card-title', {}, N.title), el('div', {}, N.sectionText)),
    body,
    actions,
  ));
  ask();
}
