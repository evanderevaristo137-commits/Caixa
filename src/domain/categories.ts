import { lineCostCents } from './profit';
import { comparePt } from './ranking';
import type { Cents, Product, Sale, SaleItem } from './types';

/**
 * Product categories ("Bebidas", "Mercearia"…): optional, typed freely, one per product.
 * They filter the products in Vender and Produtos and group sales in the reports.
 * Reports use the product's current category, so renaming one regroups past sales too.
 */

/** Filter value for the products without a category. */
export const NO_CATEGORY = '';

const MAX_LENGTH = 40;

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Single spaces, at most 40 characters; empty → undefined. */
export function cleanCategory(input: string | undefined): string | undefined {
  const s = (input ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH).trim();
  return s || undefined;
}

/** The same category written another way ("bebidas", "Bebídas") takes the spelling the shop already uses. */
export function canonicalCategory(input: string | undefined, known: readonly string[]): string | undefined {
  const c = cleanCategory(input);
  if (!c) return undefined;
  return known.find((k) => key(k) === key(c)) ?? c;
}

/** Categories of the products, in Portuguese alphabetical order. */
export function categoriesOf(products: Pick<Product, 'category' | 'archivedAt'>[]): string[] {
  const seen = new Set<string>();
  for (const p of products) if (p.category && !p.archivedAt) seen.add(p.category);
  return [...seen].sort((a, b) => comparePt(a, b));
}

/** null = every product; NO_CATEGORY = the products without one. */
export function inCategory(p: Pick<Product, 'category'>, filter: string | null): boolean {
  if (filter === null) return true;
  return filter === NO_CATEGORY ? !p.category : p.category === filter;
}

type SaleLike = Pick<Sale, 'voidedAt'> & {
  items: Pick<SaleItem, 'productId' | 'quantity' | 'soldBy' | 'lineTotalCents' | 'unitCostCents'>[];
};

export interface CategorySales {
  /** NO_CATEGORY for products without one. */
  category: string;
  salesCents: Cents;
  /** Profit of the lines sold with a cost price, and how much they sold. */
  profitCents: Cents;
  costedSalesCents: Cents;
}

/** Sales and estimated profit by category, biggest first. Voided sales do not count. */
export function salesByCategory(sales: SaleLike[], categoryOf: ReadonlyMap<string, string>): CategorySales[] {
  const rows = new Map<string, CategorySales>();
  for (const s of sales) {
    if (s.voidedAt) continue;
    for (const item of s.items) {
      const category = categoryOf.get(item.productId) ?? NO_CATEGORY;
      const row = rows.get(category) ?? { category, salesCents: 0, profitCents: 0, costedSalesCents: 0 };
      row.salesCents += item.lineTotalCents;
      const cost = lineCostCents(item);
      if (cost !== undefined) {
        row.profitCents += item.lineTotalCents - cost;
        row.costedSalesCents += item.lineTotalCents;
      }
      rows.set(category, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.salesCents - a.salesCents || comparePt(a.category, b.category));
}
