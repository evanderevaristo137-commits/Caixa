import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { addToCart } from '../domain/cart';
import { creditStatus } from '../domain/credit';
import { describeAudit } from '../domain/audit-describe';
import { isPaymentPending } from '../domain/types';
import { uuid } from '../lib/ids';

let db: CaixaDB;
let store: Store;
let n = 0;
let clock = new Date(2026, 10, 12, 15, 0).getTime();
beforeEach(() => {
  db = new CaixaDB(`test-pending-${n++}`);
  clock = new Date(2026, 10, 12, 15, 0).getTime();
  // A moving clock: each record a second after the one before (the activity log keeps their order).
  store = new Store(db, () => new Date((clock += 1000)));
});
afterEach(async () => {
  await db.delete();
});

const code = (e: unknown) => (e instanceof DomainError ? e.code : String(e));
const NOT_ARRIVED = 'O pagamento não entrou';

async function pendingSale() {
  const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, costCents: 100_000, minStock: 0 }, 10);
  const sale = await store.sales.create({
    cart: addToCart([], rice, 2),
    method: 'multicaixa_express',
    pending: true,
    transactionRef: 'mcx 1',
  });
  return { rice, sale };
}

const log = async () => {
  const names = { product: () => undefined, customer: () => undefined };
  return (await store.auditLog.list()).map((e) => describeAudit(e, names)?.text).filter(Boolean);
};

describe('electronic payments to confirm later', () => {
  it('only electronic payments wait; the sale counts as sold and its goods leave the shelf', async () => {
    const { rice, sale } = await pendingSale();
    expect(sale.pendingSince).toBe(sale.createdAt);
    expect(isPaymentPending(sale)).toBe(true);
    expect((await store.products.get(rice.id))!.stock).toBe(8);
    // Cash and credit never wait (the money is in the hand, or owed).
    const cash = await store.sales.create({ cart: addToCart([], rice), method: 'cash', pending: true });
    expect(cash.pendingSince).toBeUndefined();
    expect((await store.sales.pending()).map((s) => s.id)).toEqual([sale.id]);
    expect(await log()).toContain('Venda n.º 1: 2.400 Kz — Multicaixa Express (por confirmar)');
  });

  it('«Já entrou» confirms it once, in the activity log, without the owner code', async () => {
    const { sale } = await pendingSale();
    await store.security.setPin('2580');
    const confirmed = await store.sales.confirmPayment(sale.id);
    expect(confirmed.confirmedAt).toBeDefined();
    expect(await store.sales.pending()).toEqual([]);
    await expect(store.sales.confirmPayment(sale.id)).rejects.toSatisfy((e) => code(e) === 'not_pending');
    await expect(store.sales.confirmPayment('nope')).rejects.toSatisfy((e) => code(e) === 'not_found');
    expect(await log()).toContain('Pagamento da venda n.º 1 confirmado: 2.400 Kz — Multicaixa Express');
  });

  it('nothing is given back while the money has not arrived', async () => {
    const { rice, sale } = await pendingSale();
    const back = () =>
      store.returns.create({
        saleId: sale.id,
        lines: [{ productId: rice.id, quantity: 1 }],
        refund: 'other',
        restock: true,
        reason: 'Troca',
      });
    await expect(back()).rejects.toSatisfy((e) => code(e) === 'payment_pending');
    await store.sales.confirmPayment(sale.id);
    await back();
  });

  it('a voided sale no longer waits', async () => {
    const { sale } = await pendingSale();
    await store.sales.void(sale.id, 'Cliente desistiu');
    expect(await store.sales.pending()).toEqual([]);
  });
});

describe('«Não entrou»: recording the sale again, paid another way', () => {
  it('in cash: the first sale is voided, the new one has the same lines, the stock ends as it was and the cash is in the till', async () => {
    const { rice, sale } = await pendingSale();
    const id = uuid();
    const again = await store.sales.repay(sale.id, { id, method: 'cash', cashReceivedCents: 250_000 }, NOT_ARRIVED);
    expect(again).toMatchObject({ id, number: 2, method: 'cash', totalCents: 240_000, items: sale.items, replacesSaleId: sale.id });
    expect(again.pendingSince).toBeUndefined();
    const before = (await store.sales.get(sale.id))!;
    expect(before).toMatchObject({ voidReason: NOT_ARRIVED, replacedBySaleId: id });
    expect(before.voidedAt).toBeDefined();
    expect((await store.products.get(rice.id))!.stock).toBe(8);
    expect((await store.cash.drawer(new Date(clock), 0)).cashSalesCents).toBe(240_000);
    expect(await store.sales.pending()).toEqual([]);
    expect(await store.integrity.check()).toEqual([]);
    const lines = await log();
    expect(lines).toContain('Venda n.º 2: 2.400 Kz — Numerário, em vez da venda n.º 1');
    expect(lines).toContain('Venda n.º 1: o pagamento (Multicaixa Express, 2.400 Kz) não entrou — registada de novo como venda n.º 2');
    // The same new sale is never recorded twice.
    await expect(store.sales.repay(sale.id, { id, method: 'cash' }, NOT_ARRIVED)).rejects.toSatisfy((e) => code(e) === 'not_pending');
  });

  it('on credit: the customer owes it, with the usual credit rules', async () => {
    const { sale } = await pendingSale();
    await expect(store.sales.repay(sale.id, { method: 'credit' }, NOT_ARRIVED)).rejects.toSatisfy((e) => code(e) === 'customer_required');
    const customer = await store.customers.create('Cliente Exemplo');
    await store.settings.save({ creditLimitCents: 100_000 });
    await expect(store.sales.repay(sale.id, { method: 'credit', customerId: customer.id }, NOT_ARRIVED)).rejects.toSatisfy(
      (e) => code(e) === 'credit_limit',
    );
    expect(isPaymentPending((await store.sales.get(sale.id))!)).toBe(true); // nothing changed
    await store.sales.repay(sale.id, { method: 'credit', customerId: customer.id, allowOverLimit: true }, NOT_ARRIVED);
    const [sales, payments] = await Promise.all([store.sales.byCustomer(customer.id), store.credit.byCustomer(customer.id)]);
    expect(creditStatus(customer.id, sales, payments, new Date(clock)).balanceCents).toBe(240_000);
  });

  it('can wait again (a new transfer), needs the owner code, and only for a sale still waiting', async () => {
    const { sale } = await pendingSale();
    await store.security.setPin('2580');
    await expect(store.sales.repay(sale.id, { method: 'transfer', pending: true }, NOT_ARRIVED)).rejects.toSatisfy(
      (e) => code(e) === 'owner_code_required',
    );
    await store.security.unlock('2580');
    await expect(store.sales.repay(sale.id, { method: 'transfer', pending: true }, ' ')).rejects.toSatisfy(
      (e) => code(e) === 'reason_required',
    );
    const again = await store.sales.repay(sale.id, { method: 'transfer', pending: true, transactionRef: 'TRF 9' }, NOT_ARRIVED);
    expect(isPaymentPending(again)).toBe(true);
    await store.sales.confirmPayment(again.id);
    await expect(store.sales.repay(again.id, { method: 'cash' }, NOT_ARRIVED)).rejects.toSatisfy((e) => code(e) === 'not_pending');
    store.security.lock();
  });
});
