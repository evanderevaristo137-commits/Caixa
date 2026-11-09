import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dailyAlert } from '../domain/alerts';
import { addToCart } from '../domain/cart';
import { digitalAlertInfo, dueItems } from './background-alerts';
import { CaixaDB } from './db';
import { Store } from './store';

let db: CaixaDB;
let n = 0;
beforeEach(() => {
  db = new CaixaDB(`test-background-${n++}`);
});
afterEach(async () => {
  await db.delete();
});

describe('what the background checker reads', () => {
  const now = new Date(2026, 10, 9, 10, 0);

  it('lists the customers who owe and the suppliers the shop owes, with the next due date', async () => {
    const st = new Store(db, () => now);
    const rice = await st.products.create({ name: 'Arroz', priceCents: 120_000, minStock: 0 }, 10);
    const customer = await st.customers.create('Cliente de teste');
    await st.sales.create({ cart: addToCart([], rice), method: 'credit', customerId: customer.id, dueDate: '2026-11-09' });
    const supplier = await st.suppliers.create('Fornecedor de teste');
    await st.purchases.create({
      supplierId: supplier.id,
      lines: [{ productId: rice.id, quantity: 5, unitCostCents: 90_000 }],
      payment: 'credit',
      dueDate: '2026-11-10',
    });
    const due = await dueItems(st, now);
    expect(due).toEqual({ credit: [{ name: 'Cliente de teste', dueDate: '2026-11-09' }], suppliers: [{ dueDate: '2026-11-10' }] });
    expect(dailyAlert('2026-11-09', due.credit, due.suppliers, null)).toEqual({
      title: 'Avisos da loja',
      body: 'Clientes: 1 vence hoje. Fornecedores: 1 vence nos próximos dias. Toque para ver.',
      hash: '#/today',
    });
  });

  it('gives the digital payments alarm against the contract minimum', async () => {
    let at = new Date(2026, 10, 5, 12, 0);
    const st = new Store(db, () => at);
    const rice = await st.products.create({ name: 'Arroz', priceCents: 120_000, minStock: 0 }, 100);
    await st.sales.create({ cart: addToCart([], rice, 2), method: 'cash' });
    at = new Date(2026, 10, 6, 12, 0);
    await st.sales.create({ cart: addToCart([], rice), method: 'kwik' });
    expect(await digitalAlertInfo(st, now)).toEqual({ on: '2026-11-09', alarm: false, belowMinimum: false, shareBp: 3333 });
    await st.settings.save({ digitalMinShareBp: 4000 });
    expect(await digitalAlertInfo(st, now)).toEqual({ on: '2026-11-09', alarm: true, belowMinimum: true, shareBp: 3333, minShareBp: 4000 });
  });
});
