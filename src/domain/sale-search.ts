import { addDays, startOfLocalDay } from '../lib/dates';
import { normalise } from '../lib/text';
import { compareText } from './ranking';
import type { Cents, PaymentMethod, Sale } from './types';

/**
 * Finding sales: by period, payment method, customer, state (valid or voided) and text (a product
 * name, the customer's name or the sale number). Newest first.
 */
export const SALE_PERIODS = ['today', 'yesterday', '7d', '30d'] as const;
export type SalePeriod = (typeof SALE_PERIODS)[number];
export type SaleState = 'all' | 'valid' | 'voided';

export interface SaleFilter {
  period: SalePeriod;
  method?: PaymentMethod;
  customerId?: string;
  state: SaleState;
  text?: string;
}

/** The days a period covers, in the phone's calendar: from <= createdAt < to. */
export function periodRange(period: SalePeriod, now: Date): { from: Date; to: Date } {
  const today = startOfLocalDay(now);
  const tomorrow = addDays(today, 1);
  switch (period) {
    case 'today':
      return { from: today, to: tomorrow };
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case '7d':
      return { from: addDays(today, -6), to: tomorrow };
    case '30d':
      return { from: addDays(today, -29), to: tomorrow };
  }
}

type SaleLike = Pick<Sale, 'number' | 'items' | 'method' | 'customerId' | 'voidedAt' | 'createdAt' | 'totalCents'>;

/** Does the sale match the filter? `customerName` gives the name of a customer (for the text search). */
export function matchesSale(sale: SaleLike, filter: SaleFilter, customerName?: (id: string) => string | undefined): boolean {
  if (filter.method && sale.method !== filter.method) return false;
  if (filter.customerId && sale.customerId !== filter.customerId) return false;
  if (filter.state === 'valid' && sale.voidedAt) return false;
  if (filter.state === 'voided' && !sale.voidedAt) return false;
  const text = normalise(filter.text ?? '');
  if (!text) return true;
  // "12" or "n.º 12" or "#12": the sale number (a product name with those digits also counts).
  const number = /^(?:n\.?º?\s*|#)?(\d+)$/.exec(text);
  if (number && sale.number === Number(number[1])) return true;
  if (sale.items.some((i) => normalise(i.name).includes(text))) return true;
  const name = sale.customerId ? customerName?.(sale.customerId) : undefined;
  return !!name && normalise(name).includes(text);
}

/** The sales that match, newest first. The period is applied by whoever reads the sales (by date). */
export function searchSales<S extends SaleLike>(sales: S[], filter: SaleFilter, customerName?: (id: string) => string | undefined): S[] {
  return sales.filter((s) => matchesSale(s, filter, customerName)).sort((a, b) => compareText(b.createdAt, a.createdAt));
}

/** Totals of what was found: voided sales are shown but never counted. */
export function searchTotals(sales: SaleLike[]): { count: number; totalCents: Cents; voided: number } {
  const valid = sales.filter((s) => !s.voidedAt);
  return { count: valid.length, totalCents: valid.reduce((a, s) => a + s.totalCents, 0), voided: sales.length - valid.length };
}
