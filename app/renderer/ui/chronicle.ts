import { chronicle, type ChronicleEntry, type ChronicleInput, type ChroniclePart } from '../../shared/chronicle';
import type { Holiday } from '../../shared/holidays';
import { fill, locale, strings } from '../../shared/i18n';
import type { GuestId } from '../../shared/types';
import { GUEST_IDS } from '../game/guests';
import { el } from './dom';
import { closeButton, replaceOpen } from './panels';
import { toldChapter } from './story';

/**
 * The town's record (plan-2.0.md J8): the book on the home shop's shelf. A paper card, a part to a page: the year, the
 * neighbours' stories, the staff's, what has grown, the festivals, the postcards. What has come shows the day it came,
 * and a chapter unfolds to read again; what has not is a blank, with one line on the page about how such things come.
 */
export function showChronicle(input: ChronicleInput, page = 0) {
  const C = strings.ui.chronicle;
  const parts = chronicle(input);
  const at = Math.max(0, Math.min(page, parts.length - 1));
  const turn = (to: number) => () => showChronicle(input, to);
  const card = el('div.card.paper.chronicle-card', { 'data-part': parts[at].id },
    closeButton(),
    el('div.card-scroll', {},
      el('div.card-title', {}, C.title),
      at === 0 ? el('p.chronicle-intro', {}, C.intro) : null,
      pageOf(parts[at].id, parts[at].entries)),
    el('div.chronicle-turn', {},
      el('button.chronicle-prev', { type: 'button', disabled: at === 0, onclick: turn(at - 1) }, C.prev),
      el('span.chronicle-page', {}, fill(C.page, { n: at + 1, all: parts.length })),
      el('button.chronicle-next', { type: 'button', disabled: at === parts.length - 1, onclick: turn(at + 1) }, C.next)));
  replaceOpen(card);
}

/** The day a thing came, as the reader says dates; or, for a postcard from before the record, that. */
const dayOf = (date: string | null) => {
  if (!date) return strings.ui.chronicle.undated;
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(y, m - 1, d));
};
const nameOf = (who: string) => (GUEST_IDS.includes(who as GuestId) ? strings.guests[who as GuestId] : strings.actors[who as keyof typeof strings.actors]);

function pageOf(part: ChroniclePart, entries: ChronicleEntry[]): HTMLElement {
  const C = strings.ui.chronicle;
  const seen = entries.filter((e) => e.date !== null).length;
  const blanks = part === 'postcards' ? entries.length === 0 : seen < entries.length;
  const head = el('h4.chronicle-part', {}, C.parts[part],
    part === 'postcards' ? null : el('span.chronicle-count', {}, fill(C.count, { n: seen, all: entries.length })));
  const hint = blanks ? el('p.chronicle-hint', {}, C.hints[part]) : null;
  let rows: HTMLElement[];
  if (part === 'year' || part === 'stories' || part === 'staff') {
    const chapter = (e: ChronicleEntry) => e.date === null
      ? el('div.chronicle-blank', { 'data-id': e.id }, fill(strings.ui.notebook.storyBlank, { n: e.n! }))
      : (() => {
          const c = toldChapter(part, e.who!, e.n!);
          return el('details.chronicle-entry.chronicle-chapter', { 'data-id': e.id },
            el('summary', {}, fill(strings.ui.notebook.storyChapter, { n: e.n!, title: c.title }), el('span.chronicle-date', {}, dayOf(e.date))),
            ...c.lines);
        })();
    // The neighbours' and the staff's stories go teller by teller; the year is one story.
    const tellers = part === 'year' ? [null] : [...new Set(entries.map((e) => e.who!))];
    rows = tellers.map((who) => el('div.chronicle-teller', who ? { 'data-who': who } : {},
      who ? el('b', {}, nameOf(who)) : null, ...entries.filter((e) => !who || e.who === who).map(chapter)));
  } else if (part === 'postcards') {
    rows = entries.map((e) => el('div.chronicle-entry', { 'data-id': e.id },
      el('span', {}, fill(C.postcard, { name: e.who!, shop: strings.ui.town.shops[e.home!] })), el('span.chronicle-date', {}, dayOf(e.date))));
  } else {
    const name = (e: ChronicleEntry) => part === 'holidays'
      ? C.holidays[e.id as Holiday]
      : e.id.startsWith('street-') ? C.street[e.id.slice(7) as keyof typeof C.street] : strings.growth[e.id as keyof typeof strings.growth];
    const dated = entries.filter((e) => e.date !== null).map((e) =>
      el('div.chronicle-entry', { 'data-id': e.id }, el('span', {}, name(e)), el('span.chronicle-date', {}, dayOf(e.date))));
    // A festival is no secret, only whether the shop was open for it. What grows is kept back until it does: an empty
    // slot each, in a row.
    const blank = entries.filter((e) => e.date === null);
    rows = part === 'holidays'
      ? entries.map((e) => (e.date !== null ? dated.shift()! : el('div.chronicle-blank', { 'data-id': e.id }, `${name(e)} · ${C.blank}`)))
      : [...dated, blank.length ? el('div.chronicle-slots', {}, ...blank.map((e) =>
          el('span.chronicle-blank.chronicle-slot', { 'data-id': e.id, title: C.blank, 'aria-label': C.blank, role: 'img' }))) : null].filter((x): x is HTMLElement => !!x);
  }
  return el('section.chronicle-page-body', {}, head, hint, ...rows);
}
