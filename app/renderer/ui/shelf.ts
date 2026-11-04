import worksUrl from '../../../assets/sprites/works.png';
import { WORK_ICONS, type WorkIcon } from '../../shared/growth';
import { fill, strings } from '../../shared/i18n';
import type { LamplightApi } from '../../shared/types';
import { el } from './dom';
import { closeButton, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const W = strings.ui.shelf;
const SCALE = 3;

/** One of the shelf's 8x8 pixel icons, drawn bigger for the card. */
export function workIconEl(icon: WorkIcon): HTMLElement {
  const size = 8 * SCALE;
  return el('span.work-icon', {
    'aria-hidden': 'true',
    style: `background-image:url(${worksUrl});background-size:${WORK_ICONS.length * size}px ${size}px;background-position:-${WORK_ICONS.indexOf(icon) * size}px 0;width:${size}px;height:${size}px`,
  });
}

/** The works shelf: everything finished together, latest first, to open again or change a bit. */
export async function showShelf(api: LamplightApi, revise: (id: string, title: string) => void) {
  const { works } = await api.shopState();
  const rows = works.map((w) => {
    const note = el('div.hint.work-note');
    return el('li.work', {},
      workIconEl(w.icon),
      el('div.work-text', {},
        el('div', {}, el('b', {}, w.title)),
        el('div.hint', {}, w.date, w.rounds ? ` · ${w.rounds === 1 ? W.roundsOne : fill(W.rounds, { n: String(w.rounds) })}` : ''),
        note),
      el('div.work-actions', {},
        el('button.link', { type: 'button', onclick: async () => { if (!(await api.openWork(w.id))) note.textContent = W.gone; } }, W.open),
        el('button.link', { type: 'button', onclick: () => revise(w.id, w.title) }, W.revise)));
  });
  replaceOpen(el('div.card.paper.shelf-card', { role: 'dialog', 'aria-label': W.title },
    closeButton(),
    withPortrait('adeng', 'happy', el('div.card-title', {}, W.title), el('div', {}, rows.length ? W.text : W.empty)),
    rows.length ? el('ul.works', { tabindex: 0 }, ...rows) : null,
  ));
}
