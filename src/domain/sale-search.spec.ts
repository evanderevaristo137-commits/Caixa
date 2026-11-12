import { describe, expect, it } from 'vitest';
import { matchesSale, periodRange, searchSales, searchTotals, type SaleFilter } from './sale-search';
import type { PaymentMethod } from './types';

const now = new Date(2026, 10, 12, 15, 0); // Thursday 12 November 2026, 15:00
const sale = (
  number: number,
  daysAgo: number,
  method: PaymentMethod,
  names: string[],
  extra: { customerId?: string; voidedAt?: string } = {},
) => ({
  number,
  createdAt: new Date(2026, 10, 12 - daysAgo, 10 + (number % 5)).toISOString(),
  totalCents: 100_000 * number,
  method,
  items: names.map((name) => ({ productId: name, name, unitPriceCents: 100, quantity: 1, lineTotalCents: 100 })),
  ...extra,
});
const sales = [
  sale(1, 3, 'cash', ['Arroz 1 kg', 'Óleo vegetal 1 L']),
  sale(2, 1, 'credit', ['Feijão manteiga'], { customerId: 'c1' }),
  sale(3, 0, 'tpa', ['Açúcar 1 kg']),
  sale(4, 0, 'cash', ['Arroz 5 kg'], { voidedAt: 'x' }),
  sale(12, 0, 'kwik', ['Gasosa 12 un.']),
];
const all: SaleFilter = { period: '30d', state: 'all' };
const names = (id: string) => (id === 'c1' ? 'Joana Mateus' : undefined);

describe('finding sales', () => {
  it('covers whole days of the phone calendar', () => {
    expect(periodRange('today', now)).toEqual({ from: new Date(2026, 10, 12), to: new Date(2026, 10, 13) });
    expect(periodRange('yesterday', now)).toEqual({ from: new Date(2026, 10, 11), to: new Date(2026, 10, 12) });
    expect(periodRange('7d', now).from).toEqual(new Date(2026, 10, 6));
    expect(periodRange('30d', now).from).toEqual(new Date(2026, 9, 14));
  });

  it('filters by payment method, customer and state, newest first', () => {
    expect(searchSales(sales, { ...all, method: 'cash' }).map((s) => s.number)).toEqual([4, 1]);
    expect(searchSales(sales, { ...all, customerId: 'c1' }).map((s) => s.number)).toEqual([2]);
    expect(searchSales(sales, { ...all, state: 'voided' }).map((s) => s.number)).toEqual([4]);
    expect(searchSales(sales, { ...all, state: 'valid' }).map((s) => s.number)).not.toContain(4);
  });

  it('finds a product without accents or capitals, a customer by name, or the sale number', () => {
    expect(searchSales(sales, { ...all, text: 'feijao' }).map((s) => s.number)).toEqual([2]);
    expect(searchSales(sales, { ...all, text: 'ARROZ' }).map((s) => s.number)).toEqual([4, 1]);
    expect(searchSales(sales, { ...all, text: 'joana' }, names).map((s) => s.number)).toEqual([2]);
    expect(matchesSale(sales[2]!, { ...all, text: 'n.º 3' })).toBe(true);
    expect(matchesSale(sales[2]!, { ...all, text: '#3' })).toBe(true);
    // "12": sale number 12, and also a product with 12 in its name.
    expect(searchSales(sales, { ...all, text: '12' }).map((s) => s.number)).toEqual([12]);
    expect(searchSales(sales, { ...all, text: 'nada disto' })).toEqual([]);
  });

  it('totals only the valid sales, and says how many were voided', () => {
    expect(searchTotals(sales)).toEqual({ count: 4, totalCents: 1_800_000, voided: 1 });
  });
});
