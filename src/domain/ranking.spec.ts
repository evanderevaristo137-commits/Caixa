import { describe, expect, it } from 'vitest';
import { byName, salesFrequency, sortByFrequency } from './ranking';

const item = (productId: string) => ({ productId, name: productId, unitPriceCents: 1, quantity: 1, lineTotalCents: 1 });

describe('ranking', () => {
  it('sorts names the Portuguese way', () => {
    const names = ['Óleo', 'Zimbo', 'Água', 'arroz', 'Batata'].map((name) => ({ name }));
    expect(names.sort(byName).map((n) => n.name)).toEqual(['Água', 'arroz', 'Batata', 'Óleo', 'Zimbo']);
  });

  it('counts each product once per sale and ignores voided sales', () => {
    const freq = salesFrequency([
      { items: [item('a'), item('a'), item('b')] },
      { items: [item('a')] },
      { items: [item('b'), item('c')], voidedAt: '2026-11-06T10:00:00Z' },
    ]);
    expect(freq.get('a')).toBe(2);
    expect(freq.get('b')).toBe(1);
    expect(freq.get('c')).toBeUndefined();
  });

  it('puts best sellers first, then alphabetical', () => {
    const products = [
      { id: 'a', name: 'Sal' },
      { id: 'b', name: 'Arroz' },
      { id: 'c', name: 'Óleo' },
      { id: 'd', name: 'Água' },
    ];
    const freq = new Map([
      ['c', 5],
      ['a', 5],
      ['b', 1],
    ]);
    expect(sortByFrequency(products, freq).map((p) => p.name)).toEqual(['Óleo', 'Sal', 'Arroz', 'Água']);
    expect(sortByFrequency(products, undefined).map((p) => p.name)).toEqual(['Água', 'Arroz', 'Óleo', 'Sal']);
  });
});
