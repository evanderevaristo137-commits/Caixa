import { daysBetweenDateStrings, toLocalDateString } from '../lib/dates';
import { comparePt, compareText } from './ranking';
import { dueStateOf, type DueState } from './credit';
import type { Cents, Purchase, Supplier, SupplierPayment } from './types';

/**
 * What the shop owes its suppliers (purchases on credit). Same rules as the customers' credit,
 * the other way round: payments settle the oldest purchases first.
 */

type PurchaseLike = Pick<Purchase, 'supplierId' | 'payment' | 'totalCents' | 'createdAt' | 'voidedAt' | 'dueDate'>;
type PaymentLike = Pick<SupplierPayment, 'supplierId' | 'amountCents'>;

export interface PayableStatus {
  supplierId: string;
  /** Bought on credit minus paid (negative = money in the shop's favour). */
  balanceCents: Cents;
  nextDueDate?: string;
  dueState?: DueState;
  daysOverdue?: number;
  daysUntilDue?: number;
  /** Amount whose due date is today or earlier. */
  dueNowCents: Cents;
}

export function payableStatus(supplierId: string, purchases: PurchaseLike[], payments: PaymentLike[], now: Date): PayableStatus {
  const onCredit = purchases
    .filter((p) => p.payment === 'credit' && p.supplierId === supplierId && !p.voidedAt)
    .sort((a, b) => compareText(a.createdAt, b.createdAt));
  const totalCredit = onCredit.reduce((a, p) => a + p.totalCents, 0);
  const totalPaid = payments.filter((p) => p.supplierId === supplierId).reduce((a, p) => a + p.amountCents, 0);
  const base: PayableStatus = { supplierId, balanceCents: totalCredit - totalPaid, dueNowCents: 0 };
  if (base.balanceCents <= 0) return base;

  const today = toLocalDateString(now);
  let paid = totalPaid;
  const open: { dueDate: string; remainingCents: Cents }[] = [];
  for (const p of onCredit) {
    const covered = Math.min(paid, p.totalCents);
    paid -= covered;
    if (p.totalCents - covered > 0) open.push({ dueDate: p.dueDate ?? today, remainingCents: p.totalCents - covered });
  }
  const nextDueDate = open.reduce((min, i) => (i.dueDate < min ? i.dueDate : min), open[0]!.dueDate);
  const dueState = dueStateOf(nextDueDate, today);
  const days = daysBetweenDateStrings(today, nextDueDate);
  return {
    ...base,
    nextDueDate,
    dueState,
    daysOverdue: dueState === 'overdue' ? -days : undefined,
    daysUntilDue: dueState === 'overdue' ? undefined : days,
    dueNowCents: open.filter((i) => i.dueDate <= today).reduce((a, i) => a + i.remainingCents, 0),
  };
}

export interface SupplierWithPayable extends PayableStatus {
  supplier: Supplier;
}

const URGENCY: Record<DueState, number> = { overdue: 0, today: 1, soon: 2, later: 3 };

/** Every supplier with what the shop owes: overdue first, then due today, soon, later, then nothing owed. */
export function payablesBook(suppliers: Supplier[], purchases: PurchaseLike[], payments: PaymentLike[], now: Date): SupplierWithPayable[] {
  const rank = (s: PayableStatus) => (s.balanceCents > 0 && s.dueState ? URGENCY[s.dueState] : 4);
  return suppliers
    .map((supplier) => ({ supplier, ...payableStatus(supplier.id, purchases, payments, now) }))
    .sort(
      (a, b) => rank(a) - rank(b) || compareText(a.nextDueDate ?? '', b.nextDueDate ?? '') || comparePt(a.supplier.name, b.supplier.name),
    );
}

/** Total the shop owes all suppliers right now. */
export const totalPayable = (book: PayableStatus[]): Cents => book.reduce((a, s) => a + Math.max(0, s.balanceCents), 0);
