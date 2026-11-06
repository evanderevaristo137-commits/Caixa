import { calendarDaysBetween } from '../lib/dates';
import type { Cents, CreditPayment, Customer, Sale } from './types';

export type CreditSale = Pick<Sale, 'customerId' | 'method' | 'totalCents' | 'createdAt' | 'voidedAt'>;

export interface CreditStatus {
  customerId: string;
  /** Total bought on fiado minus total paid back. */
  balanceCents: Cents;
  totalCreditCents: Cents;
  totalPaidCents: Cents;
  /** Date of the oldest fiado purchase that is still (partly) unpaid. */
  oldestUnpaidAt?: string;
  /** Days since the oldest unpaid purchase (0 = today). Undefined when nothing is owed. */
  daysOutstanding?: number;
}

/**
 * Computes a customer's fiado balance. Payments settle the oldest purchases first,
 * so "há quantos dias" always refers to the oldest debt that is still open.
 */
export function creditStatus(
  customerId: string,
  sales: CreditSale[],
  payments: Pick<CreditPayment, 'customerId' | 'amountCents'>[],
  now: Date,
): CreditStatus {
  const creditSales = sales
    .filter((s) => s.method === 'credit' && s.customerId === customerId && !s.voidedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const totalCreditCents = creditSales.reduce((acc, s) => acc + s.totalCents, 0);
  const totalPaidCents = payments.filter((p) => p.customerId === customerId).reduce((acc, p) => acc + p.amountCents, 0);

  let remainingPaid = totalPaidCents;
  let oldestUnpaidAt: string | undefined;
  for (const sale of creditSales) {
    if (remainingPaid >= sale.totalCents) {
      remainingPaid -= sale.totalCents;
      continue;
    }
    oldestUnpaidAt = sale.createdAt;
    break;
  }

  const balanceCents = totalCreditCents - totalPaidCents;
  return {
    customerId,
    balanceCents,
    totalCreditCents,
    totalPaidCents,
    oldestUnpaidAt: balanceCents > 0 ? oldestUnpaidAt : undefined,
    daysOutstanding: balanceCents > 0 && oldestUnpaidAt ? calendarDaysBetween(new Date(oldestUnpaidAt), now) : undefined,
  };
}

export interface CustomerWithCredit extends CreditStatus {
  customer: Customer;
}

/** All customers with their balance, those who owe the most days first. */
export function creditBook(
  customers: Customer[],
  sales: CreditSale[],
  payments: Pick<CreditPayment, 'customerId' | 'amountCents'>[],
  now: Date,
): CustomerWithCredit[] {
  return customers
    .map((customer) => ({ customer, ...creditStatus(customer.id, sales, payments, now) }))
    .sort((a, b) => {
      if ((b.balanceCents > 0 ? 1 : 0) !== (a.balanceCents > 0 ? 1 : 0)) return b.balanceCents > 0 ? 1 : -1;
      return (b.daysOutstanding ?? -1) - (a.daysOutstanding ?? -1) || b.balanceCents - a.balanceCents;
    });
}

export function totalOutstanding(book: Pick<CreditStatus, 'balanceCents'>[]): Cents {
  return book.reduce((acc, c) => acc + Math.max(0, c.balanceCents), 0);
}

/** Validates a payment amount against what the customer owes. */
export function validateCreditPayment(amountCents: Cents, balanceCents: Cents): 'ok' | 'zero' | 'too_much' {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'zero';
  if (amountCents > balanceCents) return 'too_much';
  return 'ok';
}
