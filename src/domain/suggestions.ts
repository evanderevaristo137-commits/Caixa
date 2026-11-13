import { addDays, daysBetweenDateStrings, startOfLocalDay, toLocalDateString } from '../lib/dates';
import type { StillProduct } from './stock-insights';
import type { Cents, Customer, Product, Sale } from './types';

/**
 * Suggestions for the shop, only when the data is enough to say something true (never invented
 * numbers): products sold below their cost, credit customers who stopped buying, money standing
 * still on the shelf, and the strongest day of the week. The rules and limits are all here.
 */
export const SUGGEST = {
  /** A customer who bought on credit at least this many times in the last LOST_WINDOW days… */
  lostMinPurchases: 3,
  lostWindowDays: 180,
  /** …and has not come back for at least this many days, and twice their usual gap. */
  lostMinGapDays: 21,
  /** Money standing still: at least this much (at cost price), in at least this many products. */
  stillMinValueCents: 1_000_000,
  stillMinProducts: 3,
  /** The best weekday: over this many complete weeks, with sales on at least this many days… */
  weekdayWeeks: 8,
  weekdayMinDaysWithSales: 30,
  /** …that weekday had sales in at least this many of those weeks, and sells this much above the average day. */
  weekdayMinSamples: 6,
  weekdayAboveBp: 2000,
} as const;

export interface BelowCost {
  product: Product;
  priceCents: Cents;
  costCents: Cents;
}

/** Products whose price is below what they cost (a supplier raised the price, the shop did not). */
export function belowCost(products: Product[]): BelowCost[] {
  return products
    .filter((p) => !p.archivedAt && p.costCents !== undefined && p.priceCents > 0 && p.costCents > p.priceCents)
    .map((p) => ({ product: p, priceCents: p.priceCents, costCents: p.costCents! }));
}

export interface LostCustomer {
  customer: Customer;
  purchases: number;
  /** Local day of the last purchase, "YYYY-MM-DD". */
  lastDay: string;
  daysAway: number;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * Customers who used to buy on credit regularly and stopped: at least 3 purchases (on different days)
 * in the last 180 days, and away for 21 days or more, and at least twice their usual gap.
 * The best customers (most purchases) first.
 */
export function lostCustomers(customers: Customer[], creditSales: Sale[], now: Date): LostCustomer[] {
  const today = toLocalDateString(now);
  const since = toLocalDateString(addDays(startOfLocalDay(now), -SUGGEST.lostWindowDays));
  const days = new Map<string, Set<string>>();
  for (const s of creditSales) {
    if (s.voidedAt || !s.customerId) continue;
    const day = toLocalDateString(new Date(s.createdAt));
    if (day < since) continue;
    let set = days.get(s.customerId);
    if (!set) days.set(s.customerId, (set = new Set()));
    set.add(day);
  }
  const lost: LostCustomer[] = [];
  for (const customer of customers) {
    const list = [...(days.get(customer.id) ?? [])].sort();
    if (list.length < SUGGEST.lostMinPurchases) continue;
    const gaps = list.slice(1).map((d, i) => daysBetweenDateStrings(list[i]!, d));
    const lastDay = list[list.length - 1]!;
    const daysAway = daysBetweenDateStrings(lastDay, today);
    if (daysAway >= Math.max(SUGGEST.lostMinGapDays, 2 * median(gaps))) lost.push({ customer, purchases: list.length, lastDay, daysAway });
  }
  return lost.sort((a, b) => b.purchases - a.purchases || a.daysAway - b.daysAway);
}

/** Money standing still on the shelf, when it is worth a promotion (at cost price, products with a cost). */
export function stillMoney(still: StillProduct[]): { count: number; valueCents: Cents } | null {
  const valued = still.filter((s) => s.valueCents !== undefined && s.valueCents > 0);
  const valueCents = valued.reduce((a, s) => a + s.valueCents!, 0);
  if (valued.length < SUGGEST.stillMinProducts || valueCents < SUGGEST.stillMinValueCents) return null;
  return { count: valued.length, valueCents };
}

/**
 * The strongest day of the week over the last 8 complete weeks (today left out): its average sales
 * against the average day, when the history is enough and the difference is clear (20% or more).
 * `weekday`: 0 = Sunday … 6 = Saturday.
 */
export function bestWeekday(sales: Sale[], now: Date): { weekday: number; aboveBp: number } | null {
  const end = startOfLocalDay(now);
  const start = addDays(end, -7 * SUGGEST.weekdayWeeks);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const byDay = new Map<string, Cents>();
  for (const s of sales) {
    if (s.voidedAt || s.createdAt < startIso || s.createdAt >= endIso) continue;
    const day = toLocalDateString(new Date(s.createdAt));
    byDay.set(day, (byDay.get(day) ?? 0) + s.totalCents);
  }
  if (byDay.size < SUGGEST.weekdayMinDaysWithSales) return null;
  const totals = Array.from({ length: 7 }, () => ({ cents: 0, days: 0 }));
  let all = 0;
  for (const [day, cents] of byDay) {
    const [y, m, d] = day.split('-').map(Number);
    const w = new Date(y!, m! - 1, d!).getDay();
    totals[w]!.cents += cents;
    totals[w]!.days += 1;
    all += cents;
  }
  // Averages over every day of the period (a closed day counts as a day without sales).
  const averageDay = all / (7 * SUGGEST.weekdayWeeks);
  if (averageDay <= 0) return null;
  let best: { weekday: number; aboveBp: number } | null = null;
  totals.forEach((x, weekday) => {
    if (x.days < SUGGEST.weekdayMinSamples) return;
    const aboveBp = Math.round((x.cents / SUGGEST.weekdayWeeks / averageDay - 1) * 10_000);
    if (aboveBp >= SUGGEST.weekdayAboveBp && (!best || aboveBp > best.aboveBp)) best = { weekday, aboveBp };
  });
  return best;
}
