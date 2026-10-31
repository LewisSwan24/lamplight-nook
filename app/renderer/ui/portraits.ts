import portraitsUrl from '../../../assets/ui/portraits.png';
import youUrl from '../../../assets/ui/you.png';
import { AVATAR_COUNT, DEFAULT_AVATAR, cleanAvatar } from '../../shared/avatars';
import { fill, strings } from '../../shared/i18n';
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

/** The player's portrait: their head, cut from their look on assets/ui/you.png at the staff portraits' rows. */
export function youPortraitEl(look: number): HTMLElement {
  const face = el('span.portrait-face.you-face');
  face.style.backgroundImage = `url(${youUrl})`;
  face.style.setProperty('--look', String(cleanAvatar(look) ?? DEFAULT_AVATAR));
  face.style.setProperty('--looks', String(AVATAR_COUNT));
  return el('span.portrait.portrait-you', { 'aria-hidden': 'true' }, face);
}

/** A row of the player's looks, whole and front-on; picking one calls `onPick` and marks it. */
export function lookPicker(current: number, onPick: (look: number) => void): HTMLElement {
  const row = el('div.look-picker', { role: 'radiogroup', 'aria-label': strings.ui.setup.lookLabel });
  const buttons = Array.from({ length: AVATAR_COUNT }, (_, i) => {
    const look = i + 1;
    const b = el('button.look', { type: 'button', role: 'radio', 'aria-label': fill(strings.ui.setup.lookN, { n: String(look) }) },
      el('span.look-figure')) as HTMLButtonElement;
    const figure = b.firstElementChild as HTMLElement;
    figure.style.backgroundImage = `url(${youUrl})`;
    figure.style.setProperty('--look', String(look));
    figure.style.setProperty('--looks', String(AVATAR_COUNT));
    b.addEventListener('click', () => { mark(look); onPick(look); });
    return b;
  });
  const mark = (look: number) => buttons.forEach((b, i) => {
    const on = i + 1 === look;
    b.classList.toggle('picked', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  // Arrow keys move along the row, as in any radio group.
  row.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = (at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + AVATAR_COUNT) % AVATAR_COUNT;
    buttons[next].focus();
    buttons[next].click();
  });
  mark(cleanAvatar(current) ?? DEFAULT_AVATAR);
  row.append(...buttons);
  return row;
}
