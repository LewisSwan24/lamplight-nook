import { addDays } from './flowers';

/**
 * The bookshop's old books (plan-2.0.md J13). The big bookcase has four rows of four cubbies; each book list the shop
 * makes fills the next one with four books on the list's subject, which Uncle Page goes out and buys second-hand. What
 * is on the shelf is worked out from the lists alone, so only the loans are kept. One book at a time can be borrowed and
 * taken home; a week later Uncle Page comes round for it.
 *
 * The books are real ones; their titles and authors, in each language, are in the locales (`ui.books.titles`).
 */
export const TOPICS = ['history', 'nature', 'poetry', 'travel', 'food', 'science', 'novels', 'art', 'philosophy', 'children'] as const;
export type Topic = (typeof TOPICS)[number];

const SHELVES: Record<Topic, readonly string[]> = {
  history: ['shiji', 'wanli1587', 'gibbon', 'herodotus', 'thucydides', 'zizhi', 'chrysanthemum', 'glorydream'],
  nature: ['walden', 'silentspring', 'sandcounty', 'selborne', 'origin', 'solomonring', 'fabre', 'seawind'],
  poetry: ['tang300', 'songs', 'straybirds', 'leavesgrass', 'song300', 'renjian', 'odyssey', 'rubaiyat'],
  travel: ['xuxiake', 'marcopolo', 'xiyuji', 'ontheroad', 'donkey', 'eightydays', 'italianjourney', 'xiangxing'],
  food: ['suiyuan', 'physiologytaste', 'frenchcooking', 'beeton', 'yinshan', 'teaclassic', 'qimin', 'salt'],
  science: ['brieftime', 'tiangong', 'mengxi', 'selfishgene', 'cosmos', 'feynman', 'doublehelix', 'elements'],
  novels: ['redchamber', 'prideprejudice', 'quixote', 'bordertown', 'janeeyre', 'oldmansea', 'rickshaw', 'olivertwist'],
  art: ['storyofart', 'mustardseed', 'waysseeing', 'pathbeauty', 'vangogh', 'zhangwu', 'yuanye', 'vasari'],
  philosophy: ['analects', 'daodejing', 'zhuangzi', 'meditations', 'republic', 'montaigne', 'sophie', 'caigentan'],
  children: ['littleprince', 'charlotte', 'willows', 'alice', 'secretgarden', 'pooh', 'anne', 'scarecrow'],
};
export type BookId = string;
export type Book = { id: BookId; topic: Topic };
export const BOOKS: readonly Book[] = TOPICS.flatMap((topic) => SHELVES[topic].map((id) => ({ id, topic })));
export const BOOK_IDS: BookId[] = BOOKS.map((b) => b.id);
export const bookOf = (id: BookId): Book => BOOKS.find((b) => b.id === id)!;

/** Four rows of four cubbies, four books to a cubby. */
export const CUBBIES = 16;
export const PER_CUBBY = 4;
/** Uncle Page comes for a borrowed book this many days after it went home. */
export const LOAN_DAYS = 7;

/**
 * How a request names its subject, in either language, checked in this order: what it is about comes before who it is
 * for, so "history for a ten-year-old" is history. Latin words match at the start of a word.
 */
const WORDS: [Topic, string[]][] = [
  ['poetry', ['诗', '词', 'poem', 'poet', 'verse']],
  ['food', ['吃', '美食', '烹饪', '做饭', '菜谱', '食谱', '茶', '厨', 'food', 'cook', 'recipe', 'tea\\b', 'kitchen', 'baking']],
  ['travel', ['旅行', '游记', '旅游', '远方', '地理', 'travel', 'journey', 'trip', 'voyage']],
  ['history', ['历史', '朝代', '古代', '战争', '帝国', 'histor', 'wars?\\b', 'empire', 'ancient']],
  ['science', ['科学', '物理', '数学', '宇宙', '天文', '化学', '科普', 'scien', 'physics', 'math', 'universe', 'space', 'chemistry', 'astronom']],
  ['nature', ['自然', '植物', '动物', '鸟', '昆虫', '森林', '生态', '环境', 'nature', 'animal', 'bird', 'insect', 'plant', 'forest', 'wild', 'ecolog']],
  ['art', ['艺术', '画', '美术', '设计', '建筑', '摄影', 'arts?\\b', 'artist', 'paint', 'drawing', 'design', 'architect', 'photograph']],
  ['philosophy', ['哲学', '思考', '智慧', '人生', 'philosoph', 'wisdom', 'thinking']],
  ['novels', ['小说', '文学', '名著', 'novel', 'fiction', 'literature', 'classics?\\b']],
  ['children', ['孩子', '儿童', '小朋友', '童话', '绘本', '睡前', 'child', 'kid', 'year-old', 'bedtime', 'fairy']],
];
const MATCHERS: [Topic, RegExp][] = WORDS.map(([topic, words]) => [
  topic, new RegExp(words.map((w) => (/^[a-z]/.test(w) ? `\\b${w}` : w)).join('|'), 'i'),
]);

/** The subject a request names, or null when it names none. */
export function topicOf(text: string): Topic | null {
  return MATCHERS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** A finished book list, as the shelf of works has it. */
export type ListWork = { id: string; title: string; date: string; want?: string };
/** One cubby: what it is about, the list that filled it and when, and its four books. */
export type Cubby = { topic: Topic; work: string; title: string; day: string; books: BookId[] };

/**
 * The bookcase as the lists have filled it, oldest list first: each takes four books on its subject not already on
 * the shelf, then from the subjects after it once that one runs out. A list about nothing in particular takes the
 * subjects in turn, by its place on the shelf. Every list has its cubby here; the case itself shows the first sixteen.
 */
export function shelfOf(lists: readonly ListWork[]): Cubby[] {
  const used = new Set<BookId>();
  return [...lists]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((work, i) => {
      const topic = topicOf(`${work.want ?? ''} ${work.title}`) ?? TOPICS[i % TOPICS.length];
      const from = TOPICS.indexOf(topic);
      const books: BookId[] = [];
      for (let t = 0; t < TOPICS.length && books.length < PER_CUBBY; t++) {
        for (const id of SHELVES[TOPICS[(from + t) % TOPICS.length]]) {
          if (books.length === PER_CUBBY) break;
          if (!used.has(id)) books.push(id);
        }
      }
      for (const id of books) used.add(id);
      return { topic, work: work.id, title: work.title, day: work.date.slice(0, 10), books };
    });
}

/** A book taken home on `day`, and the day it went back. */
export type Loan = { book: BookId; day: string; back?: string };
/** The book out on loan now, if any. */
export const onLoan = (loans: readonly Loan[]): Loan | null => {
  const last = loans.at(-1);
  return last && !last.back ? last : null;
};
export const dueOn = (loan: Loan): string => addDays(loan.day, LOAN_DAYS);
export const isDue = (loan: Loan, today: string): boolean => today >= dueOn(loan);
/** One book at a time: while one is out, nothing else goes. */
export const withLoan = (loans: readonly Loan[], book: BookId, day: string): readonly Loan[] =>
  (onLoan(loans) ? loans : [...loans, { book, day }]);
/** The book out has come back on `day`. */
export const withReturn = (loans: readonly Loan[], day: string): Loan[] =>
  loans.map((l, i) => (i === loans.length - 1 && !l.back ? { ...l, back: day } : l));
/** Every book that has been home and back. */
export const readBooks = (loans: readonly Loan[]): Set<BookId> => new Set(loans.filter((l) => l.back).map((l) => l.book));

/** How worn a book is, the same each time: an index into the locale's `ui.books.condition`. */
export function conditionOf(book: BookId): number {
  let h = 0;
  for (const c of book) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}
