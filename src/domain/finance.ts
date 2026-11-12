import { addDays, startOfLocalDay } from '../lib/dates';
import { summariseOutflows } from './cash';
import { summariseProfit, type ProfitSummary } from './profit';
import type { Cents, CreditPayment, Expense, Purchase, Sale, SaleReturn, SupplierPayment } from './types';
import { isMoneyIn, isPaymentPending } from './types';

/**
 * The shop's money over a period, as the owner asks about it:
 * - sold and received side by side: a sale on credit is sold but not yet received, a payment of an
 *   old debt is received but not sold now, and an electronic payment still to confirm is not received yet;
 * - money in and out (cash flow): everything that came in and went out, whatever the reason;
 * - the estimated result: sales − cost of the goods sold − expenses, from the cost prices the shop
 *   recorded. An estimate, never accounting.
 */

type SaleLike = Pick<Sale, 'createdAt' | 'totalCents' | 'method' | 'voidedAt' | 'items' | 'pendingSince' | 'confirmedAt'>;
type PaymentLike = Pick<CreditPayment, 'createdAt' | 'amountCents' | 'method'>;
type ExpenseLike = Pick<Expense, 'createdAt' | 'category' | 'amountCents' | 'fromCash' | 'voidedAt'>;
type PurchaseLike = Pick<Purchase, 'createdAt' | 'totalCents' | 'payment' | 'voidedAt'>;
type SupplierPaymentLike = Pick<SupplierPayment, 'createdAt' | 'amountCents'>;
type ReturnLike = Pick<SaleReturn, 'createdAt' | 'totalCents' | 'refund' | 'items' | 'restock'>;

export interface SoldReceived {
  /** Valid sales, whatever the payment. */
  soldCents: Cents;
  count: number;
  /** Of what was sold: on credit (the customers owe it). */
  onCreditCents: Cents;
  /** Of what was sold: electronic payments whose money the shop has not confirmed yet. */
  pendingCents: Cents;
  /** Sales paid at the time (cash, or electronic and not waiting) plus customers paying their debts. */
  receivedCents: Cents;
  salesPaidCents: Cents;
  /** Customers paying what they owed (money only: goods returned are not money). */
  customersCents: Cents;
}

/** Sold and received of the sales and customer payments given (already of the period). */
export function soldAndReceived(sales: SaleLike[], payments: PaymentLike[]): SoldReceived {
  const out: SoldReceived = {
    soldCents: 0,
    count: 0,
    onCreditCents: 0,
    pendingCents: 0,
    receivedCents: 0,
    salesPaidCents: 0,
    customersCents: 0,
  };
  for (const s of sales) {
    if (s.voidedAt) continue;
    out.soldCents += s.totalCents;
    out.count += 1;
    if (s.method === 'credit') out.onCreditCents += s.totalCents;
    else if (isPaymentPending(s)) out.pendingCents += s.totalCents;
    else out.salesPaidCents += s.totalCents;
  }
  for (const p of payments) if (isMoneyIn(p)) out.customersCents += p.amountCents;
  out.receivedCents = out.salesPaidCents + out.customersCents;
  return out;
}

export interface MoneyFlow {
  /** In: cash (sales and customers paying in cash) and other ways (electronic, transfer, TPA). */
  inCashCents: Cents;
  inOtherCents: Cents;
  inCents: Cents;
  /** Out: expenses, goods bought and paid (at the time or later, to suppliers), money given back, owner, INSS. */
  expensesCents: Cents;
  goodsCents: Cents;
  refundsCents: Cents;
  withdrawalsCents: Cents;
  inssCents: Cents;
  outCents: Cents;
  /** In − out: positive when more came in than went out. */
  balanceCents: Cents;
}

export interface FinanceInput {
  sales: SaleLike[];
  payments: PaymentLike[];
  expenses: ExpenseLike[];
  purchases: PurchaseLike[];
  supplierPayments: SupplierPaymentLike[];
  returns: ReturnLike[];
}

export interface Finance {
  sold: SoldReceived;
  flow: MoneyFlow;
  result: {
    soldCents: Cents;
    /** Taken back by returns: money given back, or taken off a customer's debt. */
    returnsCents: Cents;
    /** Lines with a cost price (returns included); lines without one are counted apart. */
    profit: ProfitSummary;
    expensesCents: Cents;
    /** Estimated gross profit − expenses; undefined when no line had a cost price (nothing to estimate). */
    resultCents: Cents | undefined;
  };
}

/** Everything the period's records say about money. Records outside [from, to) are left out. */
export function financeSummary(input: FinanceInput, from: Date, to: Date): Finance {
  // ISO dates compare as text: no date parsing for each of thousands of records.
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const inPeriod = <T extends { createdAt: string }>(rows: T[]) => rows.filter((r) => r.createdAt >= fromIso && r.createdAt < toIso);
  const sales = inPeriod(input.sales).filter((s) => !s.voidedAt);
  const payments = inPeriod(input.payments).filter(isMoneyIn);
  const returns = inPeriod(input.returns);
  const outflows = summariseOutflows(inPeriod(input.expenses));

  const sold = soldAndReceived(sales, payments);
  const salesCash = sales.filter((s) => s.method === 'cash').reduce((a, s) => a + s.totalCents, 0);
  const paymentsCash = payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amountCents, 0);
  const inCashCents = salesCash + paymentsCash;
  const inOtherCents = sold.receivedCents - inCashCents;
  const goodsCents =
    inPeriod(input.purchases)
      .filter((p) => !p.voidedAt && p.payment !== 'credit')
      .reduce((a, p) => a + p.totalCents, 0) + inPeriod(input.supplierPayments).reduce((a, p) => a + p.amountCents, 0);
  const refundsCents = returns.filter((r) => r.refund !== 'debt').reduce((a, r) => a + r.totalCents, 0);
  const outCents = outflows.expensesCents + goodsCents + refundsCents + outflows.withdrawalsCents + outflows.inssCents;
  const inCents = inCashCents + inOtherCents;

  const profit = summariseProfit(sales, returns);
  const known = profit.revenueCents !== 0 || profit.costCents !== 0;
  return {
    sold,
    flow: {
      inCashCents,
      inOtherCents,
      inCents,
      expensesCents: outflows.expensesCents,
      goodsCents,
      refundsCents,
      withdrawalsCents: outflows.withdrawalsCents,
      inssCents: outflows.inssCents,
      outCents,
      balanceCents: inCents - outCents,
    },
    result: {
      soldCents: sold.soldCents,
      returnsCents: returns.reduce((a, r) => a + r.totalCents, 0),
      profit,
      expensesCents: outflows.expensesCents,
      resultCents: known ? profit.profitCents - outflows.expensesCents : undefined,
    },
  };
}

/** Periods the owner can choose; 'custom' takes two dates. */
export const FINANCE_PERIODS = ['today', 'yesterday', '7d', 'month', 'lastMonth', 'custom'] as const;
export type FinancePeriod = (typeof FINANCE_PERIODS)[number];

/** Longest custom period, in days (a year): enough for any question, light enough for a cheap phone. */
export const MAX_CUSTOM_DAYS = 366;

/**
 * The days a period covers, in the phone's calendar: from <= createdAt < to.
 * 'custom': from the first day to the last one, both included ("YYYY-MM-DD"); null when the dates do
 * not make a period (missing, the wrong way round, in the future, or longer than a year).
 */
export function financeRange(period: FinancePeriod, now: Date, custom?: { first: string; last: string }): { from: Date; to: Date } | null {
  const today = startOfLocalDay(now);
  switch (period) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case '7d':
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: addDays(today, 1) };
    case 'lastMonth':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'custom': {
      const first = custom && localDay(custom.first);
      const last = custom && localDay(custom.last);
      if (!first || !last || last < first || last > today) return null;
      const to = addDays(last, 1);
      if ((to.getTime() - first.getTime()) / 86_400_000 > MAX_CUSTOM_DAYS + 0.5) return null;
      return { from: first, to };
    }
  }
}

/** "2026-11-12" → that day at 00:00 on the phone's clock (null when it is not a date). */
function localDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
