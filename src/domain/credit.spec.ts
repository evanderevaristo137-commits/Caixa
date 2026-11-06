import { describe, expect, it } from 'vitest';
import { creditBook, creditStatus, totalOutstanding, validateCreditPayment } from './credit';
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
    const s = creditStatus('c1', [sale('c1', 500_000, 3)], [{ customerId: 'c1', amountCents: 200_000 }, { customerId: 'c1', amountCents: 300_000 }], now);
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
