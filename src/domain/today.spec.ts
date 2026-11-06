import { describe, expect, it } from 'vitest';
import { isLowStock, summariseToday } from './today';
import type { Product, Sale } from './types';

const now = new Date(2026, 10, 6, 18, 0);
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 30).toISOString();
const sale = (createdAt: string, totalCents: number, method: Sale['method']): Sale => ({
  id: createdAt + totalCents,
  number: 1,
  items: [],
  totalCents,
  currency: 'AOA',
  method,
  createdAt,
  updatedAt: createdAt,
});
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

describe('summariseToday', () => {
  const sales = [
    sale(at(6, 0), 100_000, 'cash'), // just after midnight: today
    sale(at(6, 9), 250_000, 'multicaixa_express'),
    sale(at(6, 17), 50_000, 'credit'),
    sale(at(5, 23), 300_000, 'cash'), // yesterday
    sale(at(5, 8), 20_000, 'kwik'),
    sale(at(4, 12), 999_999, 'cash'), // two days ago: ignored
  ];

  it('totals today and counts sales (fiado included)', () => {
    const s = summariseToday(sales, [], now);
    expect(s.today.totalCents).toBe(400_000);
    expect(s.today.count).toBe(3);
  });

  it('compares with yesterday up to the same time, and keeps the full day for reference', () => {
    const s = summariseToday(sales, [], now);
    // Now is 18:00: yesterday's 23:30 sale is not part of the fair comparison.
    expect(s.yesterdaySoFar.totalCents).toBe(20_000);
    expect(s.yesterdaySoFar.count).toBe(1);
    expect(s.yesterday.totalCents).toBe(320_000);
    expect(s.yesterday.count).toBe(2);
    expect(s.diffCents).toBe(400_000 - 20_000);
  });

  it('counts a sale made exactly at the same minute yesterday', () => {
    const exact = sale(new Date(2026, 10, 5, 18, 0).toISOString(), 7_000, 'cash');
    expect(summariseToday([exact], [], now).yesterdaySoFar.totalCents).toBe(7_000);
  });

  it('splits by payment method and the split adds up to the total', () => {
    const s = summariseToday(sales, [], now);
    expect(s.today.byMethod.cash).toBe(100_000);
    expect(s.today.byMethod.multicaixa_express).toBe(250_000);
    expect(s.today.byMethod.credit).toBe(50_000);
    expect(s.today.byMethod.unitel_money).toBe(0);
    const sum = Object.values(s.today.byMethod).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.today.totalCents);
  });

  it('lists low-stock products, most urgent first, ignoring archived ones', () => {
    const s = summariseToday([], [product('ok', 10, 3), product('low', 3, 3), product('out', 0, 5), product('old', 0, 5, at(1, 1))], now);
    expect(s.lowStock.map((p) => p.id)).toEqual(['out', 'low']);
    expect(isLowStock(product('x', 4, 3))).toBe(false);
  });
});
