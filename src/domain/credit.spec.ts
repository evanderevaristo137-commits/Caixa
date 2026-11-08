import { describe, expect, it } from 'vitest';
import { creditAlerts, creditBook, creditStatus, dueDateFromTerm, openItems, totalOutstanding, validateCreditPayment } from './credit';
import type { Customer } from './types';

const now = new Date(2026, 10, 6, 15, 0); // 6 Nov 2026, local time
const daysAgo = (n: number) => new Date(2026, 10, 6 - n, 10, 0).toISOString();

const sale = (customerId: string, totalCents: number, n: number, method: 'credit' | 'cash' = 'credit') => ({
  customerId,
  method,
  totalCents,
  createdAt: daysAgo(n),
});

describe('creditStatus', () => {
  it('sums fiado purchases minus payments', () => {
    const s = creditStatus('c1', [sale('c1', 500_000, 10), sale('c1', 300_000, 2)], [{ customerId: 'c1', amountCents: 200_000 }], now);
    expect(s.totalCreditCents).toBe(800_000);
    expect(s.totalPaidCents).toBe(200_000);
    expect(s.balanceCents).toBe(600_000);
  });

  it('ignores non-fiado sales and other customers', () => {
    const s = creditStatus('c1', [sale('c1', 500_000, 1, 'cash'), sale('c2', 100_000, 1)], [{ customerId: 'c2', amountCents: 50 }], now);
    expect(s.balanceCents).toBe(0);
    expect(s.daysOutstanding).toBeUndefined();
  });

  it('counts days from the oldest purchase still open (payments settle oldest first)', () => {
    const sales = [sale('c1', 500_000, 10), sale('c1', 300_000, 4)];
    expect(creditStatus('c1', sales, [], now).daysOutstanding).toBe(10);
    // Partial payment does not fully cover the oldest purchase: still 10 days.
    expect(creditStatus('c1', sales, [{ customerId: 'c1', amountCents: 499_900 }], now).daysOutstanding).toBe(10);
    // Oldest fully paid: now counts from the purchase 4 days ago.
    expect(creditStatus('c1', sales, [{ customerId: 'c1', amountCents: 500_000 }], now).daysOutstanding).toBe(4);
  });

  it('is settled after full payment', () => {
    const s = creditStatus(
      'c1',
      [sale('c1', 500_000, 3)],
      [
        { customerId: 'c1', amountCents: 200_000 },
        { customerId: 'c1', amountCents: 300_000 },
      ],
      now,
    );
    expect(s.balanceCents).toBe(0);
    expect(s.daysOutstanding).toBeUndefined();
  });
});

describe('creditBook', () => {
  it('lists debtors first, oldest debt first, and totals what is owed', () => {
    const c = (id: string): Customer => ({ id, name: id, createdAt: '', updatedAt: '' });
    const book = creditBook(
      [c('paid'), c('recent'), c('old')],
      [sale('paid', 100, 20), sale('recent', 1_000, 1), sale('old', 500, 9)],
      [{ customerId: 'paid', amountCents: 100 }],
      now,
    );
    expect(book.map((b) => b.customer.id)).toEqual(['old', 'recent', 'paid']);
    expect(totalOutstanding(book)).toBe(1_500);
  });
});

describe('validateCreditPayment', () => {
  it('accepts partial and full payments, rejects zero and overpayment', () => {
    expect(validateCreditPayment(100, 500)).toBe('ok');
    expect(validateCreditPayment(500, 500)).toBe('ok');
    expect(validateCreditPayment(0, 500)).toBe('zero');
    expect(validateCreditPayment(501, 500)).toBe('too_much');
  });
});

describe('voided fiado sales', () => {
  it('do not count towards the balance', () => {
    const sales = [sale('c1', 500_000, 5), { ...sale('c1', 300_000, 2), voidedAt: daysAgo(1) }];
    const s = creditStatus('c1', sales, [], now);
    expect(s.balanceCents).toBe(500_000);
    expect(s.totalCreditCents).toBe(500_000);
  });
  it('can leave the customer with money in their favour', () => {
    const sales = [{ ...sale('c1', 300_000, 2), voidedAt: daysAgo(1) }];
    const s = creditStatus('c1', sales, [{ customerId: 'c1', amountCents: 100_000 }], now);
    expect(s.balanceCents).toBe(-100_000);
    expect(s.daysOutstanding).toBeUndefined();
    expect(validateCreditPayment(1, s.balanceCents)).toBe('too_much');
  });
});

describe('due dates', () => {
  // now = 6 Nov 2026 15:00 local
  const due = (customerId: string, totalCents: number, n: number, dueDate: string) => ({ ...sale(customerId, totalCents, n), dueDate });

  it('settles the oldest purchases first and keeps what is still open', () => {
    const items = openItems(
      'c1',
      [due('c1', 500_000, 10, '2026-11-01'), due('c1', 300_000, 4, '2026-11-17')],
      [{ customerId: 'c1', amountCents: 600_000 }],
    );
    expect(items.map((i) => [i.dueDate, i.remainingCents])).toEqual([['2026-11-17', 200_000]]);
  });

  it('knows when a payment is overdue, due today, soon or later', () => {
    const at = (dueDate: string) => creditStatus('c1', [due('c1', 100_000, 10, dueDate)], [], now);
    expect(at('2026-11-02')).toMatchObject({ dueState: 'overdue', daysOverdue: 4, nextDueDate: '2026-11-02' });
    expect(at('2026-11-06')).toMatchObject({ dueState: 'today', daysUntilDue: 0 });
    expect(at('2026-11-08')).toMatchObject({ dueState: 'soon', daysUntilDue: 2 });
    expect(at('2026-11-20')).toMatchObject({ dueState: 'later', daysUntilDue: 14 });
  });

  it('separates what is due now from the total owed', () => {
    const s = creditStatus(
      'c1',
      [due('c1', 100_000, 10, '2026-11-03'), due('c1', 250_000, 1, '2026-11-20')],
      [{ customerId: 'c1', amountCents: 40_000 }],
      now,
    );
    expect(s.balanceCents).toBe(310_000);
    expect(s.dueNowCents).toBe(60_000);
    expect(s.reminderAmountCents).toBe(60_000);
    expect(s.dueState).toBe('overdue');
  });

  it('a reminder before the due date mentions what falls due on that day', () => {
    const s = creditStatus('c1', [due('c1', 100_000, 3, '2026-11-08'), due('c1', 50_000, 1, '2026-11-30')], [], now);
    expect(s.dueNowCents).toBe(0);
    expect(s.reminderAmountCents).toBe(100_000);
  });

  it('sales made before due dates existed get the default term', () => {
    const s = creditStatus('c1', [sale('c1', 100_000, 20)], [], now);
    expect(s.nextDueDate).toBe('2026-11-01');
    expect(s.dueState).toBe('overdue');
  });

  it('orders customers by urgency and counts who needs attention now', () => {
    const c = (id: string): Customer => ({ id, name: id, createdAt: '', updatedAt: '' });
    const book = creditBook(
      [c('later'), c('paid'), c('soon'), c('today'), c('late2'), c('late9')],
      [
        due('later', 1, 1, '2026-11-25'),
        due('paid', 1, 1, '2026-11-01'),
        due('soon', 1, 1, '2026-11-07'),
        due('today', 1, 1, '2026-11-06'),
        due('late2', 1, 5, '2026-11-04'),
        due('late9', 1, 12, '2026-10-28'),
      ],
      [{ customerId: 'paid', amountCents: 1 }],
      now,
    );
    expect(book.map((b) => b.customer.id)).toEqual(['late9', 'late2', 'today', 'soon', 'later', 'paid']);
    const alerts = creditAlerts(book);
    expect([alerts.overdue.length, alerts.today.length, alerts.soon.length, alerts.urgentCount]).toEqual([2, 1, 1, 3]);
  });

  it('turns the chosen term into a due date', () => {
    expect(dueDateFromTerm(15, now)).toBe('2026-11-21');
    expect(dueDateFromTerm(30, now)).toBe('2026-12-06');
    expect(dueDateFromTerm('month_end', now)).toBe('2026-11-30');
    // On the 29th, "end of the month" would be tomorrow: use the next month's end.
    expect(dueDateFromTerm('month_end', new Date(2026, 10, 29, 10))).toBe('2026-12-31');
  });
});
