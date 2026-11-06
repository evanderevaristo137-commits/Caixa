import { describe, expect, it } from 'vitest';
import { buildDemoData, ensureFreshDemo, seedDemo } from './demo-seed';
import { creditBook } from '../domain/credit';
import { lowStockProducts, summariseDayView } from '../domain/today';
import { CaixaDB } from './db';
import { Store } from './store';

const now = new Date(2026, 10, 6, 16, 0);

describe('demo data', () => {
  const d = buildDemoData(now);

  it('has 30 products, 5 customers and two weeks of sales', () => {
    expect(d.products).toHaveLength(30);
    expect(d.customers).toHaveLength(5);
    const days = new Set(d.sales.map((s) => new Date(s.createdAt).toDateString()));
    expect(days.size).toBe(15);
    expect(d.sales.every((s) => new Date(s.createdAt) <= now)).toBe(true);
  });

  it('keeps money in integers and totals consistent', () => {
    for (const s of d.sales) {
      expect(Number.isInteger(s.totalCents)).toBe(true);
      expect(s.totalCents).toBe(s.items.reduce((a, i) => a + i.unitPriceCents * i.quantity, 0));
    }
  });

  it('stock projection equals the sum of movements', () => {
    for (const p of d.products) {
      const sum = d.movements.filter((m) => m.productId === p.id).reduce((a, m) => a + m.delta, 0);
      expect(sum).toBe(p.stock);
    }
  });

  it('all 5 customers owe something and some products are low', () => {
    const book = creditBook(d.customers, d.sales, d.payments, now);
    expect(book.filter((b) => b.balanceCents > 0)).toHaveLength(5);
    expect(lowStockProducts(d.products).length).toBeGreaterThanOrEqual(3);
    expect(summariseDayView(d.sales, d.payments, now, now).day.count).toBeGreaterThan(0);
  });

  it('is only written to the demo database, and new sales continue the numbering', async () => {
    const real = new CaixaDB('caixa-loja-x');
    await expect(seedDemo(real, now)).rejects.toThrow();
    const db = new CaixaDB('test-demo-seed');
    await seedDemo(db, now);
    const store = new Store(db);
    expect((await store.settings.get()).storeName).toBe('Mercearia da Dona Teresa');
    const p = (await store.products.list())[0]!;
    const sale = await store.sales.create({
      cart: [{ productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: 1 }],
      method: 'cash',
    });
    expect(sale.number).toBe(d.sales.length + 1);
    await db.delete();
  });
});

describe('ensureFreshDemo', () => {
  it('seeds when empty, keeps same-day data, and renews on a new day', async () => {
    const db = new CaixaDB('test-demo-fresh');
    expect(await ensureFreshDemo(db, now)).toBe(true);
    const store = new Store(db);
    await store.customers.create('Visita de hoje');
    expect(await ensureFreshDemo(db, new Date(2026, 10, 6, 21, 0))).toBe(false);
    expect((await store.customers.list()).some((c) => c.name === 'Visita de hoje')).toBe(true);
    expect(await ensureFreshDemo(db, new Date(2026, 10, 7, 8, 0))).toBe(true);
    expect((await store.customers.list()).some((c) => c.name === 'Visita de hoje')).toBe(false);
    await db.delete();
  });
});
