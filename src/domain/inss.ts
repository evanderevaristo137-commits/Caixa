import { t } from '../i18n/pt-AO';
import { addDaysToDateString, daysBetweenDateStrings, toLocalDateString } from '../lib/dates';
import type { Cents, Expense, InssContribution, InssModality, InssPlan } from './types';

/**
 * Retirement through the INSS for people who work for themselves (Decreto Presidencial n.º 97/22).
 * The owner pays a share of a declared income every month and, at 60 with at least 15 years of
 * contributions, gets a pension for life. The app only helps to save, to remember and to keep
 * a record: the money is always paid to the INSS, never to the app.
 *
 * Rules as known in November 2026. The sources, and what still has to be confirmed with the
 * INSS, are in docs/INSS.md: change the numbers here when something is confirmed or changes.
 */
export const INSS_RULES = {
  asOf: '2026-11',
  /** National minimum wage: 100.000 Kz since September 2025 (Decreto Presidencial n.º 152/24). */
  minimumWageCents: 10_000_000,
  /** The declared income is a whole number of minimum wages, from 1 to this many. */
  maxWages: 35,
  /** Share of the declared income paid each month, in basis points (800 = 8%). */
  rateBp: { normal: 800, extended: 1100 } satisfies Record<InssModality, number>,
  /** A month's contribution is paid by this day of the following month. */
  dueDay: 10,
  retirementAge: 60,
  /** A full career: the pension is the declared income × months ÷ 420. */
  fullCareerMonths: 420,
  /** With fewer months than this there is no pension. */
  minimumMonths: 180,
} as const;

/** Days before the due date when the phone starts to remind, and days after it when it stops. */
export const INSS_REMIND = { before: 2, after: 5 } as const;

export type PlanError = 'invalid_wages' | 'invalid_modality' | 'invalid_birth_year' | 'invalid_months' | 'invalid_month';

export const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function validatePlan(plan: InssPlan, now: Date): PlanError | null {
  if (!Number.isInteger(plan.wages) || plan.wages < 1 || plan.wages > INSS_RULES.maxWages) return 'invalid_wages';
  if (!(plan.modality in INSS_RULES.rateBp)) return 'invalid_modality';
  if (!isMonth(plan.startMonth)) return 'invalid_month';
  const year = now.getFullYear();
  // Between 16 and 100 years old.
  if (plan.birthYear !== undefined && (!Number.isInteger(plan.birthYear) || plan.birthYear < year - 100 || plan.birthYear > year - 16)) {
    return 'invalid_birth_year';
  }
  if (plan.monthsBefore !== undefined && (!Number.isInteger(plan.monthsBefore) || plan.monthsBefore < 0 || plan.monthsBefore > 600)) {
    return 'invalid_months';
  }
  return null;
}

/** Declared monthly income. */
export const baseCents = (plan: Pick<InssPlan, 'wages'>): Cents => plan.wages * INSS_RULES.minimumWageCents;

/** What is paid to the INSS each month. */
export const monthlyCents = (plan: Pick<InssPlan, 'wages' | 'modality'>): Cents =>
  Math.round((baseCents(plan) * INSS_RULES.rateBp[plan.modality]) / 10_000);

/** What to set aside each day to have the month's contribution, rounded up to 10 Kz ("270 Kz por dia"). */
export const dailyCents = (monthly: Cents): Cents => Math.ceil(monthly / 30 / 1000) * 1000;

/** Pension for this many contributed months, in today's money, rounded to 100 Kz. None below the minimum. */
export function pensionCents(base: Cents, months: number): Cents {
  if (months < INSS_RULES.minimumMonths) return 0;
  const counted = Math.min(months, INSS_RULES.fullCareerMonths);
  return Math.round((base * counted) / INSS_RULES.fullCareerMonths / 10_000) * 10_000;
}

export interface PensionEstimate {
  monthlyCents: Cents;
  /** Months already contributed (before the app and recorded in it). */
  monthsSoFar: number;
  /** Months still to pay, paying every month from now on. */
  monthsToPay: number;
  /** Age when the pension starts. */
  retireAge: number;
  /** Contributed months at that age. */
  careerMonths: number;
  pensionCents: Cents;
  totalToPayCents: Cents;
  /** Months of pension that give back everything still to pay. */
  paybackMonths: number;
  /** True when 60 comes before the 15 years of contributions: the pension starts later. */
  late: boolean;
}

/** The owner's own estimate (null without the year of birth). Ages are counted in whole years. */
export function estimatePension(plan: InssPlan, paidMonths: number, now: Date): PensionEstimate | null {
  if (plan.birthYear === undefined) return null;
  const age = now.getFullYear() - plan.birthYear;
  const monthsToRetirementAge = Math.max(0, INSS_RULES.retirementAge - age) * 12;
  const monthsSoFar = (plan.monthsBefore ?? 0) + paidMonths;
  const toFull = Math.max(0, INSS_RULES.fullCareerMonths - monthsSoFar);
  const toMinimum = Math.max(0, INSS_RULES.minimumMonths - monthsSoFar);
  // A full career can come before 60; otherwise pay until 60, or longer when 15 years are not reached by then.
  const monthsToPay = toFull <= monthsToRetirementAge ? toFull : Math.max(monthsToRetirementAge, toMinimum);
  const careerMonths = monthsSoFar + monthsToPay;
  const monthly = monthlyCents(plan);
  const pension = pensionCents(baseCents(plan), careerMonths);
  const totalToPayCents = monthly * monthsToPay;
  return {
    monthlyCents: monthly,
    monthsSoFar,
    monthsToPay,
    retireAge: age + Math.ceil(monthsToPay / 12),
    careerMonths,
    pensionCents: pension,
    totalToPayCents,
    paybackMonths: pension > 0 ? Math.ceil(totalToPayCents / pension) : 0,
    late: monthsToPay > monthsToRetirementAge,
  };
}

// ---------- Months ----------

/** The month of a date, "YYYY-MM" (the phone's calendar). */
export const monthOf = (d: Date): string => toLocalDateString(d).slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "Outubro" */
export const monthName = (month: string): string => t.common.months[Number(month.slice(5, 7)) - 1] ?? month;
/** "Outubro de 2026" */
export const monthLong = (month: string): string => `${monthName(month)} de ${month.slice(0, 4)}`;

/** "10 de Novembro", for a "YYYY-MM-DD" date. */
export const dayLabel = (date: string): string => t.inss.dayOfMonth(Number(date.slice(8, 10)), monthName(date.slice(0, 7)));

/** Note of the outflow recorded when part of a payment came straight out of the till. */
export const paymentNote = (month: string): string => `Pagamento ao INSS de ${monthLong(month)}`;

/** The last day to pay a month's contribution: day 10 of the following month, "YYYY-MM-DD". */
export const dueDateOf = (month: string): string => `${addMonths(month, 1)}-${String(INSS_RULES.dueDay).padStart(2, '0')}`;

// ---------- Contributions ----------

type ContributionLike = Pick<InssContribution, 'month' | 'voidedAt'>;

export interface InssStatus {
  /** Valid contributions recorded in the app, and with the months before the app. */
  paidMonths: number;
  totalMonths: number;
  /** Months paid in a row up to now (0 when a due month was missed). */
  streak: number;
  /** Months whose due date has passed without a payment, oldest first. */
  overdue: string[];
  /** Last month's contribution, when it is not paid and can still be paid on time. */
  pending?: { month: string; dueDate: string; daysLeft: number };
  /** The month to pay next: the oldest one missing, or the current month. */
  nextMonth: string;
  /** Months of contributions still missing to have a pension. */
  monthsToMinimum: number;
}

export function inssStatus(plan: InssPlan, contributions: ContributionLike[], now: Date): InssStatus {
  const today = toLocalDateString(now);
  const thisMonth = monthOf(now);
  const lastMonth = addMonths(thisMonth, -1);
  const paid = new Set(contributions.filter((c) => !c.voidedAt).map((c) => c.month));

  const overdue: string[] = [];
  let pending: InssStatus['pending'];
  // At most 5 years back: enough to show what is missing.
  for (let m = plan.startMonth, i = 0; m <= lastMonth && i < 60; m = addMonths(m, 1), i++) {
    if (paid.has(m)) continue;
    const dueDate = dueDateOf(m);
    if (dueDate < today) overdue.push(m);
    else pending = { month: m, dueDate, daysLeft: daysBetweenDateStrings(today, dueDate) };
  }

  // Months paid in a row, ending at the latest paid month; zero when a due month after it was missed.
  let streak = 0;
  const latest = [...paid].sort().at(-1);
  if (latest !== undefined && !overdue.some((m) => m > latest)) {
    for (let m = latest; paid.has(m); m = addMonths(m, -1)) streak += 1;
  }

  const totalMonths = paid.size + (plan.monthsBefore ?? 0);
  return {
    paidMonths: paid.size,
    totalMonths,
    streak,
    overdue,
    pending,
    nextMonth: overdue[0] ?? pending?.month ?? (paid.has(thisMonth) ? addMonths(thisMonth, 1) : thisMonth),
    monthsToMinimum: Math.max(0, INSS_RULES.minimumMonths - totalMonths),
  };
}

/** One line about the contributions: what is late, what is due now, or that all is in order. */
export function statusLine(status: InssStatus): { text: string; tone: 'ok' | 'due' | 'late' } {
  const [first] = status.overdue;
  if (first !== undefined && status.overdue.length > 1) {
    return { text: t.inss.overdueMany(status.overdue.length, monthLong(first)), tone: 'late' };
  }
  if (first !== undefined) return { text: t.inss.overdueOne(monthName(first), dayLabel(dueDateOf(first))), tone: 'late' };
  const p = status.pending;
  if (p) {
    return {
      text: p.daysLeft === 0 ? t.inss.pendingToday(monthName(p.month)) : t.inss.pending(monthName(p.month), dayLabel(p.dueDate)),
      tone: 'due',
    };
  }
  const next = status.nextMonth;
  return { text: `${t.inss.upToDate} ${t.inss.nextUp(monthName(next), dayLabel(dueDateOf(next)))}`, tone: 'ok' };
}

/** Money set aside for the INSS and not yet used in a payment (never below zero). */
export function savedCents(
  expenses: Pick<Expense, 'category' | 'amountCents' | 'voidedAt'>[],
  contributions: Pick<InssContribution, 'savedUsedCents' | 'voidedAt'>[],
): Cents {
  const setAside = expenses.reduce((a, e) => (e.category === 'inss' && !e.voidedAt ? a + e.amountCents : a), 0);
  const used = contributions.reduce((a, c) => (c.voidedAt ? a : a + c.savedUsedCents), 0);
  return Math.max(0, setAside - used);
}

/** What the phone needs to remind about last month's contribution with the app closed. */
export interface InssAlertItem {
  /** The month the contribution is for: "YYYY-MM", and its name ("Outubro"). */
  month: string;
  label: string;
  /** "YYYY-MM-DD": the last day to pay, and the days between which the phone reminds. */
  dueDate: string;
  from: string;
  until: string;
}

/** Last month's contribution when it is not recorded as paid (null: nothing to remind). */
export function inssAlertItem(plan: InssPlan | undefined, contributions: ContributionLike[], now: Date): InssAlertItem | null {
  if (!plan) return null;
  const month = addMonths(monthOf(now), -1);
  if (month < plan.startMonth || contributions.some((c) => c.month === month && !c.voidedAt)) return null;
  const dueDate = dueDateOf(month);
  return {
    month,
    label: monthName(month),
    dueDate,
    from: addDaysToDateString(dueDate, -INSS_REMIND.before),
    until: addDaysToDateString(dueDate, INSS_REMIND.after),
  };
}
