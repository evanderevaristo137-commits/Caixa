import { addDays, startOfLocalDay } from '../lib/dates';
import { comparePt } from './ranking';
import { summariseOutflows, type OutflowSummary } from './cash';
import { summariseProfit, type ProfitSummary } from './profit';
import type { Cents, CreditPayment, Expense, PaymentMethod, Sale, SaleReturn } from './types';
import { isElectronic, PAYMENT_METHODS } from './types';

/** Reports over a period: totals, buckets for the chart, payment methods and best sellers. */

export type PeriodKind = '7d' | '30d' | '12m';
type SaleLike = Pick<Sale, 'createdAt' | 'totalCents' | 'method' | 'voidedAt' | 'items' | 'customerId'>;
type PaymentLike = Pick<CreditPayment, 'createdAt' | 'amountCents'> & Partial<Pick<CreditPayment, 'method'>>;
type ExpenseLike = Pick<Expense, 'createdAt' | 'category' | 'amountCents' | 'fromCash' | 'voidedAt'>;
type ReturnLike = Pick<SaleReturn, 'createdAt' | 'totalCents' | 'items' | 'restock'>;

export const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const WEEKDAYS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

export interface Bucket {
  start: Date;
  end: Date;
  /** Short label for the axis ("seg.", "8", "nov."). */
  label: string;
  /** Long label for the tooltip and the table ("seg., 08/11", "nov. 2026"). */
  title: string;
  salesCents: Cents;
  count: number;
  /** Estimated profit of the lines with a cost price (undefined when none had one). */
  profitCents?: Cents;
  isCurrent: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The current period (ending now) and the one just before it, for the comparison. */
export function periodRange(kind: PeriodKind, now: Date): { from: Date; to: Date; prevFrom: Date } {
  const today = startOfLocalDay(now);
  const to = addDays(today, 1);
  if (kind === '12m') {
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return { from, to, prevFrom: new Date(now.getFullYear(), now.getMonth() - 23, 1) };
  }
  const days = kind === '7d' ? 7 : 30;
  const from = addDays(today, -(days - 1));
  return { from, to, prevFrom: addDays(from, -days) };
}

/** Empty buckets: one per day (7 or 30 days) or per month (12 months), oldest first. */
export function buckets(kind: PeriodKind, now: Date): Bucket[] {
  const { from } = periodRange(kind, now);
  const out: Bucket[] = [];
  if (kind === '12m') {
    for (let i = 0; i < 12; i++) {
      const start = new Date(from.getFullYear(), from.getMonth() + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      out.push({
        start,
        end,
        label: MONTHS[start.getMonth()]!,
        title: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
        salesCents: 0,
        count: 0,
        isCurrent: i === 11,
      });
    }
    return out;
  }
  const days = kind === '7d' ? 7 : 30;
  for (let i = 0; i < days; i++) {
    const start = addDays(from, i);
    const end = addDays(start, 1);
    const dm = `${pad(start.getDate())}/${pad(start.getMonth() + 1)}`;
    out.push({
      start,
      end,
      label: kind === '7d' ? WEEKDAYS[start.getDay()]! : String(start.getDate()),
      title: `${WEEKDAYS[start.getDay()]}, ${dm}`,
      salesCents: 0,
      count: 0,
      isCurrent: i === days - 1,
    });
  }
  return out;
}

/**
 * Puts the valid sales into their buckets, with the profit of each bucket. One pass over the sales
 * (a year of sales is thousands of them): dates are compared as ISO text, the bucket found by
 * binary search (buckets are consecutive and in time order).
 */
export function fillBuckets(empty: Bucket[], sales: SaleLike[], returns: ReturnLike[] = []): Bucket[] {
  const starts = empty.map((b) => b.start.toISOString());
  const ends = empty.map((b) => b.end.toISOString());
  const bucketOf = (iso: string) => {
    let lo = 0;
    let hi = starts.length - 1;
    let at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= iso) {
        at = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return at >= 0 && iso < ends[at]! ? at : -1;
  };
  const groups: SaleLike[][] = empty.map(() => []);
  for (const s of sales) {
    if (s.voidedAt) continue;
    const at = bucketOf(s.createdAt);
    if (at >= 0) groups[at]!.push(s);
  }
  // Returns lower the profit of the day (or month) they were made.
  const returned: ReturnLike[][] = empty.map(() => []);
  for (const r of returns) {
    const at = bucketOf(r.createdAt);
    if (at >= 0) returned[at]!.push(r);
  }
  return empty.map((b, i) => {
    const inside = groups[i]!;
    const profit = summariseProfit(inside, returned[i]);
    return {
      ...b,
      salesCents: inside.reduce((a, s) => a + s.totalCents, 0),
      count: inside.length,
      profitCents: profit.revenueCents > 0 ? profit.profitCents : undefined,
    };
  });
}

export interface PeriodSummary {
  salesCents: Cents;
  count: number;
  /** Average sale (0 without sales). */
  avgTicketCents: Cents;
  byMethod: Record<PaymentMethod, Cents>;
  /** KWiK, Multicaixa Express, Unitel Money, Afrimoney, PayPay. */
  electronicCents: Cents;
  profit: ProfitSummary;
  outflows: OutflowSummary;
  /** Sold on credit in the period, and received from customers in the period. */
  creditSoldCents: Cents;
  creditPaidCents: Cents;
  daysWithSales: number;
  /** Goods given back in the period (their money is taken off the profit). */
  returns: { count: number; totalCents: Cents };
}

export function periodSummary(
  sales: SaleLike[],
  payments: PaymentLike[],
  expenses: ExpenseLike[],
  from: Date,
  to: Date,
  returns: ReturnLike[] = [],
): PeriodSummary {
  // ISO dates compare as text: no date parsing for each of thousands of sales.
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const between = (iso: string) => iso >= fromIso && iso < toIso;
  const valid = sales.filter((s) => !s.voidedAt && between(s.createdAt));
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, Cents>;
  for (const s of valid) byMethod[s.method] += s.totalCents;
  const salesCents = valid.reduce((a, s) => a + s.totalCents, 0);
  const days = new Set(valid.map((s) => startOfLocalDay(new Date(s.createdAt)).getTime()));
  const returned = returns.filter((r) => between(r.createdAt));
  return {
    salesCents,
    count: valid.length,
    // Whole kwanzas: there are no cêntimos coins.
    avgTicketCents: valid.length ? Math.round(salesCents / valid.length / 100) * 100 : 0,
    byMethod,
    electronicCents: PAYMENT_METHODS.filter(isElectronic).reduce((a, m) => a + byMethod[m], 0),
    profit: summariseProfit(valid, returned),
    outflows: summariseOutflows(expenses.filter((e) => between(e.createdAt))),
    creditSoldCents: byMethod.credit,
    // Goods returned from a credit sale lower the debt but are not money received.
    creditPaidCents: payments.filter((p) => p.method !== 'return' && between(p.createdAt)).reduce((a, p) => a + p.amountCents, 0),
    daysWithSales: days.size,
    returns: { count: returned.length, totalCents: returned.reduce((a, r) => a + r.totalCents, 0) },
  };
}

/** Change from the previous period, in basis points (1250 = +12,5%); undefined when there was nothing before. */
export function changeBp(current: number, previous: number): number | undefined {
  return previous > 0 ? Math.round(((current - previous) * 10_000) / previous) : undefined;
}

/** "+12%" / "−8%" / "0%" */
export const formatChange = (bp: number) => {
  const pct = Math.round(bp / 100);
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${-pct}%` : '0%';
};

/** Share in basis points (4600 = 46%). */
export const shareBp = (part: number, whole: number) => (whole > 0 ? Math.round((part * 10_000) / whole) : 0);

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  soldBy?: 'weight';
  revenueCents: Cents;
}

/** Best sellers by revenue (valid sales only). */
export function topProducts(sales: SaleLike[], limit = 5): TopProduct[] {
  const map = new Map<string, TopProduct>();
  for (const s of sales) {
    if (s.voidedAt) continue;
    for (const i of s.items) {
      const row = map.get(i.productId) ?? {
        productId: i.productId,
        name: i.name,
        quantity: 0,
        revenueCents: 0,
        ...(i.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
      };
      row.quantity += i.quantity;
      row.revenueCents += i.lineTotalCents;
      map.set(i.productId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents || comparePt(a.name, b.name)).slice(0, limit);
}

/** "150 mil", "1,5 M", "800": short amounts in Kz for chart axes and labels. */
export function compactKz(cents: Cents): string {
  const kz = Math.round(cents / 100);
  if (Math.abs(kz) >= 1_000_000) return `${(kz / 1_000_000).toFixed(kz % 1_000_000 === 0 ? 0 : 1).replace('.', ',')} M`;
  if (Math.abs(kz) >= 1_000) return `${Math.round(kz / 1_000)} mil`;
  return String(kz);
}
