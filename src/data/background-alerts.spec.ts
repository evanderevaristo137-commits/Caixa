import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dailyAlert } from '../domain/alerts';
import { addToCart } from '../domain/cart';
import { digitalAlertInfo, dueItems, inssAlert } from './background-alerts';
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

  it('reminds of last month INSS contribution until it is recorded as paid', async () => {
    const st = new Store(db, () => now);
    expect(await inssAlert(st, now)).toBeNull(); // the owner does not follow the INSS
    // The plan started in October; it is 9 November.
    await st.inss.savePlan({ wages: 1, modality: 'normal' });
    await db.settings.update('main', { inss: { wages: 1, modality: 'normal', startMonth: '2026-10' } });
    const item = await inssAlert(st, now);
    expect(item).toEqual({ month: '2026-10', label: 'Outubro', dueDate: '2026-11-10', from: '2026-11-08', until: '2026-11-15' });
    expect(dailyAlert('2026-11-09', [], [], null, item)).toEqual({
      title: 'A minha reforma (INSS)',
      body: 'Pagar a contribuição de Outubro até dia 10. Toque para ver.',
      hash: '#/today',
    });
    await st.inss.pay({ month: '2026-10', amountCents: 800_000 });
    expect(await inssAlert(st, now)).toBeNull();
  });
});
