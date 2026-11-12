import { addDays, startOfLocalDay } from '../lib/dates';
import { PROVIDER_METHODS, type Cents, type CreditPayment, type PaymentMethod, type Sale } from './types';

/**
 * Watch over digital receipts (credit for stock, phase 4). The loan is repaid by retaining a share
 * of every digital payment, so a shop could try to escape the retention by asking customers to pay
 * cash. The contract therefore asks for a minimum share of digital receipts, and the app raises an
 * alarm when digital receipts fall suddenly while sales do not.
 *
 * Receipts = money that came in: sales paid at once (cash or digital) + customers paying their debt.
 * Credit sales are not receipts until they are paid.
 */

export const DIGITAL_METHODS: readonly PaymentMethod[] = PROVIDER_METHODS;
export const isDigital = (m: PaymentMethod) => DIGITAL_METHODS.includes(m);

/** Alarm rules (also written in docs/legal/condicoes-credito-stock.md; to agree with the partner bank). */
export const WATCH = {
  /** Days measured: the last complete days, ending yesterday (the number changes once a day). */
  windowDays: 7,
  /** Comparison: the 4 weeks before. */
  baselineDays: 28,
  /** A sudden drop is only judged with enough history: days with receipts in the 4 weeks… */
  minBaselineActiveDays: 10,
  /** …and at least 10.000 Kz of digital receipts per week (below that, noise). */
  minBaselineWeeklyDigitalCents: 1_000_000,
  /** Digital receipts down 40% or more… */
  digitalDropBp: 4000,
  /** …while all receipts fell less than 25% (the money moved to cash). */
  totalStableBp: 2500,
  /** Or the digital share fell 15 percentage points or more. */
  shareDropBp: 1500,
} as const;

type SaleLike = Pick<Sale, 'createdAt' | 'totalCents' | 'method' | 'voidedAt'>;
type PaymentLike = Pick<CreditPayment, 'createdAt' | 'amountCents' | 'method'>;

export interface Receipts {
  digitalCents: Cents;
  totalCents: Cents;
  /** Days with at least one receipt. */
  activeDays: number;
  /** Digital share in basis points (0 when nothing came in). */
  shareBp: number;
}

export function receipts(sales: SaleLike[], payments: PaymentLike[], fromMs: number, toMs: number): Receipts {
  let digitalCents = 0;
  let totalCents = 0;
  const days = new Set<number>();
  const add = (iso: string, cents: Cents, method: PaymentMethod) => {
    const t = new Date(iso).getTime();
    if (t < fromMs || t >= toMs) return;
    totalCents += cents;
    if (isDigital(method)) digitalCents += cents;
    days.add(startOfLocalDay(new Date(iso)).getTime());
  };
  for (const s of sales) if (!s.voidedAt && s.method !== 'credit') add(s.createdAt, s.totalCents, s.method);
  for (const p of payments) add(p.createdAt, p.amountCents, p.method);
  return {
    digitalCents,
    totalCents,
    activeDays: days.size,
    shareBp: totalCents > 0 ? Math.round((digitalCents * 10_000) / totalCents) : 0,
  };
}

export interface DigitalStatus {
  /** The last 7 complete days. */
  week: Receipts;
  /** Average week of the 4 weeks before (undefined: not enough history to judge a sudden drop). */
  baseline?: { weeklyDigitalCents: Cents; weeklyTotalCents: Cents; shareBp: number };
  /** Minimum digital share from the credit contract, when there is one. */
  minShareBp?: number;
  belowMinimum: boolean;
  suddenDrop: boolean;
  /** Change of digital receipts and of all receipts against the average week before (basis points). */
  digitalChangeBp?: number;
  totalChangeBp?: number;
  alarm: boolean;
}

const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) * 10_000) / before) : 0);

export function digitalStatus(sales: SaleLike[], payments: PaymentLike[], now: Date, minShareBp?: number): DigitalStatus {
  const end = startOfLocalDay(now).getTime(); // up to yesterday, included
  const weekStart = addDays(startOfLocalDay(now), -WATCH.windowDays).getTime();
  const baseStart = addDays(new Date(weekStart), -WATCH.baselineDays).getTime();
  const week = receipts(sales, payments, weekStart, end);
  const before = receipts(sales, payments, baseStart, weekStart);
  const weeks = WATCH.baselineDays / 7;

  const belowMinimum = minShareBp !== undefined && week.totalCents > 0 && week.shareBp < minShareBp;
  const status: DigitalStatus = { week, minShareBp, belowMinimum, suddenDrop: false, alarm: belowMinimum };

  const enoughHistory =
    before.activeDays >= WATCH.minBaselineActiveDays && before.digitalCents / weeks >= WATCH.minBaselineWeeklyDigitalCents;
  if (!enoughHistory) return status;

  const baseline = {
    weeklyDigitalCents: Math.round(before.digitalCents / weeks),
    weeklyTotalCents: Math.round(before.totalCents / weeks),
    shareBp: before.shareBp,
  };
  const digitalChangeBp = change(week.digitalCents, baseline.weeklyDigitalCents);
  const totalChangeBp = change(week.totalCents, baseline.weeklyTotalCents);
  const movedToCash = digitalChangeBp <= -WATCH.digitalDropBp && totalChangeBp > -WATCH.totalStableBp;
  const shareFell = week.totalCents > 0 && baseline.shareBp - week.shareBp >= WATCH.shareDropBp;
  const suddenDrop = movedToCash || shareFell;
  return { ...status, baseline, digitalChangeBp, totalChangeBp, suddenDrop, alarm: belowMinimum || suddenDrop };
}
