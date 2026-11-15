import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import type { MoveOffer } from '../../shared/types';
import { el } from './dom';
import { closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

/**
 * The Store build's first open, when the installer build on this computer has a shop (road-to-1.1.md A2): bring it
 * over or start afresh. It has to be answered before the shop opens. Resolves with the answer.
 */
export function askMoveIn(offer: MoveOffer): Promise<boolean> {
  const M = strings.ui.moveIn;
  return new Promise((answer) => {
    const pick = (yes: boolean) => () => { closePanel(); answer(yes); };
    replaceOpen(el('div.card.paper.notice-card.move-in-card.must-answer', {},
      el('div.card-scroll', {}, withPortrait('adeng', 'happy',
        el('div.card-title', {}, M.title),
        el('div', {}, fill(M.found, { works: String(offer.works), spent: formatUsd(offer.spentUsd) })),
        el('div', {}, M.text))),
      el('div.actions', {},
        el('button', { type: 'button', onclick: pick(false) }, M.fresh),
        el('button.default', { type: 'button', onclick: pick(true) }, M.move)),
    ));
  });
}
