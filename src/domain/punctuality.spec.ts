import { describe, expect, it } from 'vitest';
import { punctuality } from './punctuality';
import { agingBucket, debtorsReport } from './debtors';

const at = (day: number) => new Date(2026, 10, day, 10).toISOString();
const debt = (day: number, dueDay: number, amountCents: number) => ({
  createdAt: at(day),
  dueDate: `2026-11-${String(dueDay).padStart(2, '0')}`,
  amountCents,
});
const pay = (day: number, amountCents: number) => ({ createdAt: at(day), amountCents });

describe('punctuality', () => {
  it('pays the oldest debts first, each on the day the payments reach it', () => {
    const p = punctuality(
      [debt(1, 8, 1_000), debt(2, 9, 1_000), debt(3, 10, 1_000), debt(4, 11, 1_000)],
      [pay(5, 1_000), pay(12, 1_500), pay(14, 500)], // the 2nd is paid on the 12th (3 days late), the 3rd on the 14th (4 late)
      '2026-11-20',
    );
    // The 4th: still open and 9 days late.
    expect(p).toEqual({ onTime: 1, late: 2, openLate: 1, avgDaysLate: Math.round((3 + 4 + 9) / 3), onTimeBp: 2_500, verdict: 'poor' });
  });

  it('gives a verdict only with enough history', () => {
    expect(punctuality([debt(1, 8, 1_000)], [pay(2, 1_000)], '2026-11-20')).toEqual({ onTime: 1, late: 0, openLate: 0 });
    const good = punctuality([debt(1, 8, 100), debt(2, 9, 100), debt(3, 10, 100)], [pay(4, 300)], '2026-11-20');
    expect(good).toMatchObject({ onTime: 3, onTimeBp: 10_000, verdict: 'good' });
    // Not yet due: neither on time nor late.
    expect(punctuality([debt(15, 30, 100)], [], '2026-11-20')).toEqual({ onTime: 0, late: 0, openLate: 0 });
  });
});

describe('debtors', () => {
  it('splits what each customer owes by how late it is, most overdue first', () => {
    const now = new Date(2026, 10, 20, 15);
    const customers = [
      { id: 'a', name: 'Cliente A', createdAt: at(1), updatedAt: at(1) },
      { id: 'b', name: 'Cliente B', createdAt: at(1), updatedAt: at(1) },
      { id: 'c', name: 'Cliente C', createdAt: at(1), updatedAt: at(1) },
    ];
    const sale = (customerId: string, day: number, dueDay: number, totalCents: number) => ({
      id: `${customerId}${day}`,
      customerId,
      method: 'credit' as const,
      totalCents,
      createdAt: at(day),
      dueDate: `2026-11-${String(dueDay).padStart(2, '0')}`,
    });
    const report = debtorsReport(
      customers,
      [sale('a', 1, 18, 5_000), sale('a', 15, 25, 2_000), sale('b', 1, 5, 9_000), sale('c', 2, 3, 1_000)],
      [{ customerId: 'c', amountCents: 1_000, createdAt: at(3) }],
      now,
    );
    expect(report.rows.map((r) => [r.customer.id, r.balanceCents, r.overdueCents, r.daysOverdue ?? null])).toEqual([
      ['b', 9_000, 9_000, 15],
      ['a', 7_000, 5_000, 2],
    ]);
    expect(report.rows[1]!.buckets).toEqual({ current: 2_000, d1_7: 5_000, d8_30: 0, d31: 0 });
    expect(report.totals).toEqual({ current: 2_000, d1_7: 5_000, d8_30: 9_000, d31: 0, balanceCents: 16_000, overdueCents: 14_000 });
    expect([0, 1, 7, 8, 30, 31].map(agingBucket)).toEqual(['current', 'd1_7', 'd1_7', 'd8_30', 'd8_30', 'd31']);
  });
});
