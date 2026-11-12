import { describe, expect, it } from 'vitest';
import { lastPriceBySupplier, purchasePrices, purchaseReport, supplierPrices, supplierTerms } from './purchase-report';
import type { Purchase } from './types';

const at = (day: number) => new Date(2026, 10, day, 10).toISOString();
const purchase = (
  id: string,
  day: number,
  supplierId: string | undefined,
  lines: [string, number, number][],
  extra: Partial<Purchase> = {},
): Purchase => {
  const items = lines.map(([productId, quantity, unitCostCents]) => ({
    productId,
    name: productId === 'rice' ? 'Arroz 1 kg' : 'Óleo 1 L',
    quantity,
    unitCostCents,
    lineTotalCents: quantity * unitCostCents,
  }));
  return {
    id,
    number: 1,
    ...(supplierId ? { supplierId } : {}),
    items,
    totalCents: items.reduce((a, i) => a + i.lineTotalCents, 0),
    payment: 'cash',
    createdAt: at(day),
    updatedAt: at(day),
    ...extra,
  };
};
const purchases = [
  purchase('p1', 1, 'kikolo', [['rice', 10, 30_000]]),
  purchase('p2', 5, 'viana', [
    ['rice', 10, 32_000],
    ['oil', 5, 150_000],
  ]),
  purchase('p3', 9, 'kikolo', [['rice', 20, 33_000]], { payment: 'credit', dueDate: '2026-11-24' }),
  purchase('p4', 10, 'kikolo', [['rice', 99, 1]], { voidedAt: at(10) }),
];

describe('purchase prices', () => {
  it('of a product: each purchase newest first, and the cheapest supplier last time', () => {
    const rows = purchasePrices('rice', purchases);
    expect(rows.map((r) => [r.purchaseId, r.supplierId, r.unitCostCents])).toEqual([
      ['p3', 'kikolo', 33_000],
      ['p2', 'viana', 32_000],
      ['p1', 'kikolo', 30_000],
    ]);
    expect(lastPriceBySupplier(rows)).toEqual([
      { supplierId: 'viana', lastCents: 32_000, lastAt: at(5), count: 1 },
      { supplierId: 'kikolo', lastCents: 33_000, lastAt: at(9), count: 2 },
    ]);
  });

  it('of a supplier: the last price of each product and how it moved', () => {
    expect(supplierPrices('kikolo', purchases)).toEqual([
      { productId: 'rice', name: 'Arroz 1 kg', lastCents: 33_000, lastAt: at(9), previousCents: 30_000, changeBp: 1_000 },
    ]);
  });

  it('the credit a supplier gives and how punctually the shop pays it', () => {
    const terms = supplierTerms('kikolo', purchases, [{ supplierId: 'kikolo', amountCents: 660_000, createdAt: at(20) }], '2026-11-30');
    expect(terms.avgTermDays).toBe(15);
    expect(terms.punctuality).toMatchObject({ onTime: 1, late: 0, openLate: 0 });
  });
});

describe('purchase report', () => {
  it('sums a period by supplier and by product; voided purchases never count', () => {
    const r = purchaseReport(purchases, new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(r).toMatchObject({ count: 3, totalCents: 300_000 + 1_070_000 + 660_000, onCreditCents: 660_000, paidNowCents: 1_370_000 });
    expect(r.bySupplier).toEqual([
      { supplierId: 'viana', totalCents: 1_070_000, count: 1 },
      { supplierId: 'kikolo', totalCents: 960_000, count: 2 },
    ]);
    expect(r.byProduct.map((p) => [p.productId, p.quantity, p.totalCents])).toEqual([
      ['rice', 40, 300_000 + 320_000 + 660_000],
      ['oil', 5, 750_000],
    ]);
  });
});
