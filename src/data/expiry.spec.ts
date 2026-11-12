import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { exportBackup } from './backup';
import { describeAudit } from '../domain/audit-describe';
import { batchesOnShelf } from '../domain/expiry';

let db: CaixaDB;
let store: Store;
let n = 0;
let clock = 0;
beforeEach(() => {
  db = new CaixaDB(`test-expiry-${n++}`);
  clock = new Date(2026, 10, 12, 15, 0).getTime();
  // A moving clock: each record a second after the one before (batches keep their order).
  store = new Store(db, () => new Date((clock += 1000)));
});
afterEach(async () => {
  await db.delete();
});

const code = (e: unknown) => (e instanceof DomainError ? e.code : String(e));
const milkInput = { name: 'Leite UHT 1 L', priceCents: 120_000, minStock: 2, tracksExpiry: true };

describe('expiry dates', () => {
  it('stock coming in makes batches for products that follow their dates, never for the others', async () => {
    const milk = await store.products.create(milkInput, 6, '2026-12-01');
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 2 }, 10);
    await store.products.addEntry(milk.id, 12, '2027-02-01');
    await store.products.addEntry(milk.id, 3); // no date
    await store.products.addEntry(rice.id, 5, '2027-02-01');
    expect((await store.batches.all()).map((b) => [b.quantity, b.expiresOn ?? null, b.source])).toEqual([
      [6, '2026-12-01', 'entry'],
      [12, '2027-02-01', 'entry'],
      [3, null, 'entry'],
    ]);
    const product = (await store.products.get(milk.id))!;
    expect(batchesOnShelf(product.stock, await store.batches.forProduct(milk.id))).toEqual([
      { quantity: 6, expiresOn: '2026-12-01' },
      { quantity: 12, expiresOn: '2027-02-01' },
      { quantity: 3 },
    ]);
    await expect(store.products.addEntry(milk.id, 1, '2026-02-30')).rejects.toSatisfy((e) => code(e) === 'invalid_date');
  });

  it('purchases carry the date of each line; voiding a purchase voids its batches', async () => {
    const milk = await store.products.create(milkInput, 0);
    const purchase = await store.purchases.create({
      lines: [{ productId: milk.id, quantity: 24, unitCostCents: 90_000, expiresOn: '2027-01-15' }],
      payment: 'cash',
    });
    expect(purchase.items[0]!.expiresOn).toBe('2027-01-15');
    expect((await store.batches.all()).map((b) => [b.quantity, b.expiresOn, b.purchaseId])).toEqual([[24, '2027-01-15', purchase.id]]);
    await store.purchases.void(purchase.id, 'Engano no registo');
    expect(await store.batches.all()).toEqual([]);
  });

  it('dates for stock already on the shelf: never more than the stock, a real date, and removable', async () => {
    const milk = await store.products.update((await store.products.create({ ...milkInput, tracksExpiry: false }, 10)).id, milkInput);
    expect(milk.tracksExpiry).toBe(true);
    await expect(store.batches.addShelf(milk.id, 11, '2026-12-01')).rejects.toSatisfy((e) => code(e) === 'invalid_quantity');
    await expect(store.batches.addShelf(milk.id, 4, '')).rejects.toSatisfy((e) => code(e) === 'invalid_date');
    const b = await store.batches.addShelf(milk.id, 4, '2026-11-20');
    expect(batchesOnShelf(10, await store.batches.forProduct(milk.id))).toEqual([
      { quantity: 4, expiresOn: '2026-11-20' },
      { quantity: 6 },
    ]);
    await store.batches.remove(b.id);
    expect(await store.batches.all()).toEqual([]);
    const names = { product: () => undefined, customer: () => undefined };
    const log = (await store.auditLog.list()).map((e) => describeAudit(e, names)?.text);
    expect(log).toContain('Validade indicada — Leite UHT 1 L: 4, validade 20/11/2026');
    expect(log).toContain('Validade retirada — Leite UHT 1 L: 4, validade 20/11/2026');
    expect(log).toContain('Leite UHT 1 L: passou a controlar validades');
    // A product that does not follow dates cannot get one.
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 2 }, 10);
    await expect(store.batches.addShelf(rice.id, 1, '2026-12-01')).rejects.toSatisfy((e) => code(e) === 'not_tracked');
  });

  it('travel in the backups', async () => {
    await store.products.create(milkInput, 6, '2026-12-01');
    expect((await exportBackup(db)).data.batches).toHaveLength(1);
  });
});
