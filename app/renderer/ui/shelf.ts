import worksUrl from '../../../assets/sprites/works.png';
import { WORK_ICONS, type WorkIcon } from '../../shared/growth';
import { fill, locale, strings } from '../../shared/i18n';
import { monthName } from '../../shared/localday';
import { byMonth, filterWorks, kindsOf, type ShelfFilter } from '../../shared/shelf';
import type { LamplightApi, Work } from '../../shared/types';
import { el } from './dom';
import { closeButton, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const W = strings.ui.shelf;
const SCALE = 3;
/** Up to here a shelf is a short list and needs nothing else. */
const FEW_WORKS = 6;
/** Drawn at a time: a shop can have made a thousand things. */
const SHELF_PAGE = 40;

/** One of the shelf's 8x8 pixel icons, drawn bigger for the card. */
export function workIconEl(icon: WorkIcon): HTMLElement {
  const size = 8 * SCALE;
  return el('span.work-icon', {
    'aria-hidden': 'true',
    style: `background-image:url(${worksUrl});background-size:${WORK_ICONS.length * size}px ${size}px;background-position:-${WORK_ICONS.indexOf(icon) * size}px 0;width:${size}px;height:${size}px`,
  });
}

/** The works shelf: everything finished together, latest first, to find, open again or change a bit. */
export async function showShelf(api: LamplightApi, revise: (id: string, title: string) => void) {
  const { works } = await api.shopState();
  const row = (w: Work) => {
    const note = el('div.hint.work-note');
    // Moved rather than deleted: the user can say where to, as long as there is a main file to recognise it by.
    const showGone = () => note.replaceChildren(W.gone, ...(w.hasMain ? [' ', el('button.link', { type: 'button', onclick: async () => {
      const found = await api.relinkWork(w.id);
      if (found === 'found') note.textContent = W.relinked;
      if (found === 'wrong') note.replaceChildren(W.relinkWrong, ' ', note.querySelector('button')!);
      if (found === 'broad') note.replaceChildren(W.relinkBroad, ' ', note.querySelector('button')!);
      if (found === 'taken') note.replaceChildren(W.relinkTaken, ' ', note.querySelector('button')!);
    } }, W.relink)] : []));
    return el('li.work', {},
      workIconEl(w.icon),
      el('div.work-text', {},
        el('div', {}, el('b', {}, w.title)),
        el('div.hint', {}, w.date, w.rounds ? ` \u00B7 ${w.rounds === 1 ? W.roundsOne : fill(W.rounds, { n: String(w.rounds) })}` : ''),
        note),
      el('div.work-actions', {},
        el('button.link', { type: 'button', onclick: async () => { if (!(await api.openWork(w.id))) showGone(); } }, W.open),
        el('button.link', { type: 'button', onclick: () => revise(w.id, w.title) }, W.revise)));
  };
  const many = works.length > FEW_WORKS;
  const list = el('ul.works', { tabindex: 0 });
  const count = el('div.hint.works-count', { 'aria-live': 'polite' });
  const filter: ShelfFilter = { query: '', kind: null };
  let found = works;
  let drawn = 0;
  let lastMonth = '';

  const more = el('li.works-more', {}, el('button.link', { type: 'button', onclick: () => {
    const from = list.querySelectorAll('.work').length;
    drawNext();
    list.querySelectorAll<HTMLElement>('.work')[from]?.querySelector('button')?.focus();
  } }));
  const drawNext = () => {
    more.remove();
    const batch = found.slice(drawn, drawn + SHELF_PAGE);
    for (const group of many ? byMonth(batch) : [{ month: '', works: batch }]) {
      if (group.month && group.month !== lastMonth) list.append(el('li.works-month', {}, monthName(group.month, locale())));
      lastMonth = group.month;
      list.append(...group.works.map(row));
    }
    drawn += batch.length;
    if (drawn < found.length) {
      (more.firstChild as HTMLElement).textContent = fill(W.more, { n: String(found.length - drawn) });
      list.append(more);
    }
  };
  const draw = () => {
    found = filterWorks(works, filter);
    drawn = 0;
    lastMonth = '';
    list.replaceChildren();
    list.scrollTop = 0;
    drawNext();
    if (!found.length) list.append(el('li.works-none', {}, W.noMatch));
    count.textContent = filter.query.trim() || filter.kind ? fill(W.found, { n: String(found.length) }) : '';
  };

  const askFor = (query: string) => {
    filter.query = query;
    draw();
  };
  const search = el('input.shelf-search', { type: 'search', placeholder: W.search, 'aria-label': W.search, spellcheck: 'false',
    // Still choosing the character: wait until the word is settled.
    oninput: (e: InputEvent) => { if (!e.isComposing) askFor(search.value); },
    oncompositionend: () => askFor(search.value),
    onkeydown: (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') list.querySelector<HTMLElement>('.work button')?.focus();
      // The first Esc takes back the words; the next one puts the shelf away, as on any other card.
      if (e.key === 'Escape' && search.value) {
        e.stopPropagation();
        search.value = '';
        askFor('');
      }
    },
  }) as HTMLInputElement;
  const chip = (label: string, n: number, kind: ShelfFilter['kind']) => el('button.kind-chip', {
    type: 'button', 'aria-pressed': String(kind === filter.kind), onclick: (e: Event) => {
      filter.kind = kind;
      for (const c of Array.from(chips.children)) c.setAttribute('aria-pressed', String(c === e.currentTarget));
      draw();
    },
  }, `${label} ${n}`);
  const chips = el('div.kind-chips', { role: 'group', 'aria-label': W.kindsLabel }, chip(W.all, works.length, null),
    ...kindsOf(works).map(({ kind, n }) => chip(W.kinds[kind], n, kind)));

  draw();
  replaceOpen(el('div.card.paper.shelf-card', { role: 'dialog', 'aria-label': W.title },
    closeButton(),
    withPortrait('adeng', 'happy', el('div.card-title', {}, W.title), el('div', {}, works.length ? W.text : W.empty)),
    many ? el('div.shelf-tools', {}, search, chips, count) : null,
    works.length ? list : null,
  ));
  if (many) search.focus();
}
