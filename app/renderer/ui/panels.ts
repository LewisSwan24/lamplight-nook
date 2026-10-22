import { fill, strings } from '../../shared/i18n';
import type { ActorId, CommissionForm, CommissionResult } from '../../shared/types';
import { sfx } from '../audio/sound';
import { el, layer } from './dom';
import { expressionFor } from './expression';
import { withPortrait } from './portraits';

const U = strings.ui;

/** What a character card shows. Everything here comes from real events. */
export type ActorInfo = {
  state: string;
  lastLine?: string;
  doing?: string;
  stats: { writes: number; runs: number; fails: number };
  raw: string[];
};

let open: HTMLElement | null = null;
/** Where keyboard focus was before the first card opened, to give it back on close. */
let returnFocus: HTMLElement | null = null;
const FOCUS_FIRST = 'textarea, input, button.default, button:not(.close), button';

export function replaceOpen(node: HTMLElement) {
  if (!open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open?.remove();
  open = node;
  layer().append(node);
  sfx('open');
  if (!node.contains(document.activeElement)) node.querySelector<HTMLElement>(FOCUS_FIRST)?.focus();
}
export function closePanel() {
  if (!open) return;
  sfx('close');
  open.dispatchEvent(new Event('panel-closed'));
  open.remove();
  open = null;
  returnFocus?.focus();
  returnFocus = null;
}

// Esc closes the open card (decision dialogs handle their own keys and always win).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open && !open.classList.contains('welcome') && !document.querySelector('.backdrop')) {
    e.preventDefault();
    closePanel();
  }
});

/** Card shown when a character is clicked. */
/** Detailed mode opens the raw record straight away. */
export function showActorCard(actor: ActorId, info: ActorInfo, detailed = false) {
  const state = (strings.states as Record<string, string>)[info.state] ?? info.state;
  replaceOpen(el('div.card.paper.actor-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    withPortrait(actor, expressionFor(info.state),
      el('div.card-title', {}, `${strings.actors[actor]} - ${state}`),
      info.lastLine ? el('div.quote', {}, `\u201C${info.lastLine}\u201D`) : null),
    info.doing ? el('div', {}, el('b', {}, U.doingNow), info.doing) : null,
    el('div', {}, el('b', {}, U.soFar), fill(U.statsLine, info.stats)),
    info.raw.length ? el('details', { open: detailed }, el('summary', {}, U.raw), el('pre', {}, info.raw.slice(-30).join('\n'))) : null,
  ));
}

/** Drop Markdown markers the agents use in summaries (bold, headings, code ticks). */
const plainText = (s: string) => s.replace(/[*#`]+/g, '').replace(/\s+/g, ' ').trim();

/** A subagent's result handed over at the counter. */
export function showParcel(actor: ActorId, summary: string) {
  const parcel = el('div.parcel.paper', { tabindex: 0 },
    el('div.card-title', {}, fill(U.parcelFrom, { who: strings.actors[actor] })),
    el('div.parcel-body', {}, plainText(summary)),
  );
  parcel.addEventListener('click', () => parcel.classList.toggle('expanded'));
  document.querySelectorAll('.parcel').forEach((p) => p.remove());
  layer().append(parcel);
}

/** The commission form. Resolves with the form, or null if closed. */
export function showCommissionForm(): Promise<CommissionForm | null> {
  return new Promise((resolve) => {
    const want = el('textarea', { rows: 2, required: true }) as HTMLTextAreaElement;
    const details = el('input', { type: 'text' }) as HTMLInputElement;
    const audience = el('input', { type: 'text' }) as HTMLInputElement;
    const done = (form: CommissionForm | null) => { resolve(form); closePanel(); };
    const form = el('form.card.paper.commission', {},
      el('div.card-title', {}, U.commissionTitle),
      el('label', {}, U.want, want),
      el('label', {}, U.details, details),
      el('label', {}, U.audience, audience),
      el('div.actions', {},
        el('button', { type: 'button', onclick: () => done(null) }, '\u00D7'),
        el('button.default', { type: 'submit' }, U.submit),
      ),
    );
    // Closed some other way (Esc): same as the close button.
    form.addEventListener('panel-closed', () => resolve(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = want.value.trim();
      if (!text) return;
      done({ want: text, details: details.value.trim() || undefined, audience: audience.value.trim() || undefined, demo: text === U.demoFill });
    });
    want.value = U.demoFill;
    replaceOpen(form);
    want.focus();
  });
}

/** The finished-work card: open the page in the browser, or show it in its folder. */
export function showResult(result: CommissionResult, openOutput: (path: string, how: 'open' | 'reveal') => void) {
  if (!result.main && !result.files.length) return;
  const target = result.main ?? result.files[0];
  replaceOpen(el('div.card.paper.result-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    el('div.card-title', {}, U.resultTitle),
    el('div', {}, target.split(/[\\/]/).pop()),
    el('div.actions', {},
      result.main ? el('button.default', { onclick: () => openOutput(result.main!, 'open') }, U.openInBrowser) : null,
      el('button', { onclick: () => openOutput(target, 'reveal') }, U.openFolder),
    ),
  ));
}

/** The blackboard: up to five steps with a check mark when done. */
export type BoardStep = { key: string; label: string; status: 'todo' | 'doing' | 'done' };
export function renderBoard(steps: BoardStep[]) {
  let board = document.getElementById('board');
  if (!board) {
    board = el('div.board', { id: 'board' });
    layer().append(board);
  }
  board.replaceChildren(...steps.slice(0, 5).map((s) =>
    el(`div.step.${s.status}`, {}, `${s.status === 'done' ? '\u2713' : s.status === 'doing' ? '\u270E' : '\u00B7'} ${s.label}`)));
}

/** Corner badge shown while a recording is replaying, so a replay never passes for a live run. */
export function setReplayBadge(on: boolean) {
  let badge = document.getElementById('replay-badge');
  if (on && !badge) {
    badge = el('div.replay-badge', { id: 'replay-badge' }, U.replayBadge);
    layer().append(badge);
  } else if (!on) badge?.remove();
}
