import { describe, expect, it } from 'vitest';
import { closeResult, drawer, summariseOutflows } from './cash';

describe('money out of the shop', () => {
  it('separates expenses from the owner withdrawals and counts what left the till', () => {
    const o = summariseOutflows([
      { category: 'transport', amountCents: 150_000, fromCash: true },
      { category: 'rent', amountCents: 3_000_000, fromCash: false },
      { category: 'withdrawal', amountCents: 2_000_000, fromCash: true },
      { category: 'energy', amountCents: 400_000, fromCash: true, voidedAt: '2026-11-08T10:00:00Z' },
    ]);
    expect(o.expensesCents).toBe(3_150_000);
    expect(o.withdrawalsCents).toBe(2_000_000);
    expect(o.cashOutCents).toBe(2_150_000);
    expect(o.byCategory).toEqual({ transport: 150_000, rent: 3_000_000, withdrawal: 2_000_000 });
    expect(o.count).toBe(3);
  });
});

describe('cash in the till', () => {
  it('expects float + cash sales + cash payments − money out', () => {
    const d = drawer({ floatCents: 500_000, cashSalesCents: 4_250_000, cashCreditPaymentsCents: 300_000, cashOutCents: 2_150_000 });
    expect(d.expectedCents).toBe(2_900_000);
    // Goods bought (or suppliers paid) with money from the till also leave the drawer.
    expect(
      drawer({ floatCents: 0, cashSalesCents: 1_000_000, cashCreditPaymentsCents: 0, cashOutCents: 0, cashPurchasesCents: 400_000 })
        .expectedCents,
    ).toBe(600_000);
  });

  it('says whether the count is right, over or short', () => {
    expect(closeResult(2_900_000, 2_900_000)).toEqual({ differenceCents: 0, state: 'exact' });
    expect(closeResult(2_900_000, 2_910_000)).toEqual({ differenceCents: 10_000, state: 'over' });
    expect(closeResult(2_900_000, 2_880_000)).toEqual({ differenceCents: -20_000, state: 'short' });
  });
});
