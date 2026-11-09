import { describe, expect, it } from 'vitest';
import { canonicalCategory, categoriesOf, cleanCategory, inCategory, NO_CATEGORY, salesByCategory } from './categories';

describe('categories', () => {
  it('tidies what is typed and reuses the spelling the shop already has', () => {
    expect(cleanCategory('  Higiene   e limpeza ')).toBe('Higiene e limpeza');
    expect(cleanCategory('   ')).toBeUndefined();
    expect(cleanCategory('x'.repeat(50))).toHaveLength(40);
    const known = ['Bebidas', 'Mercearia'];
    expect(canonicalCategory('bebidas', known)).toBe('Bebidas');
    expect(canonicalCategory(' BEBÍDAS ', known)).toBe('Bebidas');
    expect(canonicalCategory('Frescos', known)).toBe('Frescos');
    expect(canonicalCategory('', known)).toBeUndefined();
  });

  it('lists the categories in use and filters by them', () => {
    const products = [
      { category: 'Mercearia' },
      { category: 'Bebidas' },
      { category: 'Mercearia' },
      {},
      { category: 'Ácaros', archivedAt: '2026-11-01' },
    ];
    expect(categoriesOf(products)).toEqual(['Bebidas', 'Mercearia']);
    expect(products.filter((p) => inCategory(p, 'Mercearia'))).toHaveLength(2);
    expect(products.filter((p) => inCategory(p, NO_CATEGORY))).toHaveLength(1);
    expect(products.filter((p) => inCategory(p, null))).toHaveLength(5);
  });

  it('adds up sales and profit by category, without voided sales', () => {
    const categoryOf = new Map([
      ['agua', 'Bebidas'],
      ['arroz', 'Mercearia'],
      ['feijao', 'Mercearia'],
    ]);
    const sales = [
      {
        items: [
          { productId: 'agua', quantity: 2, lineTotalCents: 60_000, unitCostCents: 21_000 },
          { productId: 'arroz', quantity: 1, lineTotalCents: 120_000 },
          { productId: 'feijao', quantity: 500, soldBy: 'weight' as const, lineTotalCents: 70_000, unitCostCents: 110_000 },
          { productId: 'velas', quantity: 3, lineTotalCents: 30_000 },
        ],
      },
      { voidedAt: '2026-11-09T10:00:00.000Z', items: [{ productId: 'agua', quantity: 10, lineTotalCents: 300_000 }] },
    ];
    expect(salesByCategory(sales, categoryOf)).toEqual([
      // Rice has no cost price: its sales count, but not in the profit.
      { category: 'Mercearia', salesCents: 190_000, profitCents: 15_000, costedSalesCents: 70_000 },
      { category: 'Bebidas', salesCents: 60_000, profitCents: 18_000, costedSalesCents: 60_000 },
      { category: NO_CATEGORY, salesCents: 30_000, profitCents: 0, costedSalesCents: 0 },
    ]);
  });
});
