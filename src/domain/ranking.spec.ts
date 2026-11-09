import { describe, expect, it } from 'vitest';
import { byName, parseRanking, salesFrequency, serialiseRanking, sortByFrequency } from './ranking';

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

describe('saved ranking', () => {
  it('keeps the best sellers first and reads back only what is valid', () => {
    const freq = new Map([
      ['a', 2],
      ['b', 9],
      ['c', 5],
    ]);
    const text = serialiseRanking(freq);
    expect(JSON.parse(text)).toEqual([
      ['b', 9],
      ['c', 5],
      ['a', 2],
    ]);
    expect(parseRanking(text)).toEqual(
      new Map([
        ['b', 9],
        ['c', 5],
        ['a', 2],
      ]),
    );
    expect(parseRanking('[["x", 1], [2, 3], "y", ["z"]]')).toEqual(new Map([['x', 1]]));
    expect(parseRanking('{oops')).toBeNull();
    expect(parseRanking(null)).toBeNull();
    expect(JSON.parse(serialiseRanking(new Map(Array.from({ length: 400 }, (_, i) => [`p${i}`, i]))))).toHaveLength(300);
  });
});
