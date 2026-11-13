import Dexie from 'dexie';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart } from '../domain/cart';
import { creditAccounts, dueDateOf } from '../domain/credit';
import type { CreditPayment, Sale } from '../domain/types';
import { CaixaDB } from './db';
import { seedDemo } from './demo-seed';
import { Store } from './store';

/**
 * Every version of the database the app has had, as published: the tables each one added or
 * changed (version N holds what was declared up to N). Never change these lines: they are what
 * the shops' phones may hold. A new version in db.ts means one more line here, with the version
 * before it (the test below checks that).
 */
const RELEASED: [number, Record<string, string>][] = [
  [
    1,
    {
      products: 'id, name, barcode, updatedAt',
      customers: 'id, name, updatedAt',
      sales: 'id, createdAt, customerId, method, updatedAt',
      creditPayments: 'id, customerId, createdAt, updatedAt',
      stockMovements: 'id, productId, createdAt',
      audit: 'id, [entity+entityId], createdAt',
      settings: 'id',
      meta: 'key',
    },
  ],
  [2, { sales: 'id, createdAt, customerId, method, updatedAt' }],
  [3, { expenses: 'id, createdAt, category, updatedAt', cashCloses: 'id, day, createdAt' }],
  [
    4,
    { suppliers: 'id, name, updatedAt', purchases: 'id, createdAt, supplierId, updatedAt', supplierPayments: 'id, supplierId, createdAt' },
  ],
  [5, { products: 'id, name, barcode, category, updatedAt' }],
  [6, { inssContributions: 'id, month, createdAt' }],
  [7, { safety: 'id' }],
  [8, { returns: 'id, saleId, createdAt' }],
  [9, { sales: 'id, createdAt, customerId, method, updatedAt, pendingSince' }],
  [10, { batches: 'id, productId, createdAt' }],
  [11, { staff: 'id, name', staffPins: 'id' }],
  [12, { accounts: 'customerId' }],
];

const now = new Date(2026, 10, 13, 15, 0);
type Rows = Record<string, { id?: string; customerId?: string; key?: string }[]>;
const keyOf = (r: { id?: string; customerId?: string; key?: string }) => r.id ?? r.customerId ?? r.key ?? '';
const sorted = <T extends { id?: string; customerId?: string; key?: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));

/**
 * A full shop, as the app makes it: two weeks of the demo grocery (sales in cash, electronic, on
 * credit and waiting for confirmation, payments, purchases, expenses, closes, INSS, expiry dates),
 * plus a void, a return and an employee.
 */
let shop: Rows;
beforeAll(async () => {
  const db = new CaixaDB('test-upgrade-shop');
  await seedDemo(db, now, 'grocery');
  const store = new Store(db, () => now);
  const sales = await db.sales.toArray();
  const cash = sales.filter((s) => s.method === 'cash' && !s.voidedAt);
  await store.sales.void(cash[0]!.id, 'Engano no registo');
  const line = cash[1]!.items[0]!;
  await store.returns.create({
    saleId: cash[1]!.id,
    lines: [{ productId: line.productId, quantity: 1 }],
    refund: 'cash',
    restock: true,
    reason: 'Embalagem rasgada',
  });
  const at = now.toISOString();
  await db.staff.add({ id: 'staff-1', name: 'Maria Exemplo', role: 'seller', canCredit: false, createdAt: at, updatedAt: at });
  await db.staffPins.add({ id: 'staff-1', salt: 'c2Fs', hash: 'aGFzaA' });
  shop = Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, (await t.toArray()) as Rows[string]])));
  expect(await store.integrity.check()).toEqual([]);
  await db.delete();
});

/** What a phone on version n holds: the shop's records in the tables that version had. */
async function phoneOnVersion(n: number, name: string): Promise<Rows> {
  const old = new Dexie(name);
  for (const [v, stores] of RELEASED) if (v <= n) old.version(v).stores(stores);
  await old.open();
  const held: Rows = {};
  for (const table of old.tables) {
    let rows = shop[table.name] ?? [];
    // Before version 2, sales on credit had no due date.
    if (n < 2 && table.name === 'sales') rows = rows.map((s) => ({ ...s, dueDate: undefined }));
    held[table.name] = rows;
    await table.bulkAdd(rows);
  }
  old.close();
  return held;
}

describe('updating the app never loses a shop’s data', () => {
  afterAll(() => Dexie.delete('test-upgrade-shop'));

  it('the list of published versions is complete', () => {
    expect(new CaixaDB('test-upgrade-versions').verno).toBe(RELEASED.length + 1);
  });

  it.each(RELEASED.map(([v]) => v))('from version %i: every record is kept, the numbers add up and the app keeps working', async (n) => {
    const name = `test-upgrade-v${n}`;
    const held = await phoneOnVersion(n, name);
    const db = new CaixaDB(name);
    await db.open();
    expect(db.verno).toBe(RELEASED.length + 1);

    // Every record of every table is still there, as it was.
    for (const [table, rows] of Object.entries(held)) {
      const now13 = sorted((await db.table(table).toArray()) as Rows[string]);
      if (n < 2 && table === 'sales') {
        // …except that each sale on credit now has the usual term, counted from its day.
        for (const s of now13 as unknown as Sale[]) {
          if (s.method === 'credit') expect(s.dueDate).toBe(dueDateOf({ ...s, dueDate: undefined }));
        }
        const withoutDue = now13.map((s) => ({ ...s, dueDate: undefined }));
        expect(withoutDue, table).toEqual(sorted(rows));
      } else {
        expect(now13, table).toEqual(sorted(rows));
      }
    }
    // The tables that came later exist (empty, or built from the facts).
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(shop).sort());
    const credit = (await db.sales.where('method').equals('credit').toArray()) as Sale[];
    const payments = (await db.creditPayments.toArray()) as CreditPayment[];
    expect(sorted(await db.accounts.toArray())).toEqual(sorted(creditAccounts(credit, payments)));
    // An index added later finds the records that were already there.
    expect(await db.sales.where('pendingSince').above('').count()).toBe((shop.sales as Sale[]).filter((s) => s.pendingSince).length);
    expect(await db.changes.count()).toBe(0);

    // The numbers add up, and the shop sells as before.
    const store = new Store(db, () => now);
    expect(await store.integrity.check()).toEqual([]);
    const rice = (await store.products.list()).find((p) => p.name === 'Arroz 1 kg')!;
    const sale = await store.sales.create({ cart: addToCart([], rice, 2), method: 'cash' });
    expect(sale.number).toBeGreaterThan(1);
    expect((await store.products.get(rice.id))!.stock).toBe(rice.stock - 2);
    expect(await store.integrity.check()).toEqual([]);
    expect(await db.changes.count()).toBe(0);
    await db.delete();
  });
});
