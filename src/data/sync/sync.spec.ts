import { afterEach, describe, expect, it } from 'vitest';
import { describeAudit } from '../../domain/audit-describe';
import { addToCart } from '../../domain/cart';
import { exportBackup, importBackup } from '../backup';
import { CaixaDB, DB_NAMES, TABLES } from '../db';
import { Store } from '../store';
import { acknowledge, applyBatch, buildBatch, pendingChanges, snapshotBatch, startTracking, stopTracking, type SyncBatch } from './batch';
import { PHONE_TABLES, SYNC_TABLES } from './tables';

let n = 0;
const opened: CaixaDB[] = [];
const newDb = (name = `test-sync-${n++}`) => {
  const db = new CaixaDB(name);
  opened.push(db);
  return db;
};
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

const at = (h: number, m: number) => new Date(2026, 10, 13, h, m);
const names = { product: () => undefined, customer: () => undefined, supplier: () => undefined, staff: () => undefined };

/** One phone of the shop: its database, its Store and its own clock. */
function phone() {
  const db = newDb();
  const clock = { now: at(9, 0) };
  return { db, clock, store: new Store(db, () => clock.now) };
}

/** What a phone sends goes through the «server» (here, a copy as it would travel) to the other phone. */
async function send(from: CaixaDB, to: CaixaDB, when: Date) {
  const rows = await pendingChanges(from);
  const batch = JSON.parse(JSON.stringify(await buildBatch(from, rows))) as SyncBatch;
  const result = await applyBatch(to, batch, when);
  await acknowledge(from, rows);
  return result;
}

/** Everything shared, as a phone holds it (its own notes about replaced versions apart). */
async function shared(db: CaixaDB) {
  const out: Record<string, unknown[]> = {};
  for (const t of Object.keys(SYNC_TABLES)) {
    const rows = (await db.table(t).toArray()) as { id: string; action?: string }[];
    out[t] = rows.filter((r) => r.action !== 'sync_overwritten').sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return out;
}

describe('what is shared between phones', () => {
  it('every table is either shared or kept on the phone, and everything shared is in the backups', () => {
    const db = newDb();
    const all = db.tables.map((t) => t.name).sort();
    expect([...Object.keys(SYNC_TABLES), ...PHONE_TABLES].sort()).toEqual(all);
    for (const t of Object.keys(SYNC_TABLES)) expect(TABLES).toContain(t);
  });
});

describe('the queue of changes', () => {
  it('records nothing until the shop syncs, and never in the demo', async () => {
    const { db, store } = phone();
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 0 }, 10);
    await store.sales.create({ cart: addToCart([], rice, 2), method: 'cash' });
    expect(await db.changes.count()).toBe(0);
    await expect(startTracking(newDb(DB_NAMES.demo))).rejects.toThrow();
  });

  it('once on, notes every record a sale changes (not what is worked out, nor the phone’s own settings)', async () => {
    const { db, store } = phone();
    await startTracking(db);
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 0 }, 10);
    const joana = await store.customers.create('Joana');
    await db.changes.clear();
    const sale = await store.sales.create({ cart: addToCart([], rice, 2), method: 'credit', customerId: joana.id });
    const tables = new Set((await pendingChanges(db)).map((r) => r.t));
    expect([...tables].sort()).toEqual(['audit', 'products', 'sales', 'stockMovements']);
    expect((await pendingChanges(db)).some((r) => r.t === 'sales' && r.id === sale.id)).toBe(true);
    // Turning it off empties the queue.
    await stopTracking(db);
    expect(await db.changes.count()).toBe(0);
  });

  it('what the server took leaves the queue, unless it changed again meanwhile', async () => {
    const { db, store } = phone();
    await startTracking(db);
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 0 });
    const rows = await pendingChanges(db);
    // While sending, the product changes again.
    await store.products.update(rice.id, { name: 'Arroz 1 kg', priceCents: 120_000, minStock: 5 });
    expect(await acknowledge(db, rows)).toBe(rows.length - 1);
    expect((await pendingChanges(db)).map((r) => r.id)).toContain(rice.id);
  });

  it('a restored backup is sent again in full', async () => {
    const { db, store } = phone();
    await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 0 });
    const copy = await exportBackup(db);
    await startTracking(db);
    await importBackup(db, copy);
    const batch = await buildBatch(db, await pendingChanges(db));
    expect(batch.records.products?.map((p) => p.name)).toEqual(['Arroz 1 kg']);
  });
});

describe('two phones of the same shop', () => {
  it('each works on its own, they share their changes, and both end up with the same shop', async () => {
    const a = phone();
    const b = phone();
    // Phone A starts the shop; phone B joins it and gets everything (the first sync).
    await startTracking(a.db);
    const rice = await a.store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 5 }, 20);
    const oil = await a.store.products.create({ name: 'Óleo 1 L', priceCents: 185_000, minStock: 2 }, 10);
    const joana = await a.store.customers.create('Joana Exemplo');
    await startTracking(b.db);
    await applyBatch(b.db, await snapshotBatch(a.db), at(9, 1));
    await acknowledge(a.db, await pendingChanges(a.db));
    expect(await pendingChanges(b.db)).toEqual([]);

    // Offline, each on its own.
    a.clock.now = at(10, 0);
    await a.store.sales.create({ cart: addToCart([], rice, 2), method: 'cash' });
    const onCredit = await a.store.sales.create({ cart: addToCart([], oil), method: 'credit', customerId: joana.id });
    b.clock.now = at(10, 5);
    await b.store.products.update(rice.id, { name: 'Arroz 1 kg', priceCents: 130_000, minStock: 5 });
    await b.store.sales.create({ cart: addToCart([], { ...rice, priceCents: 130_000 }, 3), method: 'cash' });
    b.clock.now = at(10, 7);
    await b.store.products.update(oil.id, { name: 'Óleo de cozinha 1 L', priceCents: 185_000, minStock: 2 });
    a.clock.now = at(10, 10);
    await a.store.products.update(oil.id, { name: 'Óleo vegetal 1 L', priceCents: 185_000, minStock: 2 });

    // They share their changes.
    await send(a.db, b.db, at(11, 0));
    await send(b.db, a.db, at(11, 0));
    expect(await pendingChanges(a.db)).toEqual([]);
    expect(await pendingChanges(b.db)).toEqual([]);

    // The same shop on both phones.
    expect(await shared(a.db)).toEqual(await shared(b.db));
    for (const s of [a.store, b.store]) {
      const products = await s.products.list();
      // B's price (A never changed it); A's name for the oil (the most recent edit).
      expect(products.find((p) => p.id === rice.id)).toMatchObject({ priceCents: 130_000, stock: 15 });
      expect(products.find((p) => p.id === oil.id)).toMatchObject({ name: 'Óleo vegetal 1 L', stock: 9 });
      expect((await s.credit.book(at(11, 0))).find((x) => x.customer.id === joana.id)!.balanceCents).toBe(185_000);
      // Stock adds up; each phone numbered its own sales (n.º 1 on both is fine).
      expect(await s.integrity.check()).toEqual([]);
    }
    // B's name for the oil lost: B's activity log says so.
    const note = (await b.store.auditLog.list()).find((e) => e.action === 'sync_overwritten')!;
    expect(describeAudit(note, names)?.text).toBe(
      'Mudado noutro telemóvel da loja — Óleo vegetal 1 L: nome «Óleo de cozinha 1 L» → «Óleo vegetal 1 L»',
    );

    // A void made on B reaches A: the debt and the stock go back there too.
    b.clock.now = at(12, 0);
    await b.store.sales.void(onCredit.id, 'Engano no cliente');
    await send(b.db, a.db, at(12, 5));
    expect((await a.store.sales.get(onCredit.id))!.voidReason).toBe('Engano no cliente');
    expect((await a.store.credit.book(at(12, 5))).find((x) => x.customer.id === joana.id)!.balanceCents).toBe(0);
    expect((await a.store.products.get(oil.id))!.stock).toBe(10);
    await send(a.db, b.db, at(12, 6));
    expect(await shared(a.db)).toEqual(await shared(b.db));
  });
});
