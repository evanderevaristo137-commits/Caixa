import { BUSINESS_TYPES, CATALOG, type CatalogCategory } from './catalog';
import { lineCostCents } from './profit';
import { comparePt } from './ranking';
import type { Cents, Product, Sale, SaleItem } from './types';

/**
 * Product categories ("Bebidas", "Telemóveis e electrónica"…) and, inside each, an optional
 * subcategory ("Cerveja", "Capas e películas"): chosen from the app's list (catalog.ts) or written
 * by the shop. One of each per product. They filter the products in Vender and Produtos and group
 * sales in the reports. Reports use the product's current category, so renaming one regroups past
 * sales too.
 */

/** Filter value for the products without a category. */
export const NO_CATEGORY = '';

const MAX_LENGTH = 40;

/** "Electrónica " → "electronica": to compare and search without accents, capitals or extra spaces. */
export const categoryKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const key = categoryKey;

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

/** The same subcategory written another way takes the spelling the shop or the app already uses. */
export const canonicalSub = canonicalCategory;

/** The app's category with this name (any spelling). */
export function catalogCategory(name: string | undefined): CatalogCategory | undefined {
  if (!name) return undefined;
  const k = key(name);
  return CATALOG.find((c) => key(c.name) === k);
}

/** The app's categories a shop sees first: those of its kinds of shop, in that order (all of them when none is chosen). */
export function catalogFor(types: readonly string[] | undefined): CatalogCategory[] {
  const chosen = BUSINESS_TYPES.filter((b) => types?.includes(b.id));
  if (chosen.length === 0) return [...CATALOG];
  const names = new Set(chosen.flatMap((b) => [...b.categories]));
  const out: CatalogCategory[] = [];
  for (const b of chosen) for (const n of b.categories) if (names.delete(n)) out.push(catalogCategory(n)!);
  return out;
}

/** A category in use in the shop, with the subcategories its products use. */
export interface CategoryGroup {
  name: string;
  subs: string[];
}

/** The shop's categories and subcategories in use (archived products left out), in Portuguese order. */
export function categoryTree(products: Pick<Product, 'category' | 'subcategory' | 'archivedAt'>[]): CategoryGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const p of products) {
    if (!p.category || p.archivedAt) continue;
    const subs = groups.get(p.category) ?? new Set<string>();
    if (p.subcategory) subs.add(p.subcategory);
    groups.set(p.category, subs);
  }
  return [...groups]
    .map(([name, subs]) => ({ name, subs: [...subs].sort((a, b) => comparePt(a, b)) }))
    .sort((a, b) => comparePt(a.name, b.name));
}

/** Subcategories to offer for a category: the shop's own first, then the app's ones (no repeats). */
export function subsFor(category: string, tree: readonly CategoryGroup[]): string[] {
  const own = tree.find((g) => key(g.name) === key(category))?.subs ?? [];
  const out = [...own];
  const seen = new Set(own.map(key));
  for (const sub of catalogCategory(category)?.subs ?? []) {
    if (!seen.has(key(sub.name))) {
      seen.add(key(sub.name));
      out.push(sub.name);
    }
  }
  return out;
}

/** A search result: a category, or a subcategory inside its category. */
export interface CategoryHit {
  category: string;
  sub?: string;
}

/**
 * Finds categories and subcategories by any word ("capa" → «Telemóveis e electrónica › Capas e
 * películas»; "pneu" → «Peças e acessórios auto › Pneus»), in the shop's own ones and in the app's
 * list. Names that start with the words come first; at most `limit` results.
 */
export function searchCategories(query: string, tree: readonly CategoryGroup[], limit = 20): CategoryHit[] {
  const q = key(query);
  if (q.length < 2) return [];
  const scored: { hit: CategoryHit; score: number }[] = [];
  const seen = new Set<string>();
  const add = (hit: CategoryHit, text: string, words: readonly string[] = []) => {
    const id = `${key(hit.category)}|${key(hit.sub ?? '')}`;
    if (seen.has(id)) return;
    const name = key(text);
    const score = name.startsWith(q) || name.includes(` ${q}`) ? 0 : name.includes(q) ? 1 : words.some((w) => key(w).includes(q)) ? 2 : -1;
    if (score < 0) return;
    seen.add(id);
    scored.push({ hit, score });
  };
  for (const g of tree) {
    add({ category: g.name }, g.name);
    for (const sub of g.subs)
      add({ category: g.name, sub }, sub, catalogCategory(g.name)?.subs.find((x) => key(x.name) === key(sub))?.words);
  }
  for (const c of CATALOG) {
    add({ category: c.name }, c.name);
    for (const sub of c.subs) add({ category: c.name, sub: sub.name }, sub.name, sub.words);
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.hit);
}

/** "Bebidas › Cerveja", or just "Bebidas". */
export const categoryLabel = (category: string, sub?: string) => (sub ? `${category} › ${sub}` : category);

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

/** What a list shows: a category (null = all) and, inside it, a subcategory (null = all; NO_CATEGORY = the ones without). */
export interface CategoryFilter {
  category: string | null;
  sub: string | null;
}

export const ALL_CATEGORIES: CategoryFilter = { category: null, sub: null };

export function inFilter(p: Pick<Product, 'category' | 'subcategory'>, f: CategoryFilter): boolean {
  if (!inCategory(p, f.category)) return false;
  if (f.sub === null || f.category === null || f.category === NO_CATEGORY) return true;
  return f.sub === NO_CATEGORY ? !p.subcategory : p.subcategory === f.sub;
}

type SaleLike = Pick<Sale, 'voidedAt'> & {
  items: Pick<SaleItem, 'productId' | 'quantity' | 'soldBy' | 'lineTotalCents' | 'unitCostCents'>[];
};

/** Sales and estimated profit of a group (a category, or a subcategory inside it). */
export interface GroupSales {
  salesCents: Cents;
  /** Profit of the lines sold with a cost price, and how much they sold. */
  profitCents: Cents;
  costedSalesCents: Cents;
}

export interface CategorySales extends GroupSales {
  /** NO_CATEGORY for products without one. */
  category: string;
  /**
   * Inside the category, by subcategory (NO_CATEGORY = the products without one), biggest first.
   * Empty when none of its products sold has a subcategory.
   */
  subs: (GroupSales & { sub: string })[];
}

/** Where a product is: its category and subcategory (both current, as in every report). */
export interface Placement {
  category: string;
  subcategory?: string;
}

const emptyGroup = (): GroupSales => ({ salesCents: 0, profitCents: 0, costedSalesCents: 0 });

/** Sales and estimated profit by category, each with its subcategories, biggest first. Voided sales do not count. */
export function salesByCategory(sales: SaleLike[], placeOf: ReadonlyMap<string, Placement>): CategorySales[] {
  const rows = new Map<string, { group: GroupSales; subs: Map<string, GroupSales> }>();
  const add = (g: GroupSales, lineCents: Cents, cost: Cents | undefined) => {
    g.salesCents += lineCents;
    if (cost !== undefined) {
      g.profitCents += lineCents - cost;
      g.costedSalesCents += lineCents;
    }
  };
  for (const s of sales) {
    if (s.voidedAt) continue;
    for (const item of s.items) {
      const place = placeOf.get(item.productId);
      const category = place?.category ?? NO_CATEGORY;
      const row = rows.get(category) ?? { group: emptyGroup(), subs: new Map<string, GroupSales>() };
      const sub = place?.subcategory ?? NO_CATEGORY;
      const subGroup = row.subs.get(sub) ?? emptyGroup();
      const cost = lineCostCents(item);
      add(row.group, item.lineTotalCents, cost);
      add(subGroup, item.lineTotalCents, cost);
      row.subs.set(sub, subGroup);
      rows.set(category, row);
    }
  }
  return [...rows]
    .map(([category, { group, subs }]): CategorySales => {
      const named = [...subs.keys()].some((k) => k !== NO_CATEGORY);
      return {
        category,
        ...group,
        subs: named
          ? [...subs].map(([sub, g]) => ({ sub, ...g })).sort((a, b) => b.salesCents - a.salesCents || comparePt(a.sub, b.sub))
          : [],
      };
    })
    .sort((a, b) => b.salesCents - a.salesCents || comparePt(a.category, b.category));
}
