import { describe, expect, it } from 'vitest';
import {
  DAMAGED_RETURN,
  daysLeft,
  paceOf,
  restockList,
  salesSpeed,
  speedFromMovements,
  stillProducts,
  stockLosses,
  stockValueCents,
} from './stock-insights';
import type { Product } from './types';

const now = new Date(2026, 10, 12, 15, 0);
const at = (daysAgo: number) => new Date(2026, 10, 12 - daysAgo, 10).toISOString();
const old = new Date(2026, 7, 1).toISOString();
const product = (id: string, stock: number, minStock: number, extra: Partial<Product> = {}): Product => ({
  id,
  name: id,
  priceCents: 10_000,
  stock,
  minStock,
  createdAt: old,
  updatedAt: old,
  ...extra,
});
const sale = (daysAgo: number, lines: [string, number][], voidedAt?: string) => ({
  createdAt: at(daysAgo),
  voidedAt,
  items: lines.map(([productId, quantity]) => ({ productId, name: productId, unitPriceCents: 100, quantity, lineTotalCents: 100 })),
});

describe('speed of sale', () => {
  it('counts the valid sales of the last 30 days, per day the product could sell', () => {
    const speeds = salesSpeed(
      [sale(0, [['rice', 3]]), sale(10, [['rice', 27]]), sale(29, [['rice', 30]]), sale(30, [['rice', 99]]), sale(1, [['rice', 50]], 'x')],
      [product('rice', 10, 2), product('new', 10, 2, { createdAt: at(3) })],
      now,
    );
    expect(speeds.get('rice')).toEqual({ sold: 60, perDay: 2, lastSoldAt: at(0) });
    expect(speeds.has('new')).toBe(false);
  });

  it('measures a new product over the days since it arrived, never fewer than 7', () => {
    const products = [product('new', 10, 0, { createdAt: at(13) }), product('newer', 10, 0, { createdAt: at(1) })];
    const speeds = salesSpeed(
      [
        sale(2, [
          ['new', 28],
          ['newer', 14],
        ]),
      ],
      products,
      now,
    );
    expect(speeds.get('new')!.perDay).toBe(2); // 28 in 14 days
    expect(speeds.get('newer')!.perDay).toBe(2); // 14 in at least 7 days
  });

  it('gives the days the stock lasts, and the pace in words', () => {
    expect(daysLeft(10, { sold: 60, perDay: 2 })).toBe(5);
    expect(daysLeft(-3, { sold: 60, perDay: 2 })).toBe(0);
    expect(daysLeft(10, undefined)).toBeUndefined();
    expect(paceOf(1.5)).toEqual({ qty: '1,5', per: 'day' });
    expect(paceOf(0.5)).toEqual({ qty: '3,5', per: 'week' });
    expect(paceOf(750, 'weight')).toEqual({ qty: '0,75 kg', per: 'day' });
    expect(paceOf(50, 'weight')).toEqual({ qty: '0,35 kg', per: 'week' });
  });

  it('can be read from the movements of one product: sales less voided sales', () => {
    const speed = speedFromMovements(
      [
        { type: 'sale', delta: -40, createdAt: at(1) },
        { type: 'void', delta: 10, createdAt: at(1) },
        { type: 'entry', delta: 100, createdAt: at(2) },
        { type: 'sale', delta: -500, createdAt: at(40) },
      ],
      product('rice', 10, 2),
      now,
    );
    expect(speed).toEqual({ sold: 30, perDay: 1, lastSoldAt: at(1) });
    expect(speedFromMovements([{ type: 'entry', delta: 5, createdAt: at(1) }], product('rice', 10, 2), now)).toBeUndefined();
  });
});

describe('what to buy', () => {
  const products = [
    product('ok', 50, 5), // sells 1 a day: 50 days left
    product('soon', 10, 2), // above its minimum, but sells 2 a day: 5 days left
    product('low', 3, 4), // below its minimum, does not sell
    product('beans', 2_000, 1_000, { soldBy: 'weight' }), // 300 g a day: 6 days left
    product('gone', 0, 0, { archivedAt: old }),
  ];
  const speeds = new Map([
    ['ok', { sold: 30, perDay: 1 }],
    ['soon', { sold: 60, perDay: 2 }],
    ['beans', { sold: 9_000, perDay: 300 }],
  ]);

  it('adds what runs out within a week, with two weeks of sales, soonest first', () => {
    expect(restockList(products, speeds).map((l) => [l.productId, l.why, l.daysLeft, l.suggested])).toEqual([
      ['soon', 'soon', 5, 18], // 2 × 14 − 10
      ['beans', 'soon', 6, 3_000], // 300 g × 14 − 2 kg = 2,2 kg, in whole kilos
      ['low', 'low', undefined, 5], // twice the minimum, as before
    ]);
  });

  it('without the speed of sale, works as before (the minimum only)', () => {
    expect(restockList(products).map((l) => [l.productId, l.suggested])).toEqual([['low', 5]]);
  });
});

describe('products standing still', () => {
  it('are in stock, older than 30 days, unsold for 30 days; the money on the shelf first', () => {
    const products = [
      product('sells', 10, 0, { costCents: 1_000 }),
      product('cheap', 4, 0, { costCents: 500 }),
      product('dear', 2, 0, { costCents: 9_000 }),
      product('nocost', 7, 0),
      product('empty', 0, 0),
      product('new', 5, 0, { createdAt: at(5) }),
      product('kilos', 2_500, 0, { soldBy: 'weight', costCents: 80_000 }),
    ];
    const still = stillProducts(products, new Map([['sells', { sold: 1, perDay: 0.1 }]]), now);
    expect(still.map((s) => [s.product.id, s.valueCents])).toEqual([
      ['kilos', 200_000], // 2,5 kg at 800 Kz/kg
      ['dear', 18_000],
      ['cheap', 2_000],
      ['nocost', undefined],
    ]);
    expect(stockValueCents({ costCents: 80_000, soldBy: 'weight' }, 250)).toBe(20_000);
  });
});

describe('losses', () => {
  it('adjustments down and goods given back damaged, at the cost price, most money first', () => {
    const products = [
      product('rice', 10, 0, { costCents: 100_000 }),
      product('soap', 10, 0),
      product('beans', 0, 0, { soldBy: 'weight', costCents: 120_000 }),
    ];
    const losses = stockLosses(
      [
        { productId: 'rice', type: 'adjustment', delta: -2, reason: 'Partido / estragado' },
        { productId: 'rice', type: 'adjustment', delta: -1, reason: 'Roubo / perda' },
        { productId: 'rice', type: 'adjustment', delta: 1, reason: 'Contagem' }, // found: makes up for part
        { productId: 'soap', type: 'adjustment', delta: -4, reason: 'Fora de prazo' },
        { productId: 'rice', type: 'sale', delta: -5 }, // sold: not a loss
      ],
      [
        { restock: false, items: [{ productId: 'beans', name: 'beans', quantity: 500, refundCents: 70_000, costCents: 60_000 }] },
        { restock: true, items: [{ productId: 'rice', name: 'rice', quantity: 1, refundCents: 120_000, costCents: 100_000 }] },
      ],
      products,
    );
    expect(losses.lines).toEqual([
      {
        productId: 'rice',
        name: 'rice',
        quantity: 3,
        valueCents: 300_000,
        reasons: [
          { reason: 'Partido / estragado', quantity: 2 },
          { reason: 'Roubo / perda', quantity: 1 },
        ],
      },
      {
        productId: 'beans',
        name: 'beans',
        quantity: 500,
        soldBy: 'weight',
        valueCents: 60_000,
        reasons: [{ reason: DAMAGED_RETURN, quantity: 500 }],
      },
      { productId: 'soap', name: 'soap', quantity: 4, reasons: [{ reason: 'Fora de prazo', quantity: 4 }] },
    ]);
    expect(losses).toMatchObject({ valueCents: 360_000, unknownLines: 1, foundValueCents: 100_000 });
  });
});
