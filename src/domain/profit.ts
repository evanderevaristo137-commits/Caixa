import type { Cents, Sale, SaleItem } from './types';
import { comparePt } from './ranking';

/**
 * Estimated profit of sales: what the customer paid minus what the goods cost the shop.
 * The cost is the product's cost price on the day of the sale (snapshotted on the sale line),
 * so changing a cost price later never rewrites past profit. Lines without a cost price are
 * left out of the profit and counted apart, so the number is never invented.
 */

type ItemLike = Pick<SaleItem, 'productId' | 'name' | 'quantity' | 'soldBy' | 'lineTotalCents' | 'unitCostCents'>;
type SaleLike = Pick<Sale, 'voidedAt'> & { items: ItemLike[] };

/** Cost of one line, or undefined when the product had no cost price. Weighed lines: cost per kg × grams. */
export function lineCostCents(item: Pick<SaleItem, 'unitCostCents' | 'quantity' | 'soldBy'>): Cents | undefined {
  if (item.unitCostCents === undefined) return undefined;
  return item.soldBy === 'weight' ? Math.round((item.unitCostCents * item.quantity) / 1000) : item.unitCostCents * item.quantity;
}

export interface ProfitSummary {
  /** Sales revenue of the lines whose cost is known. */
  revenueCents: Cents;
  costCents: Cents;
  profitCents: Cents;
  /** Revenue of lines sold without a cost price (not in the profit). */
  unknownRevenueCents: Cents;
  /** Number of sale lines without a cost price. */
  unknownLines: number;
}

/** Profit of the valid (not voided) sales given. */
export function summariseProfit(sales: SaleLike[]): ProfitSummary {
  const out: ProfitSummary = { revenueCents: 0, costCents: 0, profitCents: 0, unknownRevenueCents: 0, unknownLines: 0 };
  for (const s of sales) {
    if (s.voidedAt) continue;
    for (const item of s.items) {
      const cost = lineCostCents(item);
      if (cost === undefined) {
        out.unknownRevenueCents += item.lineTotalCents;
        out.unknownLines += 1;
        continue;
      }
      out.revenueCents += item.lineTotalCents;
      out.costCents += cost;
    }
  }
  out.profitCents = out.revenueCents - out.costCents;
  return out;
}

/** Profit as a share of the price, in basis points (2500 = 25%). Undefined without revenue. */
export function marginBp(p: Pick<ProfitSummary, 'revenueCents' | 'profitCents'>): number | undefined {
  return p.revenueCents > 0 ? Math.round((p.profitCents * 10_000) / p.revenueCents) : undefined;
}

/** 2500 → "25%" (whole percent; "-3%" when selling below cost). */
export const formatMargin = (bp: number) => `${Math.round(bp / 100)}%`;

export interface ProductProfit {
  productId: string;
  name: string;
  /** Units, or grams for weighed products. */
  quantity: number;
  soldBy?: 'weight';
  revenueCents: Cents;
  profitCents: Cents;
}

/** Profit per product (only lines with a cost price), most profitable first. */
export function profitByProduct(sales: SaleLike[]): ProductProfit[] {
  const map = new Map<string, ProductProfit>();
  for (const s of sales) {
    if (s.voidedAt) continue;
    for (const item of s.items) {
      const cost = lineCostCents(item);
      if (cost === undefined) continue;
      const row = map.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        quantity: 0,
        revenueCents: 0,
        profitCents: 0,
        ...(item.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
      };
      row.quantity += item.quantity;
      row.revenueCents += item.lineTotalCents;
      row.profitCents += item.lineTotalCents - cost;
      map.set(item.productId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.profitCents - a.profitCents || comparePt(a.name, b.name));
}

/** What the shop earns on one unit (or one kg) at this price and cost. */
export function unitMargin(priceCents: Cents, costCents: Cents): { profitCents: Cents; marginBp: number | undefined } {
  const profitCents = priceCents - costCents;
  return { profitCents, marginBp: priceCents > 0 ? Math.round((profitCents * 10_000) / priceCents) : undefined };
}
