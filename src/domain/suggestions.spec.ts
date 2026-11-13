import { describe, expect, it } from 'vitest';
import { belowCost, bestWeekday, lostCustomers, stillMoney, SUGGEST } from './suggestions';
import type { Customer, Product, Sale } from './types';

const now = new Date(2026, 10, 13, 15, 0); // Friday 13/11/2026, afternoon
const product = (over: Partial<Product>): Product => ({
  id: over.id ?? 'p',
  name: over.name ?? 'Produto',
  priceCents: 1000,
  stock: 1,
  minStock: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const customer = (id: string, name = id): Customer => ({ id, name, createdAt: '', updatedAt: '' });
let n = 0;
/** A sale `daysAgo` days before today, at 10:00 local time. */
const sale = (daysAgo: number, over: Partial<Sale> = {}): Sale => {
  const at = new Date(2026, 10, 13 - daysAgo, 10, 0);
  return {
    id: `s${n++}`,
    number: n,
    items: [],
    totalCents: 1000,
    currency: 'AOA',
    method: 'cash',
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
    ...over,
  };
};

describe('belowCost', () => {
  it('finds products whose price is below what they cost, and nothing else', () => {
    const rows = belowCost([
      product({ id: 'a', priceCents: 1100, costCents: 1150 }),
      product({ id: 'b', priceCents: 1100, costCents: 900 }),
      product({ id: 'c', priceCents: 1100 }),
      product({ id: 'd', priceCents: 1100, costCents: 2000, archivedAt: 'x' }),
    ]);
    expect(rows.map((r) => r.product.id)).toEqual(['a']);
  });
});

describe('lostCustomers', () => {
  const credit = (who: string, daysAgo: number) => sale(daysAgo, { method: 'credit', customerId: who });

  it('a regular customer away for much longer than usual', () => {
    // Bought every 7 days, the last time 30 days ago.
    const sales = [51, 44, 37, 30].map((d) => credit('ana', d));
    const [lost] = lostCustomers([customer('ana', 'Ana')], sales, now);
    expect(lost).toMatchObject({ purchases: 4, daysAway: 30, lastDay: '2026-10-14' });
  });

  it('never with too little history, nor someone who comes back as usual', () => {
    // Only two purchases: not enough to know her habit.
    expect(lostCustomers([customer('a')], [credit('a', 60), credit('a', 30)], now)).toEqual([]);
    // Buys every 20 days and the last time was 25 days ago: within twice her usual gap.
    expect(
      lostCustomers(
        [customer('b')],
        [65, 45, 25].map((d) => credit('b', d)),
        now,
      ),
    ).toEqual([]);
    // Away for less than 21 days.
    expect(
      lostCustomers(
        [customer('c')],
        [20, 18, 16, 14].map((d) => credit('c', d)),
        now,
      ),
    ).toEqual([]);
  });

  it('voided sales and purchases on the same day do not count as habits', () => {
    const sales = [credit('d', 50), credit('d', 50), credit('d', 40), { ...credit('d', 35), voidedAt: 'x' }];
    expect(lostCustomers([customer('d')], sales, now)).toEqual([]);
  });
});

describe('stillMoney', () => {
  const still = (valueCents?: number) => ({ product: product({}), ...(valueCents !== undefined ? { valueCents } : {}) });
  it('only when the money on the shelf is worth a promotion', () => {
    expect(stillMoney([still(400_000), still(400_000), still(400_000)])).toEqual({ count: 3, valueCents: 1_200_000 });
    expect(stillMoney([still(400_000), still(400_000)])).toBeNull(); // too few products
    expect(stillMoney([still(100_000), still(100_000), still(100_000), still()])).toBeNull(); // too little money
  });
});

describe('bestWeekday', () => {
  /** 8 weeks of sales: 1.000 Kz a day, and `fridayCents` on Fridays. */
  const weeks = (fridayCents: number, days = 56) => {
    const out: Sale[] = [];
    for (let d = 1; d <= days; d++) {
      const date = new Date(2026, 10, 13 - d);
      out.push(sale(d, { totalCents: date.getDay() === 5 ? fridayCents : 100_000 }));
    }
    return out;
  };

  it('finds the day that clearly sells more than the average day', () => {
    const best = bestWeekday(weeks(200_000), now);
    expect(best?.weekday).toBe(5);
    // Average day = (6 × 1.000 + 2.000) / 7 ≈ 1.143 Kz: Fridays sell 75% more.
    expect(best?.aboveBp).toBe(7500);
  });

  it('says nothing when the difference is small, or the history is short', () => {
    expect(bestWeekday(weeks(110_000), now)).toBeNull();
    expect(bestWeekday(weeks(200_000, SUGGEST.weekdayMinDaysWithSales - 1), now)).toBeNull();
  });

  it('leaves today out (its sales are not complete)', () => {
    const today = sale(0, { totalCents: 10_000_000 });
    expect(bestWeekday([...weeks(100_000), today], now)).toBeNull();
  });
});
