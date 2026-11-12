import { describe, expect, it } from 'vitest';
import { summariseProfit } from './profit';
import { refundFor, returnable, returnItems, summariseReturns } from './returns';
import type { SaleItem } from './types';

const rice: SaleItem = {
  productId: 'rice',
  name: 'Arroz 1 kg',
  unitPriceCents: 120_000,
  quantity: 3,
  lineTotalCents: 360_000,
  unitCostCents: 100_000,
};
const beans: SaleItem = {
  productId: 'beans',
  name: 'Feijão a granel',
  unitPriceCents: 140_000,
  quantity: 357,
  lineTotalCents: 50_050, // "500,50 Kz de feijão"
  soldBy: 'weight',
  unitCostCents: 110_000,
};
const sale = { items: [rice, beans] };

describe('money back for returned goods', () => {
  it('is the unit price for units', () => {
    expect(refundFor(rice, 0, 1)).toBe(120_000);
    expect(refundFor(rice, 1, 2)).toBe(240_000);
  });

  it('is proportional for weighed goods, to the whole kwanza, and the parts add up to exactly what the line cost', () => {
    const first = refundFor(beans, 0, 100); // 100 g of 357 g
    expect(first % 100).toBe(0);
    expect(first).toBe(14_000);
    const rest = refundFor(beans, 100, 257);
    expect(first + rest).toBe(50_050);
    expect(refundFor(beans, 0, 357)).toBe(50_050);
  });
});

describe('what can still be returned', () => {
  it('is what was sold minus earlier returns, never more', () => {
    const earlier = [{ items: [{ productId: 'rice', name: 'Arroz 1 kg', quantity: 2, refundCents: 240_000 }] }];
    expect(returnable(sale, earlier)).toEqual(
      new Map([
        ['rice', 1],
        ['beans', 357],
      ]),
    );
    expect(returnItems(sale, earlier, [{ productId: 'rice', quantity: 2 }])).toBe('too_many');
    expect(returnItems(sale, earlier, [{ productId: 'rice', quantity: 1 }])).toEqual([
      { productId: 'rice', name: 'Arroz 1 kg', quantity: 1, refundCents: 120_000, costCents: 100_000 },
    ]);
  });

  it('refuses nothing, goods not in the sale, and odd quantities', () => {
    expect(returnItems(sale, [], [])).toBe('empty');
    expect(returnItems(sale, [], [{ productId: 'rice', quantity: 0 }])).toBe('empty');
    expect(returnItems(sale, [], [{ productId: 'soap', quantity: 1 }])).toBe('not_in_sale');
    expect(returnItems(sale, [], [{ productId: 'rice', quantity: 1.5 }])).toBe('invalid_quantity');
    expect(returnItems(sale, [], [{ productId: 'rice', quantity: -1 }])).toBe('invalid_quantity');
    expect(
      returnItems(
        sale,
        [],
        [
          { productId: 'rice', quantity: 1 },
          { productId: 'rice', quantity: 1 },
        ],
      ),
    ).toBe('invalid_quantity');
  });

  it('keeps the cost of the returned goods, by the kg for weighed goods', () => {
    const items = returnItems(sale, [], [{ productId: 'beans', quantity: 100 }]);
    expect(items).toEqual([
      { productId: 'beans', name: 'Feijão a granel', quantity: 100, soldBy: 'weight', refundCents: 14_000, costCents: 11_000 },
    ]);
  });
});

describe('returns in the numbers', () => {
  it('sum what went back, and what left the till', () => {
    expect(
      summariseReturns([
        { totalCents: 120_000, refund: 'cash' },
        { totalCents: 50_000, refund: 'other' },
        { totalCents: 30_000, refund: 'debt' },
      ]),
    ).toEqual({ count: 3, totalCents: 200_000, cashCents: 120_000 });
  });

  it('lower the profit: goods back on the shelf return their cost, damaged goods stay a cost', () => {
    const sold = [{ items: [rice] }]; // 3 × 1.200 Kz, cost 3 × 1.000 Kz: profit 600 Kz
    expect(summariseProfit(sold).profitCents).toBe(60_000);
    const back = { items: [{ productId: 'rice', name: 'Arroz 1 kg', quantity: 1, refundCents: 120_000, costCents: 100_000 }] };
    expect(summariseProfit(sold, [{ ...back, restock: true }]).profitCents).toBe(40_000); // as if 2 were sold
    expect(summariseProfit(sold, [{ ...back, restock: false }]).profitCents).toBe(-60_000); // 1.200 Kz back and the goods lost
    const noCost = { items: [{ productId: 'x', name: 'X', quantity: 1, refundCents: 5_000 }], restock: true };
    expect(summariseProfit([], [noCost])).toMatchObject({ profitCents: 0, unknownRevenueCents: -5_000 });
  });
});
