import { describe, expect, it } from 'vitest';
import { buildDemoData, DEMO_VERSION, ensureFreshDemo, seedDemo } from './demo-seed';
import { lineTotalFor } from '../domain/quantity';
import { creditBook } from '../domain/credit';
import { payablesBook } from '../domain/payables';
import { lowStockProducts, summariseDayView } from '../domain/today';
import { CaixaDB } from './db';
import { Store } from './store';

const now = new Date(2026, 10, 6, 16, 0);

describe('demo data', () => {
  const d = buildDemoData(now);

  it('puts every product in a category', () => {
    expect(d.products.filter((p) => !p.category).map((p) => p.name)).toEqual([]);
    expect(new Set(d.products.map((p) => p.category)).size).toBe(7);
  });

  it('has 33 products (3 sold by weight), 5 customers and two weeks of sales', () => {
    expect(d.products).toHaveLength(33);
    expect(d.products.filter((p) => p.soldBy === 'weight').map((p) => p.name)).toEqual([
      'Arroz a granel',
      'Feijão a granel',
      'Açúcar a granel',
    ]);
    expect(d.sales.some((s) => s.items.some((i) => i.soldBy === 'weight'))).toBe(true);
    expect(d.customers).toHaveLength(5);
    const days = new Set(d.sales.map((s) => new Date(s.createdAt).toDateString()));
    expect(days.size).toBe(15);
    expect(d.sales.every((s) => new Date(s.createdAt) <= now)).toBe(true);
  });

  it('keeps money in integers and totals consistent', () => {
    for (const s of d.sales) {
      expect(Number.isInteger(s.totalCents)).toBe(true);
      expect(s.totalCents).toBe(s.items.reduce((a, i) => a + lineTotalFor(i.unitPriceCents, i.quantity, i.soldBy), 0));
    }
  });

  it('stock projection equals the sum of movements', () => {
    for (const p of d.products) {
      const sum = d.movements.filter((m) => m.productId === p.id).reduce((a, m) => a + m.delta, 0);
      expect(sum).toBe(p.stock);
    }
  });

  it('has money out and an end-of-day count for every past day that adds up', () => {
    expect(d.expenses.some((e) => e.category === 'withdrawal')).toBe(true);
    expect(d.expenses.some((e) => e.category === 'rent' && !e.fromCash)).toBe(true);
    expect(d.closes).toHaveLength(14);
    expect(d.closes.map((c) => c.day)).not.toContain('2026-11-06'); // today stays open
    for (const c of d.closes) {
      const inDay = (x: { createdAt: string }) => {
        const dt = new Date(x.createdAt);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` === c.day;
      };
      const cashSales = d.sales.filter((s) => inDay(s) && s.method === 'cash').reduce((a, s) => a + s.totalCents, 0);
      const cashPaid = d.payments.filter((p) => inDay(p) && p.method === 'cash').reduce((a, p) => a + p.amountCents, 0);
      const cashOut = d.expenses.filter((e) => inDay(e) && e.fromCash).reduce((a, e) => a + e.amountCents, 0);
      const cashBought =
        d.purchases.filter((p) => inDay(p) && p.payment === 'cash').reduce((a, p) => a + p.totalCents, 0) +
        d.supplierPayments.filter((p) => inDay(p) && p.fromCash).reduce((a, p) => a + p.amountCents, 0);
      expect(c.expectedCents).toBe(c.floatCents + cashSales + cashPaid - cashOut - cashBought);
      expect(c.differenceCents).toBe(c.countedCents - c.expectedCents);
    }
    expect(d.closes.some((c) => c.differenceCents < 0)).toBe(true);
  });

  it('has suppliers, purchases that raised the stock and one supplier to pay soon', () => {
    expect(d.suppliers.map((s) => s.name)).toEqual(['Armazém Kikolo', 'Distribuidora Viana', 'Padaria do Bairro']);
    expect(d.products.every((p) => p.supplierId)).toBe(true);
    expect(d.purchases.map((p) => p.payment)).toEqual(['credit', 'cash', 'cash']);
    for (const pu of d.purchases) {
      expect(pu.totalCents).toBe(pu.items.reduce((a, i) => a + i.lineTotalCents, 0));
      for (const it of pu.items)
        expect(d.movements.some((m) => m.purchaseId === pu.id && m.productId === it.productId && m.delta === it.quantity)).toBe(true);
    }
    const book = payablesBook(d.suppliers, d.purchases, d.supplierPayments, now);
    expect(book[0]!.supplier.name).toBe('Armazém Kikolo');
    expect(book[0]!.dueState).toBe('soon');
    expect(book[0]!.balanceCents).toBe(d.purchases[0]!.totalCents - 2_000_000);
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
    // Example data from an older version of the app is renewed at once.
    await db.meta.put({ key: 'demoVersion', value: DEMO_VERSION - 1 });
    expect(await ensureFreshDemo(db, new Date(2026, 10, 7, 9, 0))).toBe(true);
    expect(await ensureFreshDemo(db, new Date(2026, 10, 7, 10, 0))).toBe(false);
    await db.delete();
  });
});

describe('demo payment terms', () => {
  it('shows every situation: overdue, due today, due soon and later', () => {
    const d = buildDemoData(now);
    const book = creditBook(d.customers, d.sales, d.payments, now);
    const state = Object.fromEntries(book.map((b) => [b.customer.name, b.dueState]));
    expect(state).toEqual({
      'Joana Mateus': 'overdue',
      'António Kiala': 'overdue',
      'Esperança Domingos': 'today',
      'Manuel Sebastião': 'soon',
      'Luísa Neto': 'later',
    });
    expect(d.sales.filter((s) => s.method === 'credit').every((s) => s.dueDate && s.dueDate >= s.createdAt.slice(0, 10))).toBe(true);
  });

  it('every demo customer uses the WhatsApp test number', () => {
    expect(new Set(buildDemoData(now).customers.map((c) => c.phone))).toEqual(new Set(['955 502 264']));
  });
});
