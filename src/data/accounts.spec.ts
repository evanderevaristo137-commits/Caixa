import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addToCart } from '../domain/cart';
import { creditBook, type CreditAccount } from '../domain/credit';
import { uuid } from '../lib/ids';
import { exportBackup, importBackup } from './backup';
import { CaixaDB } from './db';
import { seedDemo } from './demo-seed';
import { Store } from './store';

let db: CaixaDB;
let store: Store;
let n = 0;
let clock = new Date(2026, 10, 12, 10, 0);
beforeEach(() => {
  clock = new Date(2026, 10, 12, 10, 0);
  db = new CaixaDB(`test-accounts-${n++}`);
  store = new Store(db, () => clock);
});
afterEach(async () => {
  await db.delete();
});

/** The customers' situation from the saved accounts must be exactly the one the facts give. */
async function expectAccountsMatchFacts(st = store, now = clock) {
  const fromAccounts = await st.credit.book(now);
  const [customers, sales, payments] = await Promise.all([st.customers.list(), st.db.sales.toArray(), st.db.creditPayments.toArray()]);
  expect(fromAccounts).toEqual(creditBook(customers, sales, payments, now));
  return fromAccounts;
}
const owes = async (customerId: string) => (await store.credit.book(clock)).find((b) => b.customer.id === customerId)!.balanceCents;

async function shop() {
  const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 100_000, minStock: 0 }, 50);
  const a = await store.customers.create('Cliente A');
  const b = await store.customers.create('Cliente B');
  return { rice, a, b };
}
const onCredit = (rice: Awaited<ReturnType<typeof shop>>['rice'], customerId: string, qty: number) =>
  store.sales.create({ cart: addToCart([], rice, qty), method: 'credit', customerId });

describe("each customer's saved account", () => {
  it('follows every credit sale, payment, return and void, always equal to what the sales and payments give', async () => {
    const { rice, a, b } = await shop();
    // A cash sale never touches the accounts.
    await store.sales.create({ cart: addToCart([], rice, 1), method: 'cash' });
    expect(await db.accounts.count()).toBe(0);

    const first = await onCredit(rice, a.id, 3);
    clock = new Date(2026, 10, 13, 10, 0);
    const second = await onCredit(rice, a.id, 2);
    await onCredit(rice, b.id, 1);
    expect(await owes(a.id)).toBe(500_000);
    await expectAccountsMatchFacts();

    // A part payment settles the oldest purchase first.
    await store.credit.addPayment(a.id, 200_000, 'cash');
    expect((await db.accounts.get(a.id))!.open.map((i) => i.remainingCents)).toEqual([100_000, 200_000]);
    await expectAccountsMatchFacts();

    // Goods given back lower the debt.
    await store.returns.create({
      saleId: second.id,
      lines: [{ productId: rice.id, quantity: 1 }],
      refund: 'debt',
      restock: true,
      reason: 'Troca',
    });
    expect(await owes(a.id)).toBe(200_000);
    await expectAccountsMatchFacts();

    // A voided credit sale stops counting.
    await store.sales.void(first.id, 'Engano no cliente');
    await expectAccountsMatchFacts();

    // Weeks later: the same accounts, other due states (the calendar moves, the account does not).
    const later = new Date(2026, 11, 20, 10, 0);
    const book = await expectAccountsMatchFacts(store, later);
    expect(book.find((x) => x.customer.id === b.id)!.dueState).toBe('overdue');
  });

  it('a sale whose money never came, recorded again on credit, goes to the customer', async () => {
    const { rice, a } = await shop();
    const sale = await store.sales.create({ cart: addToCart([], rice, 2), method: 'multicaixa_express', pending: true });
    await store.sales.repay(sale.id, { id: uuid(), method: 'credit', customerId: a.id }, 'O pagamento não entrou');
    expect(await owes(a.id)).toBe(200_000);
    await expectAccountsMatchFacts();
  });

  it('a customer who paid everything has nothing left open', async () => {
    const { rice, a } = await shop();
    await onCredit(rice, a.id, 2);
    await store.credit.addPayment(a.id, 200_000, 'cash');
    expect(await db.accounts.get(a.id)).toMatchObject({ totalCreditCents: 200_000, totalPaidCents: 200_000, open: [] });
    expect(await owes(a.id)).toBe(0);
    await expectAccountsMatchFacts();
  });

  it('are built again from the facts after a backup is restored (they never go in a backup)', async () => {
    const { rice, a } = await shop();
    await onCredit(rice, a.id, 4);
    const backup = await exportBackup(db, clock);
    expect(Object.keys(backup.data)).not.toContain('accounts');

    const other = new CaixaDB(`test-accounts-other-${n++}`);
    try {
      const otherStore = new Store(other, () => clock);
      const c = await otherStore.customers.create('Outro cliente');
      const p = await otherStore.products.create({ name: 'Óleo', priceCents: 50_000, minStock: 0 }, 10);
      await otherStore.sales.create({ cart: addToCart([], p, 1), method: 'credit', customerId: c.id });
      await importBackup(other, backup, clock);
      const book = await expectAccountsMatchFacts(otherStore);
      expect(book.filter((x) => x.balanceCents > 0).map((x) => [x.customer.name, x.balanceCents])).toEqual([['Cliente A', 400_000]]);
    } finally {
      await other.delete();
    }
  });

  it('are built for the demonstration when it is filled', async () => {
    const demo = new CaixaDB(`test-accounts-demo-${n++}`);
    try {
      await seedDemo(demo, clock);
      expect(await demo.accounts.count()).toBeGreaterThan(0);
      await expectAccountsMatchFacts(new Store(demo, () => clock));
    } finally {
      await demo.delete();
    }
  });

  it('«Verificar os dados» finds an account out of step, and one tap builds them again', async () => {
    const { rice, a } = await shop();
    await onCredit(rice, a.id, 3);
    expect(await store.integrity.check()).toEqual([]);
    await db.accounts.update(a.id, { totalPaidCents: 50_000 } as Partial<CreditAccount>);
    expect(await store.integrity.check()).toEqual([{ kind: 'account_mismatch', customerId: a.id, name: 'Cliente A' }]);
    expect(await store.integrity.reconcileAccounts()).toBe(1);
    expect(await store.integrity.check()).toEqual([]);
    expect(await store.integrity.reconcileAccounts()).toBe(0);
    await expectAccountsMatchFacts();
  });
});

describe('updating the app (database version 12)', () => {
  it("builds every customer's account from the sales and payments the phone already has, losing nothing", async () => {
    const name = `test-accounts-upgrade-${n++}`;
    // The database as version 11 left it (the tables that matter here).
    const old = new Dexie(name);
    old.version(11).stores({
      customers: 'id, name, updatedAt',
      sales: 'id, createdAt, customerId, method, updatedAt, pendingSince',
      creditPayments: 'id, customerId, createdAt, updatedAt',
    });
    const at = (day: number) => new Date(2026, 10, day, 10).toISOString();
    const customer = { id: 'c1', name: 'Cliente A', createdAt: at(1), updatedAt: at(1) };
    const sale = (id: string, day: number, totalCents: number, extra: object = {}) => ({
      id,
      number: Number(id.slice(1)),
      items: [],
      totalCents,
      currency: 'AOA',
      method: 'credit',
      customerId: 'c1',
      dueDate: `2026-11-${String(day + 15).padStart(2, '0')}`,
      createdAt: at(day),
      updatedAt: at(day),
      ...extra,
    });
    await old.table('customers').add(customer);
    await old.table('sales').bulkAdd([sale('s1', 1, 300_000), sale('s2', 5, 200_000), sale('s3', 6, 999_000, { voidedAt: at(6) })]);
    await old
      .table('creditPayments')
      .add({ id: 'p1', customerId: 'c1', amountCents: 100_000, method: 'cash', createdAt: at(7), updatedAt: at(7) });
    old.close();

    const upgraded = new CaixaDB(name);
    try {
      expect(await upgraded.sales.count()).toBe(3);
      expect(await upgraded.accounts.get('c1')).toEqual({
        customerId: 'c1',
        totalCreditCents: 500_000,
        totalPaidCents: 100_000,
        open: [
          { saleId: 's1', createdAt: at(1), dueDate: '2026-11-16', remainingCents: 200_000 },
          { saleId: 's2', createdAt: at(5), dueDate: '2026-11-20', remainingCents: 200_000 },
        ],
      });
      await expectAccountsMatchFacts(new Store(upgraded, () => clock));
    } finally {
      await upgraded.delete();
    }
  });
});
