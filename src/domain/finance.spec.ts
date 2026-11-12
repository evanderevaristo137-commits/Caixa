import { describe, expect, it } from 'vitest';
import { financeRange, financeSummary, soldAndReceived, type FinanceInput } from './finance';
import type { PaymentMethod } from './types';

const now = new Date(2026, 10, 12, 15, 0); // Thursday 12 November 2026, 15:00
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const item = (lineTotalCents: number, unitCostCents?: number) => ({
  productId: 'p',
  name: 'Arroz 1 kg',
  unitPriceCents: lineTotalCents,
  quantity: 1,
  lineTotalCents,
  ...(unitCostCents !== undefined ? { unitCostCents } : {}),
});
const sale = (day: number, totalCents: number, method: PaymentMethod, extra: Record<string, unknown> = {}) => ({
  createdAt: at(day),
  totalCents,
  method,
  items: [item(totalCents, Math.round(totalCents * 0.8))],
  ...extra,
});

describe('sold and received', () => {
  it('a credit sale is sold, not received; a debt paid is received, not sold; a payment to confirm is not received yet', () => {
    const r = soldAndReceived(
      [
        sale(12, 100_000, 'cash'),
        sale(12, 50_000, 'multicaixa_express'),
        sale(12, 30_000, 'kwik', { pendingSince: at(12) }),
        sale(12, 20_000, 'tpa', { pendingSince: at(12), confirmedAt: at(12, 11) }),
        sale(12, 200_000, 'credit'),
        sale(12, 999_000, 'cash', { voidedAt: at(12, 12) }),
      ],
      [
        { createdAt: at(12), amountCents: 40_000, method: 'cash' },
        { createdAt: at(12), amountCents: 5_000, method: 'return' }, // goods back off a debt: not money
      ],
    );
    expect(r).toEqual({
      soldCents: 400_000,
      count: 5,
      onCreditCents: 200_000,
      pendingCents: 30_000,
      salesPaidCents: 170_000,
      customersCents: 40_000,
      receivedCents: 210_000,
    });
  });
});

describe('money of a period', () => {
  const input: FinanceInput = {
    sales: [
      sale(11, 100_000, 'cash'),
      sale(12, 60_000, 'unitel_money'),
      sale(12, 40_000, 'credit'),
      sale(12, 30_000, 'transfer', { pendingSince: at(12) }),
      sale(13, 500_000, 'cash'), // tomorrow: outside the period
      { createdAt: at(12), totalCents: 10_000, method: 'cash', items: [item(10_000)] }, // no cost price
    ],
    payments: [
      { createdAt: at(12), amountCents: 25_000, method: 'cash' },
      { createdAt: at(12), amountCents: 15_000, method: 'kwik' },
    ],
    expenses: [
      { createdAt: at(12), category: 'rent', amountCents: 50_000, fromCash: false },
      { createdAt: at(12), category: 'withdrawal', amountCents: 20_000, fromCash: true },
      { createdAt: at(12), category: 'inss', amountCents: 8_000, fromCash: true },
      { createdAt: at(12), category: 'energy', amountCents: 99_000, fromCash: true, voidedAt: at(12, 11) },
    ],
    purchases: [
      { createdAt: at(12), totalCents: 70_000, payment: 'cash' },
      { createdAt: at(12), totalCents: 90_000, payment: 'credit' }, // not paid yet: no money out
      { createdAt: at(12), totalCents: 11_000, payment: 'other', voidedAt: at(12, 11) },
    ],
    supplierPayments: [{ createdAt: at(12), amountCents: 30_000 }],
    returns: [
      {
        createdAt: at(12),
        totalCents: 12_000,
        refund: 'cash',
        restock: true,
        items: [{ productId: 'p', name: 'Arroz 1 kg', quantity: 1, refundCents: 12_000, costCents: 9_600 }],
      },
      {
        createdAt: at(12),
        totalCents: 4_000,
        refund: 'debt',
        restock: false,
        items: [{ productId: 'p', name: 'Arroz 1 kg', quantity: 1, refundCents: 4_000, costCents: 3_200 }],
      },
    ],
  };
  const f = financeSummary(input, new Date(2026, 10, 11), new Date(2026, 10, 13));

  it('puts sold and received side by side', () => {
    expect(f.sold).toMatchObject({ soldCents: 240_000, onCreditCents: 40_000, pendingCents: 30_000, customersCents: 40_000 });
    expect(f.sold.receivedCents).toBe(100_000 + 60_000 + 10_000 + 40_000);
  });

  it('adds up what came in and what went out (credit purchases only when paid)', () => {
    expect(f.flow).toEqual({
      inCashCents: 100_000 + 10_000 + 25_000,
      inOtherCents: 60_000 + 15_000,
      inCents: 210_000,
      expensesCents: 50_000,
      goodsCents: 70_000 + 30_000,
      refundsCents: 12_000, // taken off a debt is not money out
      withdrawalsCents: 20_000,
      inssCents: 8_000,
      outCents: 50_000 + 100_000 + 12_000 + 20_000 + 8_000,
      balanceCents: 210_000 - 190_000,
    });
  });

  it('estimates the result from the cost prices, and says what was left out', () => {
    // Lines with a cost: 100.000 + 60.000 + 40.000 + 30.000 = 230.000, cost 80%; returns take back 16.000
    // of revenue, and the restocked rice its cost (9.600).
    expect(f.result.profit).toEqual({
      revenueCents: 230_000 - 16_000,
      costCents: 184_000 - 9_600,
      profitCents: 214_000 - 174_400,
      unknownRevenueCents: 10_000,
      unknownLines: 1,
    });
    expect(f.result).toMatchObject({ soldCents: 240_000, returnsCents: 16_000, expensesCents: 50_000 });
    expect(f.result.resultCents).toBe(39_600 - 50_000);
  });

  it('has no result to estimate when no product has a cost price', () => {
    const none = financeSummary({ ...input, sales: [input.sales[5]!], returns: [] }, new Date(2026, 10, 11), new Date(2026, 10, 13));
    expect(none.result.resultCents).toBeUndefined();
    expect(none.result.profit.unknownRevenueCents).toBe(10_000);
  });
});

describe('periods', () => {
  it('cover whole days of the phone calendar', () => {
    expect(financeRange('today', now)).toEqual({ from: new Date(2026, 10, 12), to: new Date(2026, 10, 13) });
    expect(financeRange('yesterday', now)).toEqual({ from: new Date(2026, 10, 11), to: new Date(2026, 10, 12) });
    expect(financeRange('7d', now)).toEqual({ from: new Date(2026, 10, 6), to: new Date(2026, 10, 13) });
    expect(financeRange('month', now)).toEqual({ from: new Date(2026, 10, 1), to: new Date(2026, 10, 13) });
    expect(financeRange('lastMonth', now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) });
    expect(financeRange('lastMonth', new Date(2027, 0, 5))).toEqual({ from: new Date(2026, 11, 1), to: new Date(2027, 0, 1) });
  });

  it('chosen dates: both days included, never the wrong way round, in the future or longer than a year', () => {
    expect(financeRange('custom', now, { first: '2026-11-01', last: '2026-11-05' })).toEqual({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 6),
    });
    expect(financeRange('custom', now, { first: '2026-11-05', last: '2026-11-01' })).toBeNull();
    expect(financeRange('custom', now, { first: '2026-11-05', last: '2026-11-13' })).toBeNull();
    expect(financeRange('custom', now, { first: '2025-01-01', last: '2026-11-12' })).toBeNull();
    expect(financeRange('custom', now, { first: '2025-11-12', last: '2026-11-12' })).not.toBeNull();
    expect(financeRange('custom', now, { first: '', last: '2026-11-12' })).toBeNull();
    expect(financeRange('custom', now, { first: '2026-02-30', last: '2026-03-02' })).toBeNull();
  });
});
