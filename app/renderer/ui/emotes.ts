import emotesUrl from '../../../assets/ui/emotes.png';
import type { Bubble } from '../../shared/types';
import { el } from './dom';

/** Bubbles in the order they sit on assets/ui/emotes.png (scripts/art/emotes.py, EMOTES); two frames each. */
export const EMOTES: Bubble[] = ['idea', 'sweat', 'question', 'note', 'tea', 'alert', 'dots', 'zzz', 'heart'];

/**
 * A pixel mood bubble: a 16x16 window onto the bubble's two frames, which alternate.
 * Its size follows the `--emote-px` CSS variable (screen pixels per art pixel), so it stays crisp.
 */
export function emoteEl(bubble: Bubble): HTMLElement {
  const strip = el('span.emote-strip');
  strip.style.setProperty('--i', String(EMOTES.indexOf(bubble)));
  strip.style.backgroundImage = `url(${emotesUrl})`;
  return el('span.emote', { 'aria-hidden': 'true' }, strip);
}
