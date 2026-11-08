import { describe, expect, it } from 'vitest';
import { buckets, changeBp, compactKz, fillBuckets, formatChange, periodRange, periodSummary, shareBp, topProducts } from './reports';

const now = new Date(2026, 10, 8, 15, 0); // Sunday 8 November 2026
const line = (productId: string, quantity: number, lineTotalCents: number, unitCostCents?: number) => ({
  productId,
  name: productId,
  unitPriceCents: 0,
  quantity,
  lineTotalCents,
  unitCostCents,
});
const sale = (day: number, totalCents: number, method: 'cash' | 'kwik' | 'credit' = 'cash', extra = {}) => ({
  createdAt: new Date(2026, 10, day, 10).toISOString(),
  totalCents,
  method,
  items: [line('arroz', 1, totalCents, Math.round(totalCents * 0.8))],
  ...extra,
});

describe('reports', () => {
  it('builds the current period and the one before it', () => {
    const w = periodRange('7d', now);
    expect(w.from).toEqual(new Date(2026, 10, 2));
    expect(w.to).toEqual(new Date(2026, 10, 9));
    expect(w.prevFrom).toEqual(new Date(2026, 9, 26));
    const y = periodRange('12m', now);
    expect(y.from).toEqual(new Date(2025, 11, 1));
    expect(y.prevFrom).toEqual(new Date(2024, 11, 1));
  });

  it('makes one bucket per day or per month, the last one being now', () => {
    const week = buckets('7d', now);
    expect(week.map((b) => b.label)).toEqual(['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.']);
    expect(week.at(-1)).toMatchObject({ title: 'dom., 08/11', isCurrent: true });
    expect(buckets('30d', now)).toHaveLength(30);
    const months = buckets('12m', now);
    expect(months.map((b) => b.label).join(' ')).toBe('dez. jan. fev. mar. abr. mai. jun. jul. ago. set. out. nov.');
    expect(months.at(-1)!.title).toBe('nov. 2026');
  });

  it('fills the buckets with valid sales and their profit', () => {
    const filled = fillBuckets(buckets('7d', now), [
      sale(8, 100_000),
      sale(8, 50_000, 'kwik'),
      sale(7, 30_000, 'cash', { voidedAt: 'x' }),
      sale(1, 999_000), // before the period
    ]);
    expect(filled.at(-1)).toMatchObject({ salesCents: 150_000, count: 2, profitCents: 30_000 });
    expect(filled.at(-2)).toMatchObject({ salesCents: 0, count: 0, profitCents: undefined });
  });

  it('summarises a period: methods, electronic share, profit, money out and credit', () => {
    const s = periodSummary(
      [sale(3, 100_000), sale(4, 60_000, 'kwik'), sale(5, 40_000, 'credit'), sale(5, 10_000, 'cash', { voidedAt: 'x' })],
      [{ createdAt: new Date(2026, 10, 6).toISOString(), amountCents: 20_000 }],
      [{ createdAt: new Date(2026, 10, 6).toISOString(), category: 'transport', amountCents: 15_000, fromCash: true }],
      new Date(2026, 10, 2),
      new Date(2026, 10, 9),
    );
    expect(s).toMatchObject({
      salesCents: 200_000,
      count: 3,
      avgTicketCents: 66_700,
      electronicCents: 60_000,
      creditSoldCents: 40_000,
      creditPaidCents: 20_000,
      daysWithSales: 3,
    });
    expect(s.profit.profitCents).toBe(40_000);
    expect(s.outflows.expensesCents).toBe(15_000);
    expect(shareBp(s.electronicCents, s.salesCents)).toBe(3000);
  });

  it('compares with the previous period and names the best sellers', () => {
    expect(changeBp(112_000, 100_000)).toBe(1200);
    expect(formatChange(1200)).toBe('+12%');
    expect(formatChange(-800)).toBe('−8%');
    expect(changeBp(5, 0)).toBeUndefined();
    const top = topProducts([
      { createdAt: '', totalCents: 0, method: 'cash', items: [line('a', 2, 1_000), line('b', 1, 5_000)] },
      { createdAt: '', totalCents: 0, method: 'cash', items: [line('a', 3, 1_500)] },
    ]);
    expect(top.map((p) => [p.name, p.quantity, p.revenueCents])).toEqual([
      ['b', 1, 5_000],
      ['a', 5, 2_500],
    ]);
  });

  it('writes short amounts for the chart', () => {
    expect(compactKz(80_000)).toBe('800');
    expect(compactKz(15_000_000)).toBe('150 mil');
    expect(compactKz(150_000_000)).toBe('1,5 M');
    expect(compactKz(200_000_000)).toBe('2 M');
  });
});
