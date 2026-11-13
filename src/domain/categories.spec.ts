import { describe, expect, it } from 'vitest';
import { BUSINESS_TYPES, CATALOG } from './catalog';
import {
  ALL_CATEGORIES,
  canonicalCategory,
  catalogCategory,
  catalogFor,
  categoriesOf,
  categoryKey,
  categoryLabel,
  categoryTree,
  cleanCategory,
  inCategory,
  inFilter,
  NO_CATEGORY,
  salesByCategory,
  searchCategories,
  subsFor,
  type CategoryFilter,
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
      ['agua', { category: 'Bebidas' }],
      ['arroz', { category: 'Mercearia' }],
      ['feijao', { category: 'Mercearia' }],
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
      { category: 'Mercearia', salesCents: 190_000, profitCents: 15_000, costedSalesCents: 70_000, subs: [] },
      { category: 'Bebidas', salesCents: 60_000, profitCents: 18_000, costedSalesCents: 60_000, subs: [] },
      { category: NO_CATEGORY, salesCents: 30_000, profitCents: 0, costedSalesCents: 0, subs: [] },
    ]);
  });

  it('splits a category by subcategory once its products have one (the others apart)', () => {
    const placeOf = new Map([
      ['capa', { category: 'Telemóveis e electrónica', subcategory: 'Capas e películas' }],
      ['cabo', { category: 'Telemóveis e electrónica', subcategory: 'Carregadores e cabos' }],
      ['radio', { category: 'Telemóveis e electrónica' }],
    ]);
    const sales = [
      {
        items: [
          { productId: 'capa', quantity: 2, lineTotalCents: 300_000, unitCostCents: 100_000 },
          { productId: 'cabo', quantity: 1, lineTotalCents: 150_000 },
          { productId: 'radio', quantity: 1, lineTotalCents: 500_000 },
        ],
      },
    ];
    expect(salesByCategory(sales, placeOf)).toEqual([
      {
        category: 'Telemóveis e electrónica',
        salesCents: 950_000,
        profitCents: 100_000,
        costedSalesCents: 300_000,
        subs: [
          { sub: NO_CATEGORY, salesCents: 500_000, profitCents: 0, costedSalesCents: 0 },
          { sub: 'Capas e películas', salesCents: 300_000, profitCents: 100_000, costedSalesCents: 300_000 },
          { sub: 'Carregadores e cabos', salesCents: 150_000, profitCents: 0, costedSalesCents: 0 },
        ],
      },
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

describe('showing one category, and one subcategory inside it', () => {
  it('filters by category, then by subcategory (or the ones without)', () => {
    const products = [
      { name: 'Capa', category: 'Telemóveis e electrónica', subcategory: 'Capas e películas' },
      { name: 'Cabo', category: 'Telemóveis e electrónica', subcategory: 'Carregadores e cabos' },
      { name: 'Rádio', category: 'Telemóveis e electrónica' },
      { name: 'Pneu', category: 'Peças e acessórios auto', subcategory: 'Pneus' },
      { name: 'Vela' },
    ];
    const names = (f: CategoryFilter) => products.filter((p) => inFilter(p, f)).map((p) => p.name);
    expect(names(ALL_CATEGORIES)).toHaveLength(5);
    expect(names({ category: 'Telemóveis e electrónica', sub: null })).toEqual(['Capa', 'Cabo', 'Rádio']);
    expect(names({ category: 'Telemóveis e electrónica', sub: 'Capas e películas' })).toEqual(['Capa']);
    expect(names({ category: 'Telemóveis e electrónica', sub: NO_CATEGORY })).toEqual(['Rádio']);
    expect(names({ category: NO_CATEGORY, sub: null })).toEqual(['Vela']);
  });
});
