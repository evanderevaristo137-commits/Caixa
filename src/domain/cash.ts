import type { Cents, Expense, ExpenseCategory } from './types';

type ExpenseLike = Pick<Expense, 'category' | 'amountCents' | 'fromCash' | 'voidedAt'>;

export interface OutflowSummary {
  /** Expenses (owner's withdrawals excluded): they lower the day's result. */
  expensesCents: Cents;
  /** Money the owner took out (not an expense). */
  withdrawalsCents: Cents;
  /** Everything paid with money from the till (expenses and withdrawals). */
  cashOutCents: Cents;
  byCategory: Partial<Record<ExpenseCategory, Cents>>;
  /** Valid records (voided ones are left out). */
  count: number;
}

export function summariseOutflows(expenses: ExpenseLike[]): OutflowSummary {
  const out: OutflowSummary = { expensesCents: 0, withdrawalsCents: 0, cashOutCents: 0, byCategory: {}, count: 0 };
  for (const e of expenses) {
    if (e.voidedAt) continue;
    out.count += 1;
    if (e.category === 'withdrawal') out.withdrawalsCents += e.amountCents;
    else out.expensesCents += e.amountCents;
    if (e.fromCash) out.cashOutCents += e.amountCents;
    out.byCategory[e.category] = (out.byCategory[e.category] ?? 0) + e.amountCents;
  }
  return out;
}

export interface Drawer {
  floatCents: Cents;
  cashSalesCents: Cents;
  cashCreditPaymentsCents: Cents;
  /** Expenses and withdrawals paid from the till. */
  cashOutCents: Cents;
  /** Purchases and supplier payments paid from the till. */
  cashPurchasesCents: Cents;
  /** Float + cash sales + customers' cash payments − everything paid from the till. */
  expectedCents: Cents;
}

export function drawer(parts: Omit<Drawer, 'expectedCents' | 'cashPurchasesCents'> & { cashPurchasesCents?: Cents }): Drawer {
  const cashPurchasesCents = parts.cashPurchasesCents ?? 0;
  return {
    ...parts,
    cashPurchasesCents,
    expectedCents: parts.floatCents + parts.cashSalesCents + parts.cashCreditPaymentsCents - parts.cashOutCents - cashPurchasesCents,
  };
}

export type CloseState = 'exact' | 'over' | 'short';

/** Counted against expected: "bate certo", "sobram" or "faltam". */
export function closeResult(expectedCents: Cents, countedCents: Cents): { differenceCents: Cents; state: CloseState } {
  const differenceCents = countedCents - expectedCents;
  return { differenceCents, state: differenceCents === 0 ? 'exact' : differenceCents > 0 ? 'over' : 'short' };
}
