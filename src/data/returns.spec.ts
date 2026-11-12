import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { exportBackup } from './backup';
import { addToCart } from '../domain/cart';
import { creditStatus } from '../domain/credit';
import { receipts } from '../domain/digital-watch';
import { summariseDayView } from '../domain/today';

let db: CaixaDB;
let store: Store;
let n = 0;
const now = new Date(2026, 10, 12, 15, 0);
beforeEach(() => {
  db = new CaixaDB(`test-returns-${n++}`);
  store = new Store(db, () => now);
});
afterEach(async () => {
  await db.delete();
});

const code = (e: unknown) => (e instanceof DomainError ? e.code : String(e));

async function shop() {
  const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, costCents: 100_000, minStock: 0 }, 10);
  const oil = await store.products.create({ name: 'Óleo 1 L', priceCents: 185_000, minStock: 0 }, 10);
  return { rice, oil };
}

describe('returns', () => {
  it('a cash sale, in part: money from the till, goods back on the shelf, all in one go and audited', async () => {
    const { rice, oil } = await shop();
    const sale = await store.sales.create({ cart: addToCart(addToCart([], rice, 3), oil), method: 'cash' });
    expect((await store.cash.drawer(now, 0)).expectedCents).toBe(545_000);

    const ret = await store.returns.create({
      saleId: sale.id,
      lines: [{ productId: rice.id, quantity: 1 }],
      refund: 'cash',
      restock: true,
      reason: 'Produto com defeito',
    });
    expect(ret).toMatchObject({ number: 1, saleNumber: 1, totalCents: 120_000, refund: 'cash', restock: true });
    expect((await store.products.get(rice.id))!.stock).toBe(8); // 10 − 3 + 1
    const drawer = await store.cash.drawer(now, 0);
    expect(drawer).toMatchObject({ cashSalesCents: 545_000, cashRefundsCents: 120_000, expectedCents: 425_000 });
    // The sale never changes; the return is its own record.
    expect((await store.sales.get(sale.id))!.totalCents).toBe(545_000);
    expect(await store.returns.bySale(sale.id)).toHaveLength(1);
    const log = (await store.auditLog.list()).filter((a) => a.entity === 'return');
    expect(log).toHaveLength(1);
    expect(log[0]!.after).toMatchObject({ number: 1, saleNumber: 1, totalCents: 120_000, reason: 'Produto com defeito' });
    expect(await store.integrity.check()).toEqual([]);
  });

  it('never more than was sold, across several returns; damaged goods do not go back to the stock', async () => {
    const { rice } = await shop();
    const sale = await store.sales.create({ cart: addToCart([], rice, 2), method: 'kwik' });
    const back = (quantity: number, restock = false) =>
      store.returns.create({ saleId: sale.id, lines: [{ productId: rice.id, quantity }], refund: 'other', restock, reason: 'Estragado' });
    await back(1);
    expect((await store.products.get(rice.id))!.stock).toBe(8);
    await expect(back(2)).rejects.toSatisfy((e) => code(e) === 'too_many');
    await back(1);
    await expect(back(1)).rejects.toSatisfy((e) => code(e) === 'too_many');
    // Money given back another way does not touch the till.
    expect((await store.cash.drawer(now, 0)).cashRefundsCents).toBe(0);
  });

  it('on a credit sale lowers what the customer owes, without counting as money received', async () => {
    const { rice } = await shop();
    const customer = await store.customers.create('Cliente Exemplo');
    const sale = await store.sales.create({ cart: addToCart([], rice, 2), method: 'credit', customerId: customer.id });
    await expect(
      store.returns.create({
        saleId: sale.id,
        lines: [{ productId: rice.id, quantity: 1 }],
        refund: 'cash',
        restock: true,
        reason: 'Troca',
      }),
    ).rejects.toSatisfy((e) => code(e) === 'invalid_refund');
    await store.returns.create({
      saleId: sale.id,
      lines: [{ productId: rice.id, quantity: 1 }],
      refund: 'debt',
      restock: true,
      reason: 'Troca',
    });

    const [sales, payments] = await Promise.all([store.sales.byCustomer(customer.id), store.credit.byCustomer(customer.id)]);
    expect(creditStatus(customer.id, sales, payments, now).balanceCents).toBe(120_000);
    expect(payments).toMatchObject([{ method: 'return', amountCents: 120_000 }]);
    // Not money in: the day and the digital payments watch leave it out.
    expect(summariseDayView(sales, payments, now, now).creditPaidCents).toBe(0);
    expect(receipts([], payments, 0, Date.now() * 2).totalCents).toBe(0);
    // A payment can never pretend to be a return.
    await expect(store.credit.addPayment(customer.id, 1_000, 'return' as 'cash')).rejects.toSatisfy((e) => code(e) === 'invalid_method');
    // Paying the rest settles the account.
    await store.credit.addPayment(customer.id, 120_000, 'cash');
    await expect(store.credit.addPayment(customer.id, 1_000, 'cash')).rejects.toSatisfy((e) => code(e) === 'too_much');
  });

  it('a sale with returns cannot be voided, a voided sale cannot be returned, and a reason is needed', async () => {
    const { rice, oil } = await shop();
    const sale = await store.sales.create({ cart: addToCart(addToCart([], rice), oil), method: 'cash' });
    await expect(
      store.returns.create({ saleId: sale.id, lines: [{ productId: rice.id, quantity: 1 }], refund: 'cash', restock: true, reason: ' ' }),
    ).rejects.toSatisfy((e) => code(e) === 'reason_required');
    await store.returns.create({
      saleId: sale.id,
      lines: [{ productId: rice.id, quantity: 1 }],
      refund: 'cash',
      restock: true,
      reason: 'Troca',
    });
    await expect(store.sales.void(sale.id, 'Engano no registo')).rejects.toSatisfy((e) => code(e) === 'has_returns');

    const other = await store.sales.create({ cart: addToCart([], oil), method: 'cash' });
    await store.sales.void(other.id, 'Engano no registo');
    await expect(
      store.returns.create({
        saleId: other.id,
        lines: [{ productId: oil.id, quantity: 1 }],
        refund: 'cash',
        restock: true,
        reason: 'Troca',
      }),
    ).rejects.toSatisfy((e) => code(e) === 'sale_voided');
  });

  it('needs the owner code when there is one, and travels in the backups', async () => {
    const { rice } = await shop();
    const sale = await store.sales.create({ cart: addToCart([], rice), method: 'cash' });
    await store.security.setPin('2580');
    const input = {
      saleId: sale.id,
      lines: [{ productId: rice.id, quantity: 1 }],
      refund: 'cash' as const,
      restock: true,
      reason: 'Troca',
    };
    await expect(store.returns.create(input)).rejects.toSatisfy((e) => code(e) === 'owner_code_required');
    await store.security.unlock('2580');
    await store.returns.create(input);
    store.security.lock();
    expect((await exportBackup(db)).data.returns).toHaveLength(1);
  });
});
