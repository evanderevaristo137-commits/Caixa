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
  /** Yesterday until the same time of day as now: the fair comparison. */
  yesterdaySoFar: DaySummary;
  /** Yesterday's whole day, for reference. */
  yesterday: DaySummary;
  /** today − yesterdaySoFar, in cêntimos. */
  diffCents: Cents;
  lowStock: Product[];
}

function emptyByMethod(): Record<PaymentMethod, Cents> {
  return Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, Cents>;
}

/** Sums sales with fromMs <= time < toMs. */
export function summariseRange(sales: Pick<Sale, 'createdAt' | 'totalCents' | 'method'>[], fromMs: number, toMs: number): DaySummary {
  const byMethod = emptyByMethod();
  let totalCents = 0;
  let count = 0;
  for (const s of sales) {
    const t = new Date(s.createdAt).getTime();
    if (t < fromMs || t >= toMs) continue;
    totalCents += s.totalCents;
    count += 1;
    byMethod[s.method] += s.totalCents;
  }
  return { totalCents, count, byMethod };
}

export function summariseDay(sales: Pick<Sale, 'createdAt' | 'totalCents' | 'method'>[], day: Date): DaySummary {
  const from = startOfLocalDay(day);
  return summariseRange(sales, from.getTime(), addDays(from, 1).getTime());
}

export function isLowStock(p: Pick<Product, 'stock' | 'minStock' | 'archivedAt'>): boolean {
  return !p.archivedAt && p.stock <= p.minStock;
}

export function summariseToday(sales: Sale[], products: Product[], now: Date): TodaySummary {
  const today = summariseDay(sales, now);
  const yesterdayStart = addDays(startOfLocalDay(now), -1);
  const yesterday = summariseDay(sales, yesterdayStart);
  const sameTimeYesterday = addDays(now, -1);
  const yesterdaySoFar = summariseRange(sales, yesterdayStart.getTime(), sameTimeYesterday.getTime() + 1);
  const lowStock = products.filter(isLowStock).sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));
  return { today, yesterdaySoFar, yesterday, diffCents: today.totalCents - yesterdaySoFar.totalCents, lowStock };
}
