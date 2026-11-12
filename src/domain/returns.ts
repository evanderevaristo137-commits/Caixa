import { lineCostCents } from './profit';
import type { Cents, ReturnItem, Sale, SaleItem, SaleReturn } from './types';

/**
 * Returns: goods a customer gives back, all or part of a sale. The sale never changes; each return
 * is a record of its own, so what was sold and what came back can always be told apart.
 */

type ReturnLike = Pick<SaleReturn, 'items'>;

/** How much of each product of the sale was already returned. */
export function returnedQuantities(returns: ReturnLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of returns) for (const i of r.items) out.set(i.productId, (out.get(i.productId) ?? 0) + i.quantity);
  return out;
}

/** What can still be returned of each line (sold minus what earlier returns took back). */
export function returnable(sale: Pick<Sale, 'items'>, returns: ReturnLike[]): Map<string, number> {
  const done = returnedQuantities(returns);
  return new Map(sale.items.map((i) => [i.productId, Math.max(0, i.quantity - (done.get(i.productId) ?? 0))]));
}

/**
 * Money back for `qty` more of a line, when `already` came back before. Proportional to what the line
 * cost in the sale (weighed lines to the whole kwanza). Returned in parts, a line never gives back
 * more, or less, than it cost.
 */
export function refundFor(item: Pick<SaleItem, 'lineTotalCents' | 'quantity' | 'soldBy'>, already: number, qty: number): Cents {
  const upTo = (q: number) => {
    if (q >= item.quantity) return item.lineTotalCents;
    const exact = (item.lineTotalCents * q) / item.quantity;
    return item.soldBy === 'weight' ? Math.round(exact / 100) * 100 : Math.round(exact);
  };
  return upTo(already + qty) - upTo(already);
}

export type ReturnLineError = 'empty' | 'invalid_quantity' | 'not_in_sale' | 'too_many';

/** The lines of a new return, checked against the sale and its earlier returns. */
export function returnItems(
  sale: Pick<Sale, 'items'>,
  earlier: ReturnLike[],
  lines: { productId: string; quantity: number }[],
): ReturnItem[] | ReturnLineError {
  const wanted = lines.filter((l) => l.quantity !== 0);
  if (wanted.length === 0) return 'empty';
  const done = returnedQuantities(earlier);
  const seen = new Set<string>();
  const items: ReturnItem[] = [];
  for (const line of wanted) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0 || seen.has(line.productId)) return 'invalid_quantity';
    seen.add(line.productId);
    const item = sale.items.find((i) => i.productId === line.productId);
    if (!item) return 'not_in_sale';
    const already = done.get(item.productId) ?? 0;
    if (already + line.quantity > item.quantity) return 'too_many';
    const cost = lineCostCents({ unitCostCents: item.unitCostCents, quantity: line.quantity, soldBy: item.soldBy });
    items.push({
      productId: item.productId,
      name: item.name,
      quantity: line.quantity,
      ...(item.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
      refundCents: refundFor(item, already, line.quantity),
      ...(cost !== undefined ? { costCents: cost } : {}),
    });
  }
  return items;
}

export interface ReturnsSummary {
  count: number;
  /** Money given back (or taken off customers' debts). */
  totalCents: Cents;
  /** Of which, money that left the till. */
  cashCents: Cents;
}

export function summariseReturns(returns: Pick<SaleReturn, 'totalCents' | 'refund'>[]): ReturnsSummary {
  return {
    count: returns.length,
    totalCents: returns.reduce((a, r) => a + r.totalCents, 0),
    cashCents: returns.filter((r) => r.refund === 'cash').reduce((a, r) => a + r.totalCents, 0),
  };
}
