import { daysBetweenDateStrings, toLocalDateString } from '../lib/dates';
import { creditBook, dueDateOf, openItems, type CreditSale } from './credit';
import { punctuality, type Punctuality } from './punctuality';
import type { Cents, CreditPayment, Customer } from './types';

/**
 * The customers' accounts at a glance: who owes, how much is overdue and for how long (by age of the
 * debt), and how punctually each one usually pays.
 */

export const AGING = ['current', 'd1_7', 'd8_30', 'd31'] as const;
/** 'current': not due yet (or due today); then 1 to 7, 8 to 30 and more than 30 days late. */
export type AgingBucket = (typeof AGING)[number];

export function agingBucket(daysLate: number): AgingBucket {
  if (daysLate <= 0) return 'current';
  if (daysLate <= 7) return 'd1_7';
  return daysLate <= 30 ? 'd8_30' : 'd31';
}

type PaymentLike = Pick<CreditPayment, 'customerId' | 'amountCents' | 'createdAt'>;

/** Credit sales and payments of each customer, grouped once (not filtered again for each customer). */
export function byCustomer<T extends { customerId?: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.customerId) continue;
    const list = out.get(r.customerId);
    if (list) list.push(r);
    else out.set(r.customerId, [r]);
  }
  return out;
}

/** How punctually a customer pays: each credit purchase against its due date (see punctuality). */
export function customerPunctuality(sales: CreditSale[], payments: PaymentLike[], today: string): Punctuality {
  const debts = sales
    .filter((s) => s.method === 'credit' && !s.voidedAt)
    .map((s) => ({ createdAt: s.createdAt, dueDate: dueDateOf(s), amountCents: s.totalCents }));
  return punctuality(debts, payments, today);
}

export interface DebtorRow {
  customer: Customer;
  balanceCents: Cents;
  /** Owed and past its due date. */
  overdueCents: Cents;
  /** Days late of the oldest overdue debt (undefined when nothing is overdue). */
  daysOverdue?: number;
  buckets: Record<AgingBucket, Cents>;
  punctuality: Punctuality;
}

export interface DebtorsReport {
  rows: DebtorRow[];
  totals: Record<AgingBucket, Cents> & { balanceCents: Cents; overdueCents: Cents };
}

const empty = (): Record<AgingBucket, Cents> => ({ current: 0, d1_7: 0, d8_30: 0, d31: 0 });

/** Every customer who owes, most overdue money first, with the debt split by age. */
export function debtorsReport(customers: Customer[], sales: CreditSale[], payments: PaymentLike[], now: Date): DebtorsReport {
  const today = toLocalDateString(now);
  const salesOf = byCustomer(sales);
  const paymentsOf = byCustomer(payments);
  const totals = { ...empty(), balanceCents: 0, overdueCents: 0 };
  const rows: DebtorRow[] = [];
  for (const b of creditBook(customers, sales, payments, now)) {
    if (b.balanceCents <= 0) continue;
    const id = b.customer.id;
    const mySales = salesOf.get(id) ?? [];
    const myPayments = paymentsOf.get(id) ?? [];
    const buckets = empty();
    let daysOverdue: number | undefined;
    for (const item of openItems(id, mySales, myPayments)) {
      const late = daysBetweenDateStrings(item.dueDate, today);
      buckets[agingBucket(late)] += item.remainingCents;
      if (late > 0 && (daysOverdue === undefined || late > daysOverdue)) daysOverdue = late;
    }
    const overdueCents = buckets.d1_7 + buckets.d8_30 + buckets.d31;
    rows.push({
      customer: b.customer,
      balanceCents: b.balanceCents,
      overdueCents,
      ...(daysOverdue !== undefined ? { daysOverdue } : {}),
      buckets,
      punctuality: customerPunctuality(mySales, myPayments, today),
    });
    for (const k of AGING) totals[k] += buckets[k];
    totals.balanceCents += b.balanceCents;
    totals.overdueCents += overdueCents;
  }
  rows.sort((a, b) => b.overdueCents - a.overdueCents || b.balanceCents - a.balanceCents);
  return { rows, totals };
}
