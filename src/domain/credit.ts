import { addDays, addDaysToDateString, calendarDaysBetween, daysBetweenDateStrings, toLocalDateString } from '../lib/dates';
import type { Cents, CreditPayment, Customer, Sale } from './types';

export type CreditSale = Pick<Sale, 'customerId' | 'method' | 'totalCents' | 'createdAt' | 'voidedAt' | 'dueDate'> & { id?: string };
type PaymentLike = Pick<CreditPayment, 'customerId' | 'amountCents'>;

/** Payment term used when a credit sale has no due date (sales made before due dates existed). */
export const DEFAULT_TERM_DAYS = 15;
/** "Soon" means due within this many days: the shopkeeper and the customer are reminded. */
export const SOON_DAYS = 2;

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** A credit purchase that is not fully paid yet. */
export interface OpenItem {
  saleId?: string;
  createdAt: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  remainingCents: Cents;
}

export interface CreditStatus {
  customerId: string;
  /** Total bought on credit minus total paid back (negative = money in the customer's favour). */
  balanceCents: Cents;
  totalCreditCents: Cents;
  totalPaidCents: Cents;
  /** Date of the oldest credit purchase that is still (partly) unpaid. */
  oldestUnpaidAt?: string;
  /** Days since the oldest unpaid purchase (0 = today). Undefined when nothing is owed. */
  daysOutstanding?: number;
  /** Earliest due date among the open purchases ("YYYY-MM-DD"). */
  nextDueDate?: string;
  dueState?: DueState;
  /** Days past the due date (overdue only). */
  daysOverdue?: number;
  /** Days until the due date (today/soon/later; 0 = today). */
  daysUntilDue?: number;
  /** Amount whose due date is today or earlier. */
  dueNowCents: Cents;
  /** Amount to mention in a reminder: what is due by the next due date. */
  reminderAmountCents: Cents;
}

export function dueDateOf(sale: Pick<Sale, 'createdAt' | 'dueDate'>): string {
  return sale.dueDate ?? toLocalDateString(addDays(new Date(sale.createdAt), DEFAULT_TERM_DAYS));
}

/**
 * Open credit purchases of one customer. Payments settle the oldest purchases first,
 * so what remains open is always the most recent debt.
 */
export function openItems(customerId: string, sales: CreditSale[], payments: PaymentLike[]): OpenItem[] {
  const creditSales = sales
    .filter((s) => s.method === 'credit' && s.customerId === customerId && !s.voidedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let paid = payments.filter((p) => p.customerId === customerId).reduce((acc, p) => acc + p.amountCents, 0);
  const open: OpenItem[] = [];
  for (const sale of creditSales) {
    const covered = Math.min(paid, sale.totalCents);
    paid -= covered;
    const remainingCents = sale.totalCents - covered;
    if (remainingCents > 0) open.push({ saleId: sale.id, createdAt: sale.createdAt, dueDate: dueDateOf(sale), remainingCents });
  }
  return open;
}

export function dueStateOf(dueDate: string, today: string): DueState {
  const days = daysBetweenDateStrings(today, dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= SOON_DAYS ? 'soon' : 'later';
}

export function creditStatus(customerId: string, sales: CreditSale[], payments: PaymentLike[], now: Date): CreditStatus {
  const valid = sales.filter((s) => s.method === 'credit' && s.customerId === customerId && !s.voidedAt);
  const totalCreditCents = valid.reduce((acc, s) => acc + s.totalCents, 0);
  const totalPaidCents = payments.filter((p) => p.customerId === customerId).reduce((acc, p) => acc + p.amountCents, 0);
  const balanceCents = totalCreditCents - totalPaidCents;
  const today = toLocalDateString(now);
  const open = balanceCents > 0 ? openItems(customerId, sales, payments) : [];

  const base: CreditStatus = { customerId, balanceCents, totalCreditCents, totalPaidCents, dueNowCents: 0, reminderAmountCents: 0 };
  if (open.length === 0) return base;

  const oldest = open[0]!;
  const nextDueDate = open.reduce((min, i) => (i.dueDate < min ? i.dueDate : min), oldest.dueDate);
  const dueState = dueStateOf(nextDueDate, today);
  const daysToDue = daysBetweenDateStrings(today, nextDueDate);
  const dueNowCents = open.filter((i) => i.dueDate <= today).reduce((a, i) => a + i.remainingCents, 0);
  const reminderLimit = nextDueDate > today ? nextDueDate : today;
  const reminderAmountCents = open.filter((i) => i.dueDate <= reminderLimit).reduce((a, i) => a + i.remainingCents, 0);

  return {
    ...base,
    oldestUnpaidAt: oldest.createdAt,
    daysOutstanding: calendarDaysBetween(new Date(oldest.createdAt), now),
    nextDueDate,
    dueState,
    daysOverdue: dueState === 'overdue' ? -daysToDue : undefined,
    daysUntilDue: dueState === 'overdue' ? undefined : daysToDue,
    dueNowCents,
    reminderAmountCents,
  };
}

export interface CustomerWithCredit extends CreditStatus {
  customer: Customer;
}

const URGENCY: Record<DueState, number> = { overdue: 0, today: 1, soon: 2, later: 3 };

/** All customers with their balance: overdue first (longest first), then due today, soon, later, then settled. */
export function creditBook(customers: Customer[], sales: CreditSale[], payments: PaymentLike[], now: Date): CustomerWithCredit[] {
  const rank = (c: CreditStatus) => (c.balanceCents > 0 && c.dueState ? URGENCY[c.dueState] : 4);
  return customers
    .map((customer) => ({ customer, ...creditStatus(customer.id, sales, payments, now) }))
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (a.dueState === 'overdue' && b.dueState === 'overdue') return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
      return (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0) || b.balanceCents - a.balanceCents;
    });
}

export function totalOutstanding(book: Pick<CreditStatus, 'balanceCents'>[]): Cents {
  return book.reduce((acc, c) => acc + Math.max(0, c.balanceCents), 0);
}

export interface CreditAlerts {
  overdue: CustomerWithCredit[];
  today: CustomerWithCredit[];
  soon: CustomerWithCredit[];
  /** Customers needing attention now (overdue + due today): shown as a badge. */
  urgentCount: number;
}

/** Customers to remind: overdue, due today, due within SOON_DAYS. */
export function creditAlerts(book: CustomerWithCredit[]): CreditAlerts {
  const owing = book.filter((c) => c.balanceCents > 0);
  const overdue = owing.filter((c) => c.dueState === 'overdue');
  const today = owing.filter((c) => c.dueState === 'today');
  const soon = owing.filter((c) => c.dueState === 'soon');
  return { overdue, today, soon, urgentCount: overdue.length + today.length };
}

/** Due date for a new credit sale, from the term chosen at checkout. */
export function dueDateFromTerm(term: number | 'month_end', now: Date): string {
  if (term === 'month_end') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    // On the last days of the month, "end of month" means the next one.
    return calendarDaysBetween(now, end) < 3
      ? toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 2, 0))
      : toLocalDateString(end);
  }
  return addDaysToDateString(toLocalDateString(now), term);
}

/** Validates a payment amount against what the customer owes. */
export function validateCreditPayment(amountCents: Cents, balanceCents: Cents): 'ok' | 'zero' | 'too_much' {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'zero';
  if (amountCents > balanceCents) return 'too_much';
  return 'ok';
}
