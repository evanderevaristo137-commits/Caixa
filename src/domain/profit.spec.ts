import { describe, expect, it } from 'vitest';
import { formatMargin, lineCostCents, marginBp, profitByProduct, summariseProfit, unitMargin } from './profit';

const line = (productId: string, quantity: number, lineTotalCents: number, unitCostCents?: number, soldBy?: 'weight') => ({
  productId,
  name: productId,
  quantity,
  lineTotalCents,
  unitCostCents,
  soldBy,
});

describe('profit', () => {
  it('costs a line by the unit or by the kilo', () => {
    expect(lineCostCents({ quantity: 3, unitCostCents: 35_000 })).toBe(105_000);
    // 750 g at 900 Kz/kg cost 675 Kz.
    expect(lineCostCents({ quantity: 750, unitCostCents: 90_000, soldBy: 'weight' })).toBe(67_500);
    // Rounded to the cêntimo: 333 g at 1.000 Kz/kg = 333,00 Kz.
    expect(lineCostCents({ quantity: 333, unitCostCents: 100_000, soldBy: 'weight' })).toBe(33_300);
    expect(lineCostCents({ quantity: 2 })).toBeUndefined();
  });

  it('sums the profit of valid sales and keeps lines without cost apart', () => {
    const sales = [
      { items: [line('bolacha', 2, 100_000, 35_000), line('pao', 4, 60_000)] },
      { items: [line('feijao', 500, 70_000, 110_000, 'weight')] },
      { voidedAt: '2026-11-08T10:00:00Z', items: [line('bolacha', 10, 500_000, 35_000)] },
    ];
    const p = summariseProfit(sales);
    expect(p.revenueCents).toBe(170_000);
    expect(p.costCents).toBe(70_000 + 55_000);
    expect(p.profitCents).toBe(45_000);
    expect(p.unknownRevenueCents).toBe(60_000);
    expect(p.unknownLines).toBe(1);
    expect(marginBp(p)).toBe(2647);
    expect(formatMargin(marginBp(p)!)).toBe('26%');
    expect(marginBp(summariseProfit([]))).toBeUndefined();
  });

  it('ranks products by profit', () => {
    const rows = profitByProduct([
      { items: [line('a', 1, 10_000, 9_000), line('b', 1, 10_000, 5_000)] },
      { items: [line('a', 2, 20_000, 9_000), line('c', 1, 5_000)] },
    ]);
    expect(rows.map((r) => [r.productId, r.quantity, r.profitCents])).toEqual([
      ['b', 1, 5_000],
      ['a', 3, 3_000],
    ]);
  });

  it('shows the margin of one unit, also below cost', () => {
    expect(unitMargin(50_000, 35_000)).toEqual({ profitCents: 15_000, marginBp: 3000 });
    expect(unitMargin(30_000, 33_000)).toEqual({ profitCents: -3_000, marginBp: -1000 });
    expect(formatMargin(-1000)).toBe('-10%');
    expect(unitMargin(0, 100).marginBp).toBeUndefined();
  });
});
