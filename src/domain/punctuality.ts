import { daysBetweenDateStrings, toLocalDateString } from '../lib/dates';
import { compareText } from './ranking';
import type { Cents, IsoDate } from './types';

/**
 * How punctually debts get paid (customers paying the shop, or the shop paying its suppliers).
 * As in the accounts, payments settle the oldest debts first; a debt is paid on the day the payments
 * reach its amount, and it is on time when that day is on or before its due date. Debts still open
 * and already past their due date count as late, so far.
 */

export interface Debt {
  createdAt: IsoDate;
  /** "YYYY-MM-DD" */
  dueDate: string;
  amountCents: Cents;
}

export interface Payment {
  createdAt: IsoDate;
  amountCents: Cents;
}

/** Fewer debts than this to judge: no verdict yet (one late payment says little). */
export const MIN_DEBTS_TO_JUDGE = 3;

export interface Punctuality {
  /** Debts fully paid on or before their due date. */
  onTime: number;
  /** Debts fully paid after their due date. */
  late: number;
  /** Debts still open and already past their due date. */
  openLate: number;
  /** Average days late, of the debts paid late and those open and late (undefined when none). */
  avgDaysLate?: number;
  /** Paid on time ÷ (paid + open and late), in basis points; undefined with fewer than MIN_DEBTS_TO_JUDGE. */
  onTimeBp?: number;
  /** 'good': 80% or more on time; 'fair': 50% or more; 'poor': less. Undefined without enough history. */
  verdict?: 'good' | 'fair' | 'poor';
}

export function punctuality(debts: Debt[], payments: Payment[], today: string): Punctuality {
  const owed = [...debts].filter((d) => d.amountCents > 0).sort((a, b) => compareText(a.createdAt, b.createdAt));
  const paid = [...payments].filter((p) => p.amountCents > 0).sort((a, b) => compareText(a.createdAt, b.createdAt));
  let onTime = 0;
  let late = 0;
  let openLate = 0;
  let daysLate = 0;
  let p = 0;
  let available = 0; // money of the payments read so far not yet used
  let paidOn = '';
  for (const d of owed) {
    // Read payments until this debt is covered (or there are none left).
    while (available < d.amountCents && p < paid.length) {
      available += paid[p]!.amountCents;
      paidOn = toLocalDateString(new Date(paid[p]!.createdAt));
      p += 1;
    }
    if (available >= d.amountCents) {
      available -= d.amountCents;
      const days = daysBetweenDateStrings(d.dueDate, paidOn);
      if (days > 0) {
        late += 1;
        daysLate += days;
      } else onTime += 1;
    } else {
      // Not paid yet (what is left of the payments goes to it, but it is still open).
      available = 0;
      const days = daysBetweenDateStrings(d.dueDate, today);
      if (days > 0) {
        openLate += 1;
        daysLate += days;
      }
    }
  }
  const judged = onTime + late + openLate;
  const lateCount = late + openLate;
  const out: Punctuality = { onTime, late, openLate };
  if (lateCount > 0) out.avgDaysLate = Math.round(daysLate / lateCount);
  if (judged >= MIN_DEBTS_TO_JUDGE) {
    out.onTimeBp = Math.round((onTime * 10_000) / judged);
    out.verdict = out.onTimeBp >= 8_000 ? 'good' : out.onTimeBp >= 5_000 ? 'fair' : 'poor';
  }
  return out;
}
