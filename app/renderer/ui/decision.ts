import { strings } from '../../shared/i18n';
import type { DecisionRequest } from '../../shared/types';
import { el, layer } from './dom';
import { withPortrait } from './portraits';

const D = strings.decision;
/** The confirm button on the serious card can't be clicked for this long, to prevent accidental clicks. */
export const CONFIRM_DELAY_MS = 1000;

/**
 * Show a decision. Questions and ordinary permissions use the watercolor dialog; serious steps use the
 * plain confirmation card. Resolves with the chosen option id.
 */
export function showDecision(req: DecisionRequest): Promise<string> {
  return new Promise((resolve) => {
    const backdrop = el('div.backdrop');
    const close = (choice: string) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(choice);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Esc always means the safe answer: "not now" on permissions, the default on questions.
        close(req.options.some((o) => o.id === 'deny') ? 'deny' : req.defaultId);
      } else if (req.kind !== 'serious' && /^[1-4]$/.test(e.key) && req.options[Number(e.key) - 1]) {
        // Number keys pick an option in the dialog (never on the serious card).
        close(req.options[Number(e.key) - 1].id);
      }
    };
    document.addEventListener('keydown', onKey, true);
    backdrop.append(req.kind === 'serious' ? seriousCard(req, close) : dialog(req, close));
    layer().append(backdrop);
    backdrop.querySelector<HTMLButtonElement>('button.default')?.focus();
  });
}

function dialog(req: DecisionRequest, close: (id: string) => void) {
  const actor = req.agent === 'reviewer' ? 'laoshi' : req.agent === 'researcher' ? 'xiaoju' : 'adeng';
  return el('div.dialog.paper', { role: 'dialog', 'aria-modal': 'true' },
    withPortrait(actor, 'unsure',
      el('div.who', {}, strings.actors[actor]),
      el('div.question', {}, req.title),
      req.reason && req.kind === 'permission' ? el('div.reason', {}, req.reason) : null),
    el('div.options', {},
      ...req.options.map((o, i) => el(`button.sticker${o.id === req.defaultId ? '.default' : ''}`, { onclick: () => close(o.id), 'data-key': i + 1 },
        el('span.opt-label', {}, `${i + 1}. ${o.label}`),
        o.hint ? el('span.hint', {}, o.hint) : null,
      )),
    ),
  );
}

function seriousCard(req: DecisionRequest, close: (id: string) => void) {
  const deny = req.options.find((o) => o.id === 'deny')!;
  const allow = req.options.find((o) => o.id === 'allow')!;
  const confirm = el('button.confirm', { disabled: true, onclick: () => close('allow') }, allow.label);
  setTimeout(() => confirm.removeAttribute('disabled'), CONFIRM_DELAY_MS);
  return el('div.serious', { role: 'alertdialog', 'aria-modal': 'true' },
    el('div.serious-title', {}, `\u26A0 ${D.seriousTitle}`),
    el('dl', {},
      el('dt', {}, D.what), el('dd', {}, req.title),
      req.reason ? el('dt', {}, D.why) : null, req.reason ? el('dd', {}, req.reason) : null,
    ),
    req.detail ? el('details', {}, el('summary', {}, D.showDetail), el('pre', {}, req.detail)) : null,
    el('div.actions', {},
      el('button.default', { onclick: () => close('deny') }, deny.label),
      confirm,
    ),
  );
}
