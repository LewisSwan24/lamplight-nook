import { describe, expect, it } from 'vitest';
import { roomDecor } from '../app/renderer/game/streetdecor';
import { crews } from '../app/shared/crew';
import { SHOPS, errandTo } from '../app/shared/dispatch';
import { finishOf, shopOf, template } from '../app/shared/templates';
import { ROOM_GROWTH, isStreetShop, roomPieceIds, townCounts, townNews } from '../app/shared/towngrow';
import type { CommissionMemo } from '../app/shared/types';

// plan-2.0.md J4: the flower shop and the bookshop take work of their own. Adeng carries the order over, as to the
// bakery and the post office; the keeper makes it, and the shop gathers its pieces.
describe('work sent to the river street', () => {
  it('has a kind of work for each: a flower card at the flower shop, a book list at the bookshop', () => {
    expect(SHOPS).toEqual(expect.arrayContaining(['flowershop', 'bookshop']));
    expect([shopOf('flowercard'), finishOf('flowercard')]).toEqual(['flowershop', 'flowershop']);
    expect([shopOf('booklist'), finishOf('booklist')]).toEqual(['bookshop', 'bookshop']);
    // The book list is what brings Uncle Page by to visit (J3).
    expect(template('booklist').guest).toBe('bookseller');
  });

  it('counts each shop’s work there, and the keeper on it', () => {
    const memo = (template: string) => ({ id: template, result: 'done', form: { template } }) as unknown as CommissionMemo;
    expect(crews([memo('flowercard'), memo('booklist')]).map((c) => c.crew)).toEqual([['adeng', 'fangjie'], ['adeng', 'jianbo']]);
    const counts = townCounts({ done: 5, town: { shops: { flowershop: { done: 2, grown: [] }, bookshop: { done: 1, grown: [] } }, street: [], stories: {} } }, 'cafe');
    expect(counts.shops).toMatchObject({ flowershop: 2, bookshop: 1, cafe: 2 });
  });

  it('gathers four pieces in each room, the ivy third, as the other shops along the street do', () => {
    for (const shop of ['flowershop', 'bookshop'] as const) {
      expect(isStreetShop(shop), shop).toBe(true);
      expect(ROOM_GROWTH[shop].map((g) => g.at), shop).toEqual([1, 3, 8, 20]);
      expect(ROOM_GROWTH[shop][1].id, shop).toBe('ivy');
    }
    expect(roomPieceIds('flowershop')).toContain('cardrack');
    expect(roomPieceIds('bookshop')).toContain('listboard');
  });

  it('sends the keeper across for a tool another shop keeps, as the bakery and the post office do', () => {
    expect(errandTo('flowershop', 'mcp__nook-office__make_pdf')).toBe('print');
    expect(errandTo('bookshop', 'mcp__nook-office__render_png')).toBe('studio');
  });

  it('says what grows inside, but nothing at the river fronts, which have no pieces drawn yet (J5)', () => {
    const at = (flowershop: number) => townCounts({ done: flowershop, town: { shops: { flowershop: { done: flowershop, grown: [] } }, street: [], stories: {} } }, 'cafe');
    const news = townNews(at(1), at(2)).concat(townNews(at(7), at(8)));
    expect(news.filter((n) => n.shop === 'flowershop')).toEqual([]);
    expect(townNews(at(0), at(1)).map((n) => n.line)).toContain(`grow_flowershop_${ROOM_GROWTH.flowershop[0].id}`);
  });

  it('keeps the cafe’s festival decorations in the river shops until they have their own (J5)', () => {
    expect(roomDecor('flowershop', 'christmas')).toEqual({ key: 'decor-christmas' });
    expect(roomDecor('bookshop', 'new_year')).toEqual({ key: 'decor-new_year' });
    expect(roomDecor('bakery', 'christmas')).toEqual({ key: 'shops-decor', frame: 'bakery-christmas' });
  });
});
