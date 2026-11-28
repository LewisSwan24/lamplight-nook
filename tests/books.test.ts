import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import {
  BOOKS, BOOK_IDS, CUBBIES, LOAN_DAYS, PER_CUBBY, TOPICS, dueOn, isDue, onLoan, readBooks, shelfOf, topicOf, withLoan, withReturn,
  type ListWork, type Loan,
} from '../app/shared/books';
import { LOCALES } from '../app/shared/i18n';
import { emptyTown, TOWN_MOVE } from '../app/shared/town';
import { lintChats, lintLines, parseChats, parseLines } from '../app/renderer/translator/lines';

// plan-2.0.md J13: the bookshop's big bookcase, four rows of four cubbies. Each book list made fills the next cubby with
// four old books on its subject, worked out from the lists alone. One of them can be borrowed at a time and sits on the
// shelf at home; a week later Uncle Page comes round for it.

const list = (n: number, want: string, title = `List ${n}`): ListWork => ({ id: `c${1760000000000 + n * 86400000}`, title, date: `2027-03-${String(n).padStart(2, '0')}`, want });

describe('the books', () => {
  it('are eight on each of ten subjects, each named in both languages', () => {
    expect(TOPICS).toHaveLength(10);
    expect(new Set(BOOK_IDS).size).toBe(BOOKS.length);
    for (const t of TOPICS) expect(BOOKS.filter((b) => b.topic === t), t).toHaveLength(8);
    for (const lang of ['zh-CN', 'en'] as const) {
      const B = LOCALES[lang].ui.books;
      for (const t of TOPICS) expect(B.topics[t], `${lang} ${t}`).toBeTruthy();
      const titles = B.titles as Record<string, { title: string; author: string } | undefined>;
      for (const id of BOOK_IDS) {
        expect(titles[id]?.title, `${lang} ${id}`).toBeTruthy();
        expect(titles[id]?.author, `${lang} ${id}`).toBeTruthy();
      }
    }
  });
});

describe('what a list is about', () => {
  it('goes by the subject before who it is for', () => {
    expect(topicOf('帮我开一份书单，给十岁孩子，想读历史方面的书')).toBe('history');
    expect(topicOf('Some poems for my gran')).toBe('poetry');
    expect(topicOf('给八岁小朋友的睡前书')).toBe('children');
    expect(topicOf('books on cooking and tea')).toBe('food');
    expect(topicOf('想看看宇宙和物理')).toBe('science');
  });
  it('is nothing in particular when no subject is named', () => {
    expect(topicOf('随便来几本')).toBeNull();
    expect(topicOf('')).toBeNull();
  });
});

describe('the bookcase', () => {
  it('is empty with no lists made', () => {
    expect(shelfOf([])).toEqual([]);
  });
  it('fills a cubby a list, with four books on its subject, oldest list first', () => {
    const shelf = shelfOf([list(2, '想读点自然方面的书'), list(1, '历史书')]);
    expect(shelf.map((c) => c.topic)).toEqual(['history', 'nature']);
    expect(shelf[0]).toMatchObject({ work: list(1, '').id, title: 'List 1', day: '2027-03-01' });
    for (const c of shelf) {
      expect(c.books).toHaveLength(PER_CUBBY);
      for (const b of c.books) expect(BOOKS.find((x) => x.id === b)?.topic).toBe(c.topic);
    }
  });
  it('never puts the same book in twice, and takes from the next subject once one runs out', () => {
    const shelf = shelfOf([list(1, 'history'), list(2, 'history'), list(3, 'history')]);
    expect(shelf.map((c) => c.topic)).toEqual(['history', 'history', 'history']);
    const all = shelf.flatMap((c) => c.books);
    expect(new Set(all).size).toBe(all.length);
    expect(shelf[2].books.every((b) => BOOKS.find((x) => x.id === b)?.topic !== 'history')).toBe(true);
  });
  it('takes the subjects in turn for lists about nothing in particular', () => {
    const shelf = shelfOf([list(1, 'anything'), list(2, 'whatever you like')]);
    expect(shelf.map((c) => c.topic)).toEqual([TOPICS[0], TOPICS[1]]);
  });
  it('reads the title too when the request says nothing', () => {
    expect(shelfOf([{ ...list(1, ''), want: undefined, title: '旅行书单' }])[0].topic).toBe('travel');
  });
  it('keeps every list, though the case shows only the first sixteen', () => {
    const lists = Array.from({ length: CUBBIES + 3 }, (_, i) => list(i + 1, 'anything'));
    const shelf = shelfOf(lists);
    expect(shelf).toHaveLength(CUBBIES + 3);
    const all = shelf.flatMap((c) => c.books);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('borrowing', () => {
  const day = '2027-03-10';
  it('lends one book at a time', () => {
    const one = withLoan([], 'walden', day);
    expect(onLoan(one)).toEqual({ book: 'walden', day });
    expect(withLoan(one, 'odyssey', day)).toBe(one);
  });
  it('is due a week after', () => {
    const loan: Loan = { book: 'walden', day };
    expect(dueOn(loan)).toBe('2027-03-17');
    expect(LOAN_DAYS).toBe(7);
    expect(isDue(loan, '2027-03-16')).toBe(false);
    expect(isDue(loan, '2027-03-17')).toBe(true);
  });
  it('remembers what came back', () => {
    const back = withReturn(withLoan([], 'walden', day), '2027-03-17');
    expect(onLoan(back)).toBeNull();
    expect([...readBooks(back)]).toEqual(['walden']);
    expect(onLoan(withLoan(back, 'odyssey', '2027-03-18'))?.book).toBe('odyssey');
  });
});

describe('the shop keeps its loans', () => {
  it('writes the loan down and the day it came back', () => {
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-books-')), 'memory.json'));
    (store as unknown as { data: { shop: unknown } }).data.shop = { done: 1, grown: [], told: [TOWN_MOVE], town: emptyTown() };
    store.borrowBook('walden', new Date('2027-03-10T10:00:00'));
    expect(store.shopState(new Date('2027-03-10T10:00:00')).town?.loans).toEqual([{ book: 'walden', day: '2027-03-10' }]);
    store.returnBook(new Date('2027-03-17T10:00:00'));
    expect(store.shopState(new Date('2027-03-17T10:00:00')).town?.loans).toEqual([{ book: 'walden', day: '2027-03-10', back: '2027-03-17' }]);
  });
});

describe('what they say', () => {
  for (const [lang, dir] of [['zh-CN', 'lines'], ['en', 'lines/en']] as const) {
    it(`Uncle Page lends by the writing rules, in ${lang}`, () => {
      const lib = parseLines(readFileSync(`${dir}/bookshop.yaml`, 'utf8'));
      expect(lib.lend?.length).toBeGreaterThanOrEqual(3);
      for (const l of lib.lend!) expect(l.speaker).toBe('jianbo');
      expect(lintLines({ lend: lib.lend! }, LOCALES[lang])).toEqual([]);
    });
    it(`Uncle Page comes for his book by the writing rules, in ${lang}`, () => {
      const chats = parseChats(readFileSync(`${dir}/book-loans.yaml`, 'utf8'));
      expect(chats.length).toBeGreaterThanOrEqual(4);
      expect(lintChats(chats, LOCALES[lang])).toEqual([]);
      for (const c of chats) {
        expect(c.guest, c.id).toBe('bookseller');
        expect(c.turns[0].speaker, c.id).toBe('bookseller');
      }
    });
  }
  it('has the same exchanges in both languages', () => {
    const ids = (file: string) => parseChats(readFileSync(file, 'utf8')).map((c) => c.id);
    expect(ids('lines/en/book-loans.yaml')).toEqual(ids('lines/book-loans.yaml'));
  });
});
