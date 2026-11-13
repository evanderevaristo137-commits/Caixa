import { describe, expect, it } from 'vitest';
import { BUSINESS_TYPES, CATALOG } from './catalog';
import {
  canonicalCategory,
  catalogCategory,
  catalogFor,
  categoriesOf,
  categoryKey,
  categoryLabel,
  categoryTree,
  cleanCategory,
  inCategory,
  NO_CATEGORY,
  salesByCategory,
  searchCategories,
  subsFor,
} from './categories';

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

describe("the app's list of categories", () => {
  it('is tidy: short names, no repeats, and every kind of shop points to categories that exist', () => {
    const names = CATALOG.map((c) => categoryKey(c.name));
    expect(new Set(names).size).toBe(names.length);
    for (const c of CATALOG) {
      expect(c.name.length).toBeLessThanOrEqual(40);
      expect(c.icon).not.toBe('');
      const subs = c.subs.map((x) => categoryKey(x.name));
      expect(new Set(subs).size).toBe(subs.length);
      for (const x of c.subs) expect(x.name.length).toBeLessThanOrEqual(40);
    }
    for (const b of BUSINESS_TYPES) for (const n of b.categories) expect(catalogCategory(n)?.name).toBe(n);
  });

  it('shows first the categories of the kinds of shop chosen (all of them when none), without repeats', () => {
    expect(catalogFor(['auto']).map((c) => c.name)).toEqual(['Peças e acessórios auto', 'Ferragens e construção']);
    expect(catalogFor([])).toHaveLength(CATALOG.length);
    const both = catalogFor(['grocery', 'pharmacy']).map((c) => c.name);
    expect(new Set(both).size).toBe(both.length);
    expect(both.slice(0, 2)).toEqual(['Alimentação e mercearia', 'Bebidas']);
    expect(both).toContain('Saúde e farmácia');
  });

  it('finds by any word, without accents or capitals, in the shop’s own categories too', () => {
    const tree = categoryTree([
      { category: 'Peças Toyota', subcategory: 'Hilux' },
      { category: 'Bebidas', subcategory: 'Kissangua' },
    ]);
    expect(searchCategories('capa', tree)[0]).toEqual({ category: 'Telemóveis e electrónica', sub: 'Capas e películas' });
    expect(searchCategories('PNEU', tree)[0]).toEqual({ category: 'Peças e acessórios auto', sub: 'Pneus' });
    // A word people use, not in the name.
    expect(searchCategories('gasosa', tree)).toContainEqual({ category: 'Bebidas', sub: 'Refrigerantes e sumos' });
    expect(searchCategories('electronica', tree)).toContainEqual({ category: 'Telemóveis e electrónica' });
    expect(searchCategories('toyota', tree)).toEqual([{ category: 'Peças Toyota' }]);
    expect(searchCategories('kissangua', tree)).toEqual([{ category: 'Bebidas', sub: 'Kissangua' }]);
    expect(searchCategories('c', tree)).toEqual([]);
  });

  it('offers the shop’s own subcategories first, then the app’s, and lists the shop’s tree in order', () => {
    const tree = categoryTree([
      { category: 'Bebidas', subcategory: 'Kissangua' },
      { category: 'Bebidas', subcategory: 'Cerveja' },
      { category: 'Bebidas' },
      { category: 'Arquivada', archivedAt: '2026-11-01T10:00:00.000Z' },
    ]);
    expect(tree).toEqual([{ name: 'Bebidas', subs: ['Cerveja', 'Kissangua'] }]);
    const subs = subsFor('bebidas', tree);
    expect(subs.slice(0, 3)).toEqual(['Cerveja', 'Kissangua', 'Água']);
    expect(subs.filter((x) => x === 'Cerveja')).toHaveLength(1);
    expect(subsFor('Peças Toyota', tree)).toEqual([]);
    expect(categoryLabel('Bebidas', 'Cerveja')).toBe('Bebidas › Cerveja');
  });
});
