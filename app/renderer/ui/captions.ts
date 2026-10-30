import { strings } from '../../shared/i18n';
import type { ActorId, GuestId, Speaker } from '../../shared/types';
import { type Caption, CaptionLog } from './caption-log';
import { el, layer } from './dom';
import { closePanel, replaceOpen } from './panels';

const A = strings.ui.access;
/** Lines the caption bar shows at once. */
const BAR_LINES = 2;
const log = new CaptionLog();
let bar: HTMLElement | null = null;

/** A staff member's or a neighbour's name. */
const nameOf = (who: Speaker) => (who in strings.actors ? strings.actors[who as ActorId] : strings.guests[who as GuestId]);
const line = (c: Caption) => el('div.caption-line', {}, el('b', {}, `${nameOf(c.who)}\uFF1A`), c.text);
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** Keep a line someone said; the caption bar shows it straight away. */
export function recordLine(who: Speaker, text: string) {
  if (log.add(who, text, Date.now()) && bar) bar.replaceChildren(...log.latest(BAR_LINES).map(line));
}

/** The caption bar along the bottom: the last couple of lines, read out by screen readers as they come. */
export function setCaptionBar(on: boolean) {
  if (!on) {
    bar?.remove();
    bar = null;
    return;
  }
  if (bar) return;
  bar = el('div.caption-bar', { role: 'log', 'aria-live': 'polite', 'aria-label': A.captionsTitle }, ...log.latest(BAR_LINES).map(line));
  layer().append(bar);
}

/** Everything said since the shop opened, newest at the bottom. */
export function showCaptionLog() {
  const lines = log.all();
  const list = el('div.caption-list', { tabindex: 0 },
    ...(lines.length ? lines.map((c) => el('div.caption-line', {}, el('span.caption-time', {}, clock(c.at)), ' ', el('b', {}, `${nameOf(c.who)}\uFF1A`), c.text)) : [A.captionsEmpty]));
  replaceOpen(el('div.card.paper.caption-card', { role: 'dialog', 'aria-label': A.captionsTitle },
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    el('div.card-title', {}, A.captionsTitle),
    list,
  ));
  list.scrollTop = list.scrollHeight;
}
