import { addDays, startOfLocalDay } from '../lib/dates';
import type { Cents, PaymentMethod, Product, Sale } from './types';
import { PAYMENT_METHODS } from './types';

export interface DaySummary {
  totalCents: Cents;
  count: number;
  byMethod: Record<PaymentMethod, Cents>;
}

export interface TodaySummary {
  today: DaySummary;
  yesterday: DaySummary;
  /** Difference today − yesterday, in cêntimos. */
  diffCents: Cents;
  lowStock: Product[];
}

function emptyByMethod(): Record<PaymentMethod, Cents> {
  return Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, Cents>;
}

export function summariseDay(sales: Pick<Sale, 'createdAt' | 'totalCents' | 'method'>[], day: Date): DaySummary {
  const from = startOfLocalDay(day).getTime();
  const to = addDays(startOfLocalDay(day), 1).getTime();
  const byMethod = emptyByMethod();
  let totalCents = 0;
  let count = 0;
  for (const s of sales) {
    const t = new Date(s.createdAt).getTime();
    if (t < from || t >= to) continue;
    totalCents += s.totalCents;
    count += 1;
    byMethod[s.method] += s.totalCents;
  }
  return { totalCents, count, byMethod };
}

export function isLowStock(p: Pick<Product, 'stock' | 'minStock' | 'archivedAt'>): boolean {
  return !p.archivedAt && p.stock <= p.minStock;
}

export function summariseToday(sales: Sale[], products: Product[], now: Date): TodaySummary {
  const today = summariseDay(sales, now);
  const yesterday = summariseDay(sales, addDays(now, -1));
  const lowStock = products.filter(isLowStock).sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));
  return { today, yesterday, diffCents: today.totalCents - yesterday.totalCents, lowStock };
}
