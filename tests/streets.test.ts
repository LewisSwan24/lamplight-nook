import { describe, expect, it } from 'vitest';
import town from '../assets/sprites/town.json';
import { SHOP_STREET, STREETS, shopsOn, streetOf, type ShopId } from '../app/shared/town';

// plan-2.0.md J0: the town has two streets, and the river street has two shops of its own.
describe('two streets', () => {
  it('has the main street and the river street', () => {
    expect(STREETS).toEqual(['main', 'river']);
  });

  it('keeps every shop already on the street where it is', () => {
    for (const f of town.fronts) expect(streetOf(f.id as ShopId)).toBe('main');
    expect(shopsOn('main')).toEqual(town.fronts.map((f) => f.id));
  });

  it('puts the florist and the bookshop on the river street, the florist nearer the bridge', () => {
    expect(streetOf('flowershop')).toBe('river');
    expect(streetOf('bookshop')).toBe('river');
    expect(shopsOn('river')).toEqual(['flowershop', 'bookshop']);
  });

  it('gives every shop exactly one street', () => {
    const all = STREETS.flatMap(shopsOn);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.keys(SHOP_STREET).sort());
  });
});
