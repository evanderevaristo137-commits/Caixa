import type { Cents, Product } from './types';

/**
 * Counting the stock on the shelves (inventory). The count is kept on the phone while it is
 * being done, then applied at once as adjustments with the reason "Contagem de stock".
 * Each line keeps what the app had when that product was counted: a sale made while the
 * shop is still counting other products does not turn into a false difference.
 */

/** One counted product: on the shelf, and in the app at that moment (units, or grams by weight). */
export interface CountLine {
  counted: number;
  expected: number;
}

export interface CountDraft {
  startedAt: string;
  lines: Record<string, CountLine>;
}

export const emptyCount = (now: Date): CountDraft => ({ startedAt: now.toISOString(), lines: {} });

/** Reads a saved count; anything damaged is dropped instead of breaking the screen. */
export function parseCountDraft(raw: string | null): CountDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { startedAt, lines } = value as { startedAt?: unknown; lines?: unknown };
    if (typeof startedAt !== 'string' || typeof lines !== 'object' || lines === null) return null;
    const clean: Record<string, CountLine> = {};
    for (const [id, line] of Object.entries(lines as Record<string, unknown>)) {
      const { counted, expected } = (line ?? {}) as { counted?: unknown; expected?: unknown };
      if (
        typeof counted === 'number' &&
        Number.isInteger(counted) &&
        counted >= 0 &&
        typeof expected === 'number' &&
        Number.isInteger(expected)
      ) {
        clean[id] = { counted, expected };
      }
    }
    return { startedAt, lines: clean };
  } catch {
    return null;
  }
}

/** Records (or with null, forgets) the count of a product, against its stock in the app right now. */
export function setCount(draft: CountDraft, product: Pick<Product, 'id' | 'stock'>, counted: number | null): CountDraft {
  const lines = { ...draft.lines };
  if (counted === null) delete lines[product.id];
  else lines[product.id] = { counted, expected: product.stock };
  return { ...draft, lines };
}

/** Value of a quantity at cost price (weighed products: cost per kg × grams); undefined without a cost price. */
export function valueAtCost(product: Pick<Product, 'costCents' | 'soldBy'>, quantity: number): Cents | undefined {
  if (product.costCents === undefined) return undefined;
  return product.soldBy === 'weight' ? Math.round((product.costCents * quantity) / 1000) : product.costCents * quantity;
}

export interface CountDifference {
  product: Product;
  expected: number;
  counted: number;
  /** counted − expected: negative when goods are missing. */
  delta: number;
  valueCents?: Cents;
}

export interface CountSummary {
  /** Products counted (still in the shop). */
  counted: number;
  /** Only the products with a difference, biggest loss first. */
  differences: CountDifference[];
  /** Value at cost price of what is missing and of what is over (both positive). */
  missingCents: Cents;
  surplusCents: Cents;
  /** Differences of products without a cost price, left out of the values. */
  withoutCost: number;
}

export function summariseCount(draft: CountDraft, products: Product[]): CountSummary {
  const byId = new Map(products.filter((p) => !p.archivedAt).map((p) => [p.id, p]));
  const summary: CountSummary = { counted: 0, differences: [], missingCents: 0, surplusCents: 0, withoutCost: 0 };
  for (const [id, line] of Object.entries(draft.lines)) {
    const product = byId.get(id);
    // Archived while counting: left out.
    if (!product) continue;
    summary.counted += 1;
    const delta = line.counted - line.expected;
    if (delta === 0) continue;
    const valueCents = valueAtCost(product, delta);
    if (valueCents === undefined) summary.withoutCost += 1;
    else if (valueCents < 0) summary.missingCents -= valueCents;
    else summary.surplusCents += valueCents;
    summary.differences.push({ product, expected: line.expected, counted: line.counted, delta, valueCents });
  }
  summary.differences.sort(
    (a, b) => (a.valueCents ?? 0) - (b.valueCents ?? 0) || a.delta - b.delta || a.product.name.localeCompare(b.product.name, 'pt'),
  );
  return summary;
}

/** The lines to apply: products still in the shop. */
export function countLines(draft: CountDraft, products: Product[]): { productId: string; counted: number; expected: number }[] {
  const live = new Set(products.filter((p) => !p.archivedAt).map((p) => p.id));
  return Object.entries(draft.lines)
    .filter(([id]) => live.has(id))
    .map(([productId, l]) => ({ productId, counted: l.counted, expected: l.expected }));
}
