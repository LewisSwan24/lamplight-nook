import type { BoardStep } from '../../shared/board';
import { fill, strings } from '../../shared/i18n';
import { capLine, elapsedLine, planLine } from '../../shared/progress';
import type { ActorId, CommissionForm, ExternalLink, LamplightApi } from '../../shared/types';
import { el } from './dom';
import { clearWorkSigns, closeButton, closePanel, replaceOpen } from './panels';
import { portraitEl, withPortrait } from './portraits';

const R = strings.ui.run;

/** What the running card shows, read afresh each time it redraws. */
export type ProgressView = {
  want: string;
  startedAt: number;
  budgetUsd: number;
  steps: BoardStep[];
  realPlan: boolean;
  /** The latest thing anyone started doing; empty until the first of them. */
  now: string;
  staff: { actor: ActorId; state: string; doing: string }[];
};

let redraw = () => {};
/** Something happened in the shop: the running card catches up, if it is open. */
export const refreshRunning = () => redraw();
let closeCard = () => {};
/** The work is over: a card about work under way has nothing left to say. */
export const closeRunning = () => closeCard();

const stateName = (state: string) => (strings.states as Record<string, string>)[state] ?? state;

/**
 * The one card for work under way, from the counter and the blackboard alike: how long it has taken, what the
 * limit is, what is happening now, the plan, who is doing what, a word in the middle, and a way to stop (asked twice).
 */
export function showRunning(api: LamplightApi, view: () => ProgressView, act: { meet: () => void; actor: (actor: ActorId) => void }) {
  const meta = el('div.hint');
  const now = el('div.progress-now');
  const heading = el('div.hint.progress-heading');
  const list = el('ol.plan-list');
  const actions = el('div.actions');
  const first = view();
  const staff = first.staff.map(({ actor }) => {
    const state = el('span.progress-state');
    const button = el('button.progress-person', { onclick: () => act.actor(actor) }, portraitEl(actor, 'calm'), el('span', {}, strings.actors[actor]), state);
    return { button, state };
  });
  let confirming = false;
  const ask = () => actions.replaceChildren(
    el('button.progress-cancel', { onclick: sure }, R.cancel),
    el('button.progress-meet', { onclick: act.meet }, R.progressMeet),
    el('button.default', { onclick: closePanel }, R.keepGoing),
  );
  const sure = () => {
    confirming = true;
    now.textContent = R.cancelConfirm;
    actions.replaceChildren(
      el('button.progress-cancel', { onclick: () => { closePanel(); void api.cancelCommission(); } }, R.cancel),
      el('button.default', { onclick: closePanel }, R.keepGoing),
    );
    actions.querySelector<HTMLElement>('button.default')!.focus();
  };
  const draw = () => {
    const v = view();
    meta.textContent = [elapsedLine(v.startedAt, Date.now(), R), capLine(v.budgetUsd, R)].filter(Boolean).join(' \u00B7 ');
    if (!confirming) now.textContent = v.now || v.steps.find((s) => s.status === 'doing')?.label || R.progressThinking;
    heading.textContent = planLine(v.steps, v.realPlan, R);
    const top = list.scrollTop;
    list.replaceChildren(...v.steps.map((s) => el(`li.${s.status}`, {}, s.label)));
    list.scrollTop = top;
    v.staff.forEach((s, i) => {
      staff[i].state.textContent = stateName(s.state);
      staff[i].button.title = s.doing;
    });
  };
  const card = el('div.card.paper.running-card.plan-card', {},
    closeButton(),
    withPortrait('adeng', 'calm', el('div.card-title.progress-title', { title: first.want }, fill(R.runningTitle, { want: first.want })), meta, el('div.waiting', {}, el('span.teacup', { 'aria-hidden': 'true' }), now)),
    heading,
    list,
    el('div.progress-staff', {}, ...staff.map((s) => s.button)),
    actions,
  );
  ask();
  draw();
  replaceOpen(card);
  list.querySelector('li.doing')?.scrollIntoView({ block: 'nearest' });
  redraw = () => { if (card.isConnected) draw(); };
  closeCard = () => { if (card.isConnected) closePanel(); };
  const ticking = setInterval(() => { if (card.isConnected) draw(); else clearInterval(ticking); }, 15_000);
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
  failed: { title: R.failedTitle, text: R.failedText, retry: true, plain: false },
  budget: { title: R.budgetTitle, text: R.budgetText, retry: true, plain: true, retryLabel: R.budgetRetry },
};

/** Returns false when the failure needs no card: a commission that was called off. */
export function showFailure(api: LamplightApi, kind: string, retry: () => void, vars: Record<string, string> = {}): boolean {
  const f = FAILURES[kind];
  if (!f) return false;
  const card = el(f.plain ? 'div.card.serious' : 'div.card.paper', { 'onpanel-closed': clearWorkSigns },
    closeButton(),
    // Money and key problems stay plain, without a character; the rest is Adeng telling you.
    ...(f.plain
      ? [el('div.serious-title', {}, f.title), el('div', {}, fill(f.text, vars))]
      : [withPortrait('adeng', 'troubled', el('div.card-title', {}, f.title), el('div', {}, fill(f.text, vars)))]),
    el('div.actions', {},
      f.link ? el('button', { onclick: () => api.openLink(f.link![0]) }, f.link[1]) : null,
      // Carrying on keeps the plan on the blackboard; putting the card away ends the commission, so it goes too.
      f.retry ? el('button.default', { onclick: () => { card.removeEventListener('panel-closed', clearWorkSigns); closePanel(); retry(); } }, f.retryLabel ?? R.retry) : null),
  );
  replaceOpen(card);
  return true;
}

/** At startup: a commission was left unfinished last time. */
export function showPending(api: LamplightApi, form: CommissionForm, resume: () => void) {
  replaceOpen(el('div.card.paper.pending-card.must-answer', {},
    withPortrait('adeng', 'calm', el('div.card-title', {}, R.pendingTitle), el('div', {}, fill(R.pendingText, { want: form.want }))),
    el('div.actions', {},
      el('button', { onclick: () => { closePanel(); void api.dropPending(); } }, R.drop),
      el('button.default', { onclick: () => { closePanel(); resume(); } }, R.resume)),
  ));
}
