import { fill, strings } from '../../shared/i18n';
import type { CommissionForm, ExternalLink, LamplightApi } from '../../shared/types';
import { el } from './dom';
import { closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const R = strings.ui.run;

/** Clicking the counter while a commission runs: what is being made, and a way to stop it (asked twice). */
export function showRunning(api: LamplightApi, want: string) {
  const actions = el('div.actions');
  const ask = () => actions.replaceChildren(el('button.default', { onclick: closePanel }, R.keepGoing), el('button', { onclick: confirm }, R.cancel));
  const confirm = () => {
    note.textContent = R.cancelConfirm;
    actions.replaceChildren(
      el('button.default', { onclick: closePanel }, R.keepGoing),
      el('button', { onclick: () => { closePanel(); void api.cancelCommission(); } }, R.cancel),
    );
  };
  const note = el('div', {}, R.runningText);
  replaceOpen(el('div.card.paper.running-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    withPortrait('adeng', 'calm', el('div.card-title', {}, fill(R.runningTitle, { want })), el('div.waiting', {}, el('span.teacup', { 'aria-hidden': 'true' }), note)),
    actions,
  ));
  ask();
}

type Failure = { title: string; text: string; link?: [ExternalLink, string]; retry: boolean; plain: boolean; retryLabel?: string };

/**
 * Why a commission stopped, for the failures the user can do something about. Billing and key problems use
 * the plain serious-card look: they are about money and credentials, not part of the story.
 */
const FAILURES: Record<string, Failure> = {
  net: { title: R.netTitle, text: R.netText, retry: true, plain: false },
  busy: { title: R.busyTitle, text: R.busyText, retry: true, plain: false },
  billing: { title: R.billingTitle, text: R.billingText, link: ['billing', R.billingHow], retry: true, plain: true },
  auth: { title: R.authTitle, text: R.authText, link: ['apiKeys', R.authHow], retry: false, plain: true },
  gone: { title: R.goneTitle, text: R.goneText, retry: false, plain: false },
  budget: { title: R.budgetTitle, text: R.budgetText, retry: true, plain: true, retryLabel: R.budgetRetry },
};

/** Returns false when the failure needs no card (the characters already said it didn't work out). */
export function showFailure(api: LamplightApi, kind: string, retry: () => void, vars: Record<string, string> = {}): boolean {
  const f = FAILURES[kind];
  if (!f) return false;
  replaceOpen(el(f.plain ? 'div.card.serious' : 'div.card.paper', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    // Money and key problems stay plain, without a character; the rest is Adeng telling you.
    ...(f.plain
      ? [el('div.serious-title', {}, f.title), el('div', {}, fill(f.text, vars))]
      : [withPortrait('adeng', 'troubled', el('div.card-title', {}, f.title), el('div', {}, fill(f.text, vars)))]),
    el('div.actions', {},
      f.link ? el('button', { onclick: () => api.openLink(f.link![0]) }, f.link[1]) : null,
      f.retry ? el('button.default', { onclick: () => { closePanel(); retry(); } }, f.retryLabel ?? R.retry) : null),
  ));
  return true;
}

/** At startup: a commission was left unfinished last time. */
export function showPending(api: LamplightApi, form: CommissionForm, resume: () => void) {
  replaceOpen(el('div.card.paper.pending-card', {},
    withPortrait('adeng', 'calm', el('div.card-title', {}, R.pendingTitle), el('div', {}, fill(R.pendingText, { want: form.want }))),
    el('div.actions', {},
      el('button', { onclick: () => { closePanel(); void api.dropPending(); } }, R.drop),
      el('button.default', { onclick: () => { closePanel(); resume(); } }, R.resume)),
  ));
}
