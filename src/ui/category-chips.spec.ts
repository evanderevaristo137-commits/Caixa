import { describe, expect, it } from 'vitest';
import { NO_CATEGORY } from '../domain/categories';
import { activeFilter } from './CategoryChips';

describe('the category filter kept on screen', () => {
  const products = [
    { category: 'Bebidas', subcategory: 'Cerveja' },
    { category: 'Bebidas' },
    { category: 'Diversos', subcategory: 'Velas', archivedAt: '2026-11-01T10:00:00.000Z' },
  ];
  it('keeps what exists and falls back to the whole category (or everything) when it no longer does', () => {
    expect(activeFilter(products, { category: 'Bebidas', sub: 'Cerveja' })).toEqual({ category: 'Bebidas', sub: 'Cerveja' });
    expect(activeFilter(products, { category: 'Bebidas', sub: NO_CATEGORY })).toEqual({ category: 'Bebidas', sub: NO_CATEGORY });
    expect(activeFilter(products, { category: 'Bebidas', sub: 'Vinhos e espirituosas' })).toEqual({ category: 'Bebidas', sub: null });
    // Its only product was archived: the whole list.
    expect(activeFilter(products, { category: 'Diversos', sub: 'Velas' })).toEqual({ category: null, sub: null });
  });
});
