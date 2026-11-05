import { describe, expect, it } from 'vitest';
import { byMonth, filterWorks, kindsOf } from '../app/shared/shelf';
import { setLocale } from '../app/shared/i18n';
import type { WorkIcon } from '../app/shared/growth';

const work = (title: string, date = '2026-03-01', icon: WorkIcon = 'page', want = '') => ({ id: title, title, date, icon, want });
const titles = (list: { title: string }[]) => list.map((w) => w.title);

describe('finding a work on the shelf', () => {
  const works = [
    work('记账小页面', '2026-03-09', 'page', '帮我做一个记账小页面'),
    work('Bakery winter numbers', '2026-02-11', 'sheet', 'Look into why the bakery loses money'),
    work('婚礼相册', '2025-12-30', 'album'),
  ];

  it('shows everything when nothing is asked', () => {
    expect(titles(filterWorks(works, { query: '  ', kind: null }))).toEqual(titles(works));
  });

  it('finds part of a title, whatever the case', () => {
    expect(titles(filterWorks(works, { query: 'WINTER', kind: null }))).toEqual(['Bakery winter numbers']);
    expect(titles(filterWorks(works, { query: '相册', kind: null }))).toEqual(['婚礼相册']);
  });

  it('finds what was asked for, not only what it came to be called', () => {
    expect(titles(filterWorks(works, { query: 'loses money', kind: null }))).toEqual(['Bakery winter numbers']);
  });

  it('wants every word, in any order', () => {
    expect(titles(filterWorks(works, { query: 'numbers bakery', kind: null }))).toEqual(['Bakery winter numbers']);
    expect(filterWorks(works, { query: 'bakery wedding', kind: null })).toEqual([]);
  });

  it('finds by the month', () => {
    expect(titles(filterWorks(works, { query: '2026-02', kind: null }))).toEqual(['Bakery winter numbers']);
  });

  it('finds a month the way the shelf writes it', () => {
    const months = [work('Feb', '2026-02-11'), work('Dec', '2025-12-30')];
    setLocale('en');
    expect(titles(filterWorks(months, { query: 'february', kind: null }))).toEqual(['Feb']);
    expect(titles(filterWorks(months, { query: 'dec 2025', kind: null }))).toEqual(['Dec']);
    setLocale('zh-CN');
    expect(titles(filterWorks(months, { query: '2月', kind: null }))).toEqual(['Feb']);
    expect(titles(filterWorks(months, { query: '2025 12月', kind: null }))).toEqual(['Dec']);
  });

  it('reads full-width letters as the same letters', () => {
    expect(titles(filterWorks(works, { query: 'ＢＡＫＥＲＹ', kind: null }))).toEqual(['Bakery winter numbers']);
  });

  it('keeps to one kind, together with the words', () => {
    expect(titles(filterWorks(works, { query: '', kind: 'album' }))).toEqual(['婚礼相册']);
    expect(filterWorks(works, { query: 'bakery', kind: 'album' })).toEqual([]);
  });
});

describe('the kinds on the shelf', () => {
  it('counts only what is there, in the shelf\'s own order', () => {
    const kinds = kindsOf([work('a', '2026-01-01', 'album'), work('b', '2026-01-01', 'page'), work('c', '2026-01-01', 'album')]);
    expect(kinds).toEqual([{ kind: 'page', n: 1 }, { kind: 'album', n: 2 }]);
  });
});

describe('months on the shelf', () => {
  it('keeps the order it was given and starts a new month when the month changes', () => {
    const groups = byMonth([work('a', '2026-03-09'), work('b', '2026-03-01'), work('c', '2026-02-20'), work('d', '2025-02-20')]);
    expect(groups.map((g) => [g.month, titles(g.works)])).toEqual([
      ['2026-03', ['a', 'b']], ['2026-02', ['c']], ['2025-02', ['d']],
    ]);
  });
});
