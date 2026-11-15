import { fill, strings } from '../../shared/i18n';
import type { UpdateOffer } from '../../shared/types';
import { el } from './dom';
import { closeButton, closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

/**
 * The letter the postman brings when there is a new version (road-to-1.1.md A1): its number, what is new, and the
 * choice. "Update" only fetches it; it goes in when the shop closes. "Not now" leaves it until the next time the shop opens.
 */
export function showUpdateLetter(offer: UpdateOffer, update: () => void) {
  const U = strings.ui.update;
  const notes = offer.notes.length
    ? [el('h4', {}, U.notesLabel), el('div.update-notes', {}, ...offer.notes.map((line) => el(line.startsWith('· ') ? 'div.note-item' : 'div', {}, line)))]
    : [];
  replaceOpen(el('div.card.paper.notice-card.update-letter', {},
    closeButton(),
    el('div.card-scroll', {}, withPortrait('adeng', 'happy',
      el('div.card-title', {}, fill(U.title, { version: offer.version })),
      el('div', {}, U.intro),
      ...notes)),
    el('div.actions', {},
      el('button', { type: 'button', onclick: closePanel }, U.later),
      el('button.default', { type: 'button', onclick: () => { closePanel(); update(); } }, U.update)),
  ));
}
