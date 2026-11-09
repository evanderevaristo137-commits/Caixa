import { describe, expect, it } from 'vitest';
import { countLines, emptyCount, parseCountDraft, setCount, summariseCount, valueAtCost } from './stock-count';
import type { Product } from './types';

const product = (p: Partial<Product> & Pick<Product, 'id' | 'name' | 'stock'>): Product => ({
  priceCents: 100_000,
  minStock: 0,
  createdAt: '',
  updatedAt: '',
  ...p,
});

const now = new Date('2026-11-09T09:00:00Z');

describe('stock count', () => {
  const cerveja = product({ id: 'cerveja', name: 'Cerveja 330 ml', stock: 60, costCents: 37_000 });
  const feijao = product({ id: 'feijao', name: 'Feijão a granel', stock: 3_500, costCents: 110_000, soldBy: 'weight' });
  const velas = product({ id: 'velas', name: 'Velas', stock: 10 });
  const agua = product({ id: 'agua', name: 'Água 1,5 L', stock: 40, costCents: 21_000 });

  it('compares each count with what the app had when the product was counted', () => {
    let draft = emptyCount(now);
    draft = setCount(draft, cerveja, 55);
    draft = setCount(draft, feijao, 4_000);
    draft = setCount(draft, velas, 7);
    draft = setCount(draft, agua, 40);
    // Two beers are sold after they were counted: the difference stays −5, not −3.
    const afterSale = [{ ...cerveja, stock: 58 }, feijao, velas, agua];
    const s = summariseCount(draft, afterSale);
    expect(s.counted).toBe(4);
    expect(s.differences.map((d) => [d.product.name, d.expected, d.counted, d.delta, d.valueCents])).toEqual([
      ['Cerveja 330 ml', 60, 55, -5, -185_000],
      ['Velas', 10, 7, -3, undefined],
      ['Feijão a granel', 3_500, 4_000, 500, 55_000],
    ]);
    expect([s.missingCents, s.surplusCents, s.withoutCost]).toEqual([185_000, 55_000, 1]);
  });

  it('forgets a count when the field is cleared, and leaves out archived products', () => {
    let draft = setCount(setCount(emptyCount(now), cerveja, 50), agua, 39);
    draft = setCount(draft, agua, null);
    expect(Object.keys(draft.lines)).toEqual(['cerveja']);
    const archived = [{ ...cerveja, archivedAt: '2026-11-09T10:00:00Z' }];
    expect(summariseCount(draft, archived).counted).toBe(0);
    expect(countLines(draft, archived)).toEqual([]);
    expect(countLines(draft, [cerveja])).toEqual([{ productId: 'cerveja', counted: 50, expected: 60 }]);
  });

  it('values differences at cost price, by the kilo for weighed products', () => {
    expect(valueAtCost(cerveja, -2)).toBe(-74_000);
    expect(valueAtCost(feijao, 250)).toBe(27_500);
    expect(valueAtCost(velas, 1)).toBeUndefined();
  });

  it('reads back a saved count and drops what is damaged', () => {
    const draft = setCount(emptyCount(now), cerveja, 55);
    expect(parseCountDraft(JSON.stringify(draft))).toEqual(draft);
    expect(
      parseCountDraft(
        JSON.stringify({
          startedAt: 'x',
          lines: { a: { counted: -1, expected: 2 }, b: { counted: 1.5, expected: 1 }, c: { counted: 3, expected: 2 } },
        }),
      ),
    ).toEqual({ startedAt: 'x', lines: { c: { counted: 3, expected: 2 } } });
    expect(parseCountDraft('{oops')).toBeNull();
    expect(parseCountDraft(null)).toBeNull();
    expect(parseCountDraft('[1]')).toBeNull();
  });
});
