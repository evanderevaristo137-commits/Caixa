import { addDays, isSameLocalDay, startOfLocalDay } from '../lib/dates';
import type { Cents, CreditPayment, PaymentMethod, Product, Sale } from './types';
import { PAYMENT_METHODS } from './types';

type SaleLike = Pick<Sale, 'createdAt' | 'totalCents' | 'method' | 'voidedAt'>;
type PaymentLike = Pick<CreditPayment, 'createdAt' | 'amountCents' | 'method'>;

export interface DaySummary {
  /** Valid (not voided) sales only. */
  totalCents: Cents;
  count: number;
  byMethod: Record<PaymentMethod, Cents>;
  voidedCount: number;
  voidedCents: Cents;
}

export interface DayView {
  day: DaySummary;
  /** For today: yesterday until the same time (fair). For past days: the whole previous day. */
  comparison: DaySummary;
  comparisonIsSameTime: boolean;
  previousFull: DaySummary;
  /** day − comparison, in cêntimos. */
  diffCents: Cents;
  /** Cash that should be in the drawer: cash sales + fiado paid in cash. */
  cash: { salesCents: Cents; creditPaymentsCents: Cents; totalCents: Cents };
  /** Fiado payments received that day, any method. */
  creditPaidCents: Cents;
}

function emptyByMethod(): Record<PaymentMethod, Cents> {
  return Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, Cents>;
}

const inRange = (iso: string, fromMs: number, toMs: number) => {
  const t = new Date(iso).getTime();
  return t >= fromMs && t < toMs;
};

/** Sums sales with fromMs <= time < toMs. Voided sales are counted apart. */
export function summariseRange(sales: SaleLike[], fromMs: number, toMs: number): DaySummary {
  const byMethod = emptyByMethod();
  let totalCents = 0;
  let count = 0;
  let voidedCount = 0;
  let voidedCents = 0;
  for (const s of sales) {
    if (!inRange(s.createdAt, fromMs, toMs)) continue;
    if (s.voidedAt) {
      voidedCount += 1;
      voidedCents += s.totalCents;
      continue;
    }
    totalCents += s.totalCents;
    count += 1;
    byMethod[s.method] += s.totalCents;
  }
  return { totalCents, count, byMethod, voidedCount, voidedCents };
}

export function summariseDay(sales: SaleLike[], day: Date): DaySummary {
  const from = startOfLocalDay(day);
  return summariseRange(sales, from.getTime(), addDays(from, 1).getTime());
}

export function summariseDayView(sales: SaleLike[], payments: PaymentLike[], day: Date, now: Date): DayView {
  const start = startOfLocalDay(day);
  const end = addDays(start, 1);
  const summary = summariseDay(sales, start);
  const previousStart = addDays(start, -1);
  const previousFull = summariseDay(sales, previousStart);
  const isToday = isSameLocalDay(day, now);
  const comparison = isToday ? summariseRange(sales, previousStart.getTime(), addDays(now, -1).getTime() + 1) : previousFull;

  const dayPayments = payments.filter((p) => inRange(p.createdAt, start.getTime(), end.getTime()));
  const creditPaymentsCash = dayPayments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amountCents, 0);
  const creditPaidCents = dayPayments.reduce((a, p) => a + p.amountCents, 0);

  return {
    day: summary,
    comparison,
    comparisonIsSameTime: isToday,
    previousFull,
    diffCents: summary.totalCents - comparison.totalCents,
    cash: {
      salesCents: summary.byMethod.cash,
      creditPaymentsCents: creditPaymentsCash,
      totalCents: summary.byMethod.cash + creditPaymentsCash,
    },
    creditPaidCents,
  };
}

export function isLowStock(p: Pick<Product, 'stock' | 'minStock' | 'archivedAt'>): boolean {
  return !p.archivedAt && p.stock <= p.minStock;
}

/** Products at or below their minimum, most urgent first. */
export function lowStockProducts(products: Product[]): Product[] {
  return products.filter(isLowStock).sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));
}

export interface RestockLine {
  productId: string;
  name: string;
  stock: number;
  /** Suggested quantity to buy: enough to reach twice the minimum (at least 1). */
  suggested: number;
}

/** Shopping list from the products that are low, most urgent first. */
export function restockList(products: Product[]): RestockLine[] {
  return lowStockProducts(products).map((p) => ({
    productId: p.id,
    name: p.name,
    stock: p.stock,
    suggested: Math.max(1, p.minStock * 2 - p.stock),
  }));
}
