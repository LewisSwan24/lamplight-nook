import portraitsUrl from '../../../assets/ui/portraits.png';
import type { ActorId } from '../../shared/types';
import { el } from './dom';
import { emoteEl } from './emotes';
import { EXPRESSIONS, EXPRESSION_BADGE, PORTRAIT_STAFF as STAFF, type Expression } from './expression';


/** A round portrait: the pixel face on a soft wash of the character's colour, plus the expression's bubble. */
export function portraitEl(actor: ActorId, expression: Expression = 'calm'): HTMLElement | null {
  const row = STAFF.indexOf(actor);
  if (row < 0) return null;
  const face = el('span.portrait-face');
  face.style.backgroundImage = `url(${portraitsUrl})`;
  face.style.setProperty('--col', String(EXPRESSIONS.indexOf(expression)));
  face.style.setProperty('--row', String(row));
  face.style.setProperty('--cols', String(EXPRESSIONS.length));
  face.style.setProperty('--rows', String(STAFF.length));
  const badge = EXPRESSION_BADGE[expression];
  return el(`span.portrait.portrait-${actor}`, { 'aria-hidden': 'true' }, face, badge ? emoteEl(badge) : null);
}

/** Lay a card out with a portrait on the left; without a portrait the body stands alone. */
export function withPortrait(actor: ActorId, expression: Expression, ...body: (Node | null)[]): HTMLElement {
  const portrait = portraitEl(actor, expression);
  const main = el('div.speaker-body', {}, ...body);
  return portrait ? el('div.speaker', {}, portrait, main) : main;
}
