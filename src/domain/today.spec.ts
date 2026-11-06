import { describe, expect, it } from 'vitest';
import { isLowStock, lowStockProducts, summariseDayView } from './today';
import type { CreditPayment, Product, Sale } from './types';

const now = new Date(2026, 10, 6, 18, 0);
const at = (day: number, hour: number, min = 30) => new Date(2026, 10, day, hour, min).toISOString();
const sale = (createdAt: string, totalCents: number, method: Sale['method'], voidedAt?: string): Sale => ({
  id: createdAt + totalCents,
  number: 1,
  items: [],
  totalCents,
  currency: 'AOA',
  method,
  voidedAt,
  createdAt,
  updatedAt: createdAt,
});
const payment = (createdAt: string, amountCents: number, method: CreditPayment['method']) => ({ createdAt, amountCents, method });
const product = (id: string, stock: number, minStock: number, archivedAt?: string): Product => ({
  id,
  name: id,
  priceCents: 100,
  stock,
  minStock,
  archivedAt,
  createdAt: '',
  updatedAt: '',
});

const sales = [
  sale(at(6, 0), 100_000, 'cash'), // just after midnight: today
  sale(at(6, 9), 250_000, 'multicaixa_express'),
  sale(at(6, 17), 50_000, 'credit'),
  sale(at(6, 12), 999_000, 'cash', at(6, 12, 40)), // voided today
  sale(at(5, 23), 300_000, 'cash'), // yesterday, after 18:00
  sale(at(5, 8), 20_000, 'kwik'), // yesterday, before 18:00
  sale(at(4, 12), 70_000, 'cash'), // two days ago
];

describe('summariseDayView — today', () => {
  const v = summariseDayView(sales, [], now, now);

  it('totals valid sales and counts voided ones apart', () => {
    expect(v.day.totalCents).toBe(400_000);
    expect(v.day.count).toBe(3);
    expect(v.day.voidedCount).toBe(1);
    expect(v.day.voidedCents).toBe(999_000);
  });

  it('compares with yesterday up to the same time, keeping the full day for reference', () => {
    expect(v.comparisonIsSameTime).toBe(true);
    expect(v.comparison.totalCents).toBe(20_000);
    expect(v.previousFull.totalCents).toBe(320_000);
    expect(v.diffCents).toBe(380_000);
  });

  it('splits by payment method and the split adds up to the total', () => {
    expect(v.day.byMethod.cash).toBe(100_000);
    expect(v.day.byMethod.multicaixa_express).toBe(250_000);
    expect(v.day.byMethod.credit).toBe(50_000);
    expect(Object.values(v.day.byMethod).reduce((a, b) => a + b, 0)).toBe(v.day.totalCents);
  });

  it('counts a sale made exactly at the same minute yesterday', () => {
    const exact = sale(new Date(2026, 10, 5, 18, 0).toISOString(), 7_000, 'cash');
    expect(summariseDayView([exact], [], now, now).comparison.totalCents).toBe(7_000);
  });
});

describe('summariseDayView — cash in the drawer', () => {
  it('adds cash sales and fiado paid in cash, ignoring other methods and days', () => {
    const payments = [payment(at(6, 10), 30_000, 'cash'), payment(at(6, 11), 45_000, 'unitel_money'), payment(at(5, 10), 80_000, 'cash')];
    const v = summariseDayView(sales, payments, now, now);
    expect(v.cash).toEqual({ salesCents: 100_000, creditPaymentsCents: 30_000, totalCents: 130_000 });
    expect(v.creditPaidCents).toBe(75_000);
  });
});

describe('summariseDayView — a past day', () => {
  it('compares with the whole previous day', () => {
    const v = summariseDayView(sales, [], new Date(2026, 10, 5, 12), now);
    expect(v.comparisonIsSameTime).toBe(false);
    expect(v.day.totalCents).toBe(320_000);
    expect(v.comparison.totalCents).toBe(70_000);
    expect(v.diffCents).toBe(250_000);
  });
});

describe('low stock', () => {
  it('lists products at or below minimum, most urgent first, ignoring archived ones', () => {
    const list = lowStockProducts([product('ok', 10, 3), product('low', 3, 3), product('out', 0, 5), product('old', 0, 5, at(1, 1))]);
    expect(list.map((p) => p.id)).toEqual(['out', 'low']);
    expect(isLowStock(product('x', 4, 3))).toBe(false);
  });
});
