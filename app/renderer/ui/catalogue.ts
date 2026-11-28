import { conditionOf, dueOn, onLoan, readBooks, type BookId, type Cubby, type Loan } from '../../shared/books';
import { fill, locale, strings } from '../../shared/i18n';
import { spineOf } from '../game/BookCase';
import { el } from './dom';
import { closeButton, replaceOpen } from './panels';

/**
 * The bookshop's catalogue (plan-2.0.md J13): a page to each cubby of the bookcase, what it is about, the book list that
 * filled it and when, and its four books, each of which can be taken home while nothing else is out.
 */
export const bookName = (id: BookId): { title: string; author: string } =>
  (strings.ui.books.titles as Record<string, { title: string; author: string }>)[id];

/** A day as the reader says dates, month and day: 3月10日, or 10 March. */
const dayText = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(), { month: 'long', day: 'numeric' }).format(new Date(y, m - 1, d));
};

export type CatalogueAt = {
  cubbies: Cubby[];
  loans: readonly Loan[];
  /** The page to open on, counted from 0: a cubby's place. */
  page?: number;
  onBorrow: (book: BookId, page: number) => void;
};

/** The cubby a book is in, if it is on the shelf. */
export const pageOf = (cubbies: Cubby[], book: BookId): number => Math.max(0, cubbies.findIndex((c) => c.books.includes(book)));

export function showCatalogue(at: CatalogueAt) {
  const B = strings.ui.books;
  const loan = onLoan(at.loans);
  const read = readBooks(at.loans);
  let page = Math.min(Math.max(0, at.page ?? 0), Math.max(0, at.cubbies.length - 1));
  const body = el('div.catalogue-page', {});
  const count = el('span.catalogue-count', {});
  const prev = el('button.catalogue-prev', { type: 'button' }, B.prev) as HTMLButtonElement;
  const next = el('button.catalogue-next', { type: 'button' }, B.next) as HTMLButtonElement;

  const row = (book: BookId) => {
    const { title, author } = bookName(book);
    const out = loan?.book === book;
    const action = out
      ? el('span.book-lent', {}, fill(B.lent, { day: dayText(dueOn(loan)) }))
      : loan
        ? null
        : el('button.book-borrow', { type: 'button', 'data-book': book }, B.borrow);
    action?.addEventListener('click', () => at.onBorrow(book, page));
    return el('li.book-row', { 'data-book': book, ...(out ? { 'data-lent': 'true' } : {}), ...(read.has(book) ? { 'data-read': 'true' } : {}) },
      el('span.book-spine', { style: `background:#${spineOf(book).color.toString(16).padStart(6, '0')}` }),
      el('span.book-text', {},
        el('span.book-title', {}, title),
        el('span.book-by', {}, `${author} · ${B.condition[conditionOf(book)]}`),
        read.has(book) ? el('span.book-read', {}, B.read) : null),
      action);
  };

  const draw = () => {
    body.replaceChildren();
    const cubby = at.cubbies[page];
    if (!cubby) {
      body.append(el('p.catalogue-empty', {}, B.empty));
      count.textContent = '';
      prev.hidden = next.hidden = true;
      return;
    }
    body.append(
      el('h4.catalogue-cubby', {}, fill(B.cubby, { n: page + 1, topic: B.topics[cubby.topic] })),
      el('p.catalogue-from', {}, fill(B.from, { title: cubby.title, day: dayText(cubby.day) })),
      el('ul.catalogue-books', {}, ...cubby.books.map(row)),
    );
    if (loan && !cubby.books.includes(loan.book)) body.append(el('p.catalogue-busy', {}, fill(B.busy, { title: bookName(loan.book).title })));
    count.textContent = fill(B.page, { n: page + 1, of: at.cubbies.length });
    prev.disabled = page === 0;
    next.disabled = page === at.cubbies.length - 1;
  };
  prev.addEventListener('click', () => { page = Math.max(0, page - 1); draw(); });
  next.addEventListener('click', () => { page = Math.min(at.cubbies.length - 1, page + 1); draw(); });
  draw();

  replaceOpen(el('div.card.paper.catalogue-card', {},
    closeButton(),
    el('div.card-scroll', {},
      el('div.card-title', {}, B.title),
      el('p.catalogue-intro', {}, B.intro),
      body,
      el('div.catalogue-turn', {}, prev, count, next))));
}
