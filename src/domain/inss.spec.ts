import { describe, expect, it } from 'vitest';
import {
  addMonths,
  baseCents,
  dailyCents,
  dueDateOf,
  estimatePension,
  inssAlertItem,
  inssStatus,
  monthlyCents,
  monthOf,
  pensionCents,
  savedCents,
  statusLine,
  validatePlan,
} from './inss';
import type { InssPlan } from './types';

const plan = (p: Partial<InssPlan> = {}): InssPlan => ({ wages: 1, modality: 'normal', startMonth: '2026-06', ...p });
const paid = (...months: string[]) => months.map((month) => ({ month }));
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0);

describe('INSS: what is paid', () => {
  it('is 8% of the declared minimum wages, or 11% in the extended modality', () => {
    expect(baseCents(plan())).toBe(10_000_000);
    expect(monthlyCents(plan())).toBe(800_000); // 8.000 Kz
    expect(monthlyCents(plan({ modality: 'extended' }))).toBe(1_100_000);
    expect(monthlyCents(plan({ wages: 3 }))).toBe(2_400_000);
  });

  it('suggests a daily amount, rounded up to 10 Kz', () => {
    expect(dailyCents(800_000)).toBe(27_000); // "270 Kz por dia"
    expect(dailyCents(1_100_000)).toBe(37_000);
  });

  it('checks the plan', () => {
    const now = at(2026, 11, 11);
    expect(validatePlan(plan(), now)).toBeNull();
    expect(validatePlan(plan({ wages: 35, birthYear: 2010, monthsBefore: 0 }), now)).toBeNull();
    for (const wages of [0, 36, 1.5]) expect(validatePlan(plan({ wages }), now)).toBe('invalid_wages');
    expect(validatePlan(plan({ birthYear: 2011 }), now)).toBe('invalid_birth_year'); // 15 years old
    expect(validatePlan(plan({ birthYear: 1925 }), now)).toBe('invalid_birth_year');
    expect(validatePlan(plan({ monthsBefore: -1 }), now)).toBe('invalid_months');
    expect(validatePlan(plan({ startMonth: '2026-13' }), now)).toBe('invalid_month');
  });
});

describe('INSS: the pension', () => {
  it('is the declared income × months ÷ 420, and nothing below 15 years', () => {
    const base = 10_000_000;
    expect(pensionCents(base, 179)).toBe(0);
    expect(pensionCents(base, 180)).toBe(4_290_000); // 42.857 → cerca de 42.900 Kz
    expect(pensionCents(base, 240)).toBe(5_710_000);
    expect(pensionCents(base, 300)).toBe(7_140_000);
    expect(pensionCents(base, 420)).toBe(10_000_000);
    expect(pensionCents(base, 500)).toBe(10_000_000);
  });

  it('estimates from the year of birth: pay until 60, at least 15 years', () => {
    const now = at(2026, 11, 11);
    // 45 years old, starting now: 15 years of 8.000 Kz, back in under 3 years of pension.
    expect(estimatePension(plan({ birthYear: 1981 }), 0, now)).toEqual({
      monthlyCents: 800_000,
      monthsSoFar: 0,
      monthsToPay: 180,
      retireAge: 60,
      careerMonths: 180,
      pensionCents: 4_290_000,
      totalToPayCents: 144_000_000,
      paybackMonths: 34,
      late: false,
    });
    // 55 years old: 60 comes before the 15 years, so the pension starts at 70.
    expect(estimatePension(plan({ birthYear: 1971 }), 0, now)).toMatchObject({ monthsToPay: 180, retireAge: 70, late: true });
    // Months before the app and months recorded in it both count.
    expect(estimatePension(plan({ birthYear: 1996, monthsBefore: 24 }), 12, now)).toMatchObject({
      monthsSoFar: 36,
      monthsToPay: 360,
      careerMonths: 396,
      pensionCents: 9_430_000,
      retireAge: 60,
    });
    // A full career (35 years) can come before 60.
    expect(estimatePension(plan({ birthYear: 2004 }), 0, now)).toMatchObject({ monthsToPay: 420, retireAge: 57, pensionCents: 10_000_000 });
    // Already over 60 with the 15 years: nothing more to pay.
    expect(estimatePension(plan({ birthYear: 1964, monthsBefore: 200 }), 0, now)).toMatchObject({
      monthsToPay: 0,
      retireAge: 62,
      pensionCents: 4_760_000,
      paybackMonths: 0,
    });
    expect(estimatePension(plan(), 0, now)).toBeNull();
  });
});

describe('INSS: months and due dates', () => {
  it('pays a month by day 10 of the next one', () => {
    expect(monthOf(at(2026, 11, 11))).toBe('2026-11');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(dueDateOf('2026-10')).toBe('2026-11-10');
    expect(dueDateOf('2026-12')).toBe('2027-01-10');
  });

  it('says what is pending, what is late and how many months in a row', () => {
    const p = plan({ monthsBefore: 10 });
    const four = paid('2026-06', '2026-07', '2026-08', '2026-09');
    // 5 November: October can still be paid on time.
    expect(inssStatus(p, four, at(2026, 11, 5))).toEqual({
      paidMonths: 4,
      totalMonths: 14,
      streak: 4,
      overdue: [],
      pending: { month: '2026-10', dueDate: '2026-11-10', daysLeft: 5 },
      nextMonth: '2026-10',
      monthsToMinimum: 166,
    });
    expect(inssStatus(p, four, at(2026, 11, 10)).pending).toMatchObject({ daysLeft: 0 });
    // 11 November: October is late and the streak is broken.
    expect(inssStatus(p, four, at(2026, 11, 11))).toMatchObject({
      overdue: ['2026-10'],
      pending: undefined,
      streak: 0,
      nextMonth: '2026-10',
    });
    // A month missed in the past: the streak counts from the month after it.
    const gap = paid('2026-06', '2026-08', '2026-09', '2026-10');
    expect(inssStatus(p, gap, at(2026, 11, 20))).toMatchObject({ overdue: ['2026-07'], streak: 3, nextMonth: '2026-07' });
    // Voided payments do not count; a month paid in advance does.
    const withVoid = [...paid('2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'), { month: '2026-05', voidedAt: 'x' }];
    expect(inssStatus(p, withVoid, at(2026, 11, 20))).toMatchObject({ paidMonths: 6, streak: 6, overdue: [], nextMonth: '2026-12' });
    // Nothing is due before the plan starts.
    expect(inssStatus(plan({ startMonth: '2026-11' }), [], at(2026, 11, 20))).toMatchObject({
      overdue: [],
      pending: undefined,
      nextMonth: '2026-11',
    });
  });
});

describe('INSS: the status in words', () => {
  it('says what is late, what is due and when all is in order', () => {
    const p = plan();
    const four = paid('2026-06', '2026-07', '2026-08', '2026-09');
    expect(statusLine(inssStatus(p, four, at(2026, 11, 5)))).toEqual({
      text: 'Contribuição de Outubro: pagar até 10 de Novembro.',
      tone: 'due',
    });
    expect(statusLine(inssStatus(p, four, at(2026, 11, 10))).text).toBe('Contribuição de Outubro: o prazo é hoje.');
    expect(statusLine(inssStatus(p, four, at(2026, 11, 11)))).toEqual({
      text: 'Contribuição de Outubro em atraso (era até 10 de Novembro).',
      tone: 'late',
    });
    expect(statusLine(inssStatus(p, paid('2026-06'), at(2026, 11, 11))).text).toBe('4 contribuições em atraso, desde Julho de 2026.');
    expect(statusLine(inssStatus(p, [...four, ...paid('2026-10')], at(2026, 11, 11)))).toEqual({
      text: 'Contribuições em dia. A seguir: Novembro, até 10 de Dezembro.',
      tone: 'ok',
    });
  });
});

describe('INSS: money set aside', () => {
  it('is what was put aside minus what payments used, never below zero', () => {
    const expenses = [
      { category: 'inss' as const, amountCents: 500_000 },
      { category: 'inss' as const, amountCents: 300_000 },
      { category: 'inss' as const, amountCents: 100_000, voidedAt: 'x' },
      { category: 'transport' as const, amountCents: 900_000 },
    ];
    expect(savedCents(expenses, [])).toBe(800_000);
    expect(savedCents(expenses, [{ savedUsedCents: 600_000 }, { savedUsedCents: 200_000, voidedAt: 'x' }])).toBe(200_000);
    expect(savedCents([], [{ savedUsedCents: 600_000 }])).toBe(0);
  });
});

describe('INSS: reminder with the app closed', () => {
  it('is about last month, until it is recorded as paid', () => {
    const p = plan();
    expect(inssAlertItem(p, [], at(2026, 11, 8))).toEqual({
      month: '2026-10',
      label: 'Outubro',
      dueDate: '2026-11-10',
      from: '2026-11-08',
      until: '2026-11-15',
    });
    expect(inssAlertItem(p, paid('2026-10'), at(2026, 11, 8))).toBeNull();
    expect(inssAlertItem(p, [{ month: '2026-10', voidedAt: 'x' }], at(2026, 11, 8))).not.toBeNull();
    expect(inssAlertItem(undefined, [], at(2026, 11, 8))).toBeNull();
    expect(inssAlertItem(plan({ startMonth: '2026-11' }), [], at(2026, 11, 8))).toBeNull();
  });
});
