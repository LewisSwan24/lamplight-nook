import { strings } from '../../shared/i18n';
import { escapeChoice } from '../../shared/decision';
import type { ActorId, DecisionRequest } from '../../shared/types';
import { setSerious, sfx } from '../audio/sound';
import { el, layer } from './dom';
import { withPortrait } from './portraits';

const D = strings.decision;
/** The confirm button on the serious card can't be clicked for this long, to prevent accidental clicks. */
export const CONFIRM_DELAY_MS = 1000;

/**
 * Show a decision. Questions and ordinary permissions use the watercolor dialog; serious steps use the
 * plain confirmation card. Resolves with the chosen option id.
 */
/**
 * `named`: two rounds are under way (B5), so the card says which project asks, before the question. `asker`: who asks, when
 * the round is played in a shop along the street (road-to-1.4.md D3), where its own person does the asking.
 */
export function showDecision(req: DecisionRequest, named = false, asker?: ActorId): Promise<string> {
  return new Promise((resolve) => {
    const backdrop = el('div.backdrop');
    const serious = req.kind === 'serious';
    const close = (choice: string) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (serious) setSerious(false);
      resolve(choice);
    };
    const onKey = (e: KeyboardEvent) => {
      // Only the card on top listens; the keys never reach the cards underneath.
      const all = document.querySelectorAll('.backdrop');
      if (all[all.length - 1] !== backdrop) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(escapeChoice(req));
      } else if (req.kind !== 'serious' && /^[1-4]$/.test(e.key) && req.options[Number(e.key) - 1]) {
        // Number keys pick an option in the dialog (never on the serious card).
        e.stopPropagation();
        close(req.options[Number(e.key) - 1].id);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const title = named && req.project ? `${req.project.title} \u00B7 ${req.title}` : req.title;
    backdrop.append(req.kind === 'serious' ? seriousCard({ ...req, title }, close) : dialog({ ...req, title }, close, asker));
    layer().append(backdrop);
    // Serious mode: the music stops and a single alert is the only sound.
    if (serious) setSerious(true);
    sfx(serious ? 'serious' : 'ask');
    backdrop.querySelector<HTMLButtonElement>('button.default')?.focus();
  });
}

function dialog(req: DecisionRequest, close: (id: string) => void, asker?: ActorId) {
  const actor = asker ?? (req.agent === 'reviewer' ? 'laoshi' : req.agent === 'researcher' ? 'xiaoju' : req.agent === 'designer' ? 'qingdai' : 'adeng');
  return el('div.dialog.paper', { role: 'dialog', 'aria-modal': 'true', 'aria-label': req.title },
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
  return el('div.serious', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': D.seriousTitle },
    el('div.serious-title', {}, `\u26A0 ${D.seriousTitle}`),
    el('dl', {},
      el('dt', {}, D.what), el('dd', {}, req.title),
      req.reason ? el('dt', {}, D.why) : null, req.reason ? el('dd', {}, req.reason) : null,
      // An outside action says how it is undone, a final one that it cannot be (road-to-1.3.md C6).
      req.undo ? el('dt', {}, D.undo) : null, req.undo ? el('dd', {}, req.undo) : null,
    ),
    req.detail ? el('details', {}, el('summary', {}, D.showDetail), el('pre', {}, req.detail)) : null,
    el('div.actions', {},
      el('button.default', { onclick: () => close('deny') }, deny.label),
      confirm,
    ),
  );
}
