import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { addToCart } from '../domain/cart';
import { creditStatus } from '../domain/credit';

let db: CaixaDB;
let store: Store;
let n = 0;

beforeEach(async () => {
  db = new CaixaDB(`test-${n++}`);
  store = new Store(db);
});
afterEach(async () => {
  await db.delete();
});

const code = (e: unknown) => (e instanceof DomainError ? e.code : String(e));

describe('Store: products and stock', () => {
  it('creates a product with initial stock, recorded as a movement and audited', async () => {
    const p = await store.products.create({ name: ' Arroz 1 kg ', priceCents: 120_000, minStock: 5 }, 20);
    expect(p.name).toBe('Arroz 1 kg');
    expect((await store.products.get(p.id))!.stock).toBe(20);
    expect(await store.products.movements(p.id)).toHaveLength(1);
    const audit = await store.auditLog.list();
    expect(audit.map((a) => a.entity)).toEqual(['product', 'stock_movement']);
  });

  it('rejects duplicate barcodes and invalid prices', async () => {
    await store.products.create({ name: 'A', priceCents: 100, minStock: 0, barcode: '123' });
    await expect(store.products.create({ name: 'B', priceCents: 100, minStock: 0, barcode: '123' })).rejects.toSatisfy(
      (e) => code(e) === 'duplicate_barcode',
    );
    await expect(store.products.create({ name: 'C', priceCents: 10.5, minStock: 0 })).rejects.toSatisfy((e) => code(e) === 'invalid_price');
  });

  it('records entries and adjustments (with mandatory reason)', async () => {
    const p = await store.products.create({ name: 'Óleo', priceCents: 185_000, minStock: 2 }, 10);
    await store.products.addEntry(p.id, 6);
    expect((await store.products.get(p.id))!.stock).toBe(16);
    await expect(store.products.adjust(p.id, 14, '')).rejects.toSatisfy((e) => code(e) === 'reason_required');
    await store.products.adjust(p.id, 14, 'Partido');
    expect((await store.products.get(p.id))!.stock).toBe(14);
    const mv = await store.products.movements(p.id);
    expect(mv.map((m) => m.delta).sort((a, b) => a - b)).toEqual([-2, 6, 10]);
    expect(mv.find((m) => m.type === 'adjustment')!.reason).toBe('Partido');
  });

  it('archives products without losing them', async () => {
    const p = await store.products.create({ name: 'Velho', priceCents: 1, minStock: 0, barcode: '9' });
    await store.products.archive(p.id);
    expect(await store.products.list()).toHaveLength(0);
    expect(await store.products.findByBarcode('9')).toBeUndefined();
    expect(await store.products.get(p.id)).toBeDefined();
  });
});

describe('Store: sales', () => {
  it('saves a 3-product sale, lowers stock and numbers sales sequentially', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    const b = await store.products.create({ name: 'B', priceCents: 25_050, minStock: 0 }, 10);
    const c = await store.products.create({ name: 'C', priceCents: 5_000, minStock: 0 }, 1);
    let cart = addToCart([], a, 2);
    cart = addToCart(cart, b);
    cart = addToCart(cart, c, 3);
    const sale = await store.sales.create({ cart, method: 'cash', cashReceivedCents: 100_000 });
    expect(sale.totalCents).toBe(20_000 + 25_050 + 15_000);
    expect(sale.number).toBe(1);
    expect((await store.products.get(a.id))!.stock).toBe(8);
    expect((await store.products.get(c.id))!.stock).toBe(-2); // selling is never blocked
    const second = await store.sales.create({ cart: addToCart([], a), method: 'kwik', paymentRef: 'T-1' });
    expect(second.number).toBe(2);
  });

  it('requires an existing customer for fiado and rolls back everything on failure', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    await expect(store.sales.create({ cart: addToCart([], a), method: 'credit' })).rejects.toSatisfy(
      (e) => code(e) === 'customer_required',
    );
    expect(await store.sales.list()).toHaveLength(0);
    expect((await store.products.get(a.id))!.stock).toBe(10);
  });

  it('rejects empty carts', async () => {
    await expect(store.sales.create({ cart: [], method: 'cash' })).rejects.toSatisfy((e) => code(e) === 'empty_cart');
  });
});

describe('Store: fiado', () => {
  it('tracks balance through sales and partial/total payments', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 50_000, minStock: 0 }, 10);
    const maria = await store.customers.create('Maria Exemplo', '923000000');
    await store.sales.create({ cart: addToCart([], a, 3), method: 'credit', customerId: maria.id });
    await store.credit.addPayment(maria.id, 60_000, 'cash');
    const status = creditStatus(maria.id, await store.sales.list(), await store.credit.payments(), new Date());
    expect(status.balanceCents).toBe(90_000);
    await expect(store.credit.addPayment(maria.id, 90_001, 'cash')).rejects.toSatisfy((e) => code(e) === 'too_much');
    await store.credit.addPayment(maria.id, 90_000, 'multicaixa_express');
    const after = creditStatus(maria.id, await store.sales.list(), await store.credit.payments(), new Date());
    expect(after.balanceCents).toBe(0);
  });
});

describe('Store: settings', () => {
  it('returns defaults and saves with audit', async () => {
    expect((await store.settings.get()).storeName).toBe('A minha loja');
    await store.settings.save({ storeName: 'Loja X', phone: ' ', nif: '5000000000' });
    const s = await store.settings.get();
    expect(s.storeName).toBe('Loja X');
    expect(s.phone).toBeUndefined();
    expect((await store.auditLog.list()).at(-1)!.entity).toBe('settings');
  });
});

describe('Store: voiding sales', () => {
  it('restores stock, keeps the sale in history and audits the reason', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    const sale = await store.sales.create({ cart: addToCart([], a, 3), method: 'cash' });
    expect((await store.products.get(a.id))!.stock).toBe(7);
    await expect(store.sales.void(sale.id, ' ')).rejects.toSatisfy((e) => code(e) === 'reason_required');
    const voided = await store.sales.void(sale.id, 'Engano no registo');
    expect(voided.voidedAt).toBeDefined();
    expect(voided.voidReason).toBe('Engano no registo');
    expect((await store.products.get(a.id))!.stock).toBe(10);
    expect(await store.sales.list()).toHaveLength(1);
    const mv = await store.products.movements(a.id);
    expect(mv.find((m) => m.type === 'void')!.delta).toBe(3);
    expect((await store.auditLog.list()).some((x) => x.action === 'voided' && x.entityId === sale.id)).toBe(true);
    await expect(store.sales.void(sale.id, 'Outra vez')).rejects.toSatisfy((e) => code(e) === 'already_voided');
  });

  it('removes a voided fiado sale from what the customer owes', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    const c = await store.customers.create('Cliente Exemplo');
    const s1 = await store.sales.create({ cart: addToCart([], a, 2), method: 'credit', customerId: c.id });
    await store.sales.create({ cart: addToCart([], a, 1), method: 'credit', customerId: c.id });
    await store.sales.void(s1.id, 'Cliente desistiu');
    const status = creditStatus(c.id, await store.sales.list(), await store.credit.payments(), new Date());
    expect(status.balanceCents).toBe(10_000);
    await expect(store.credit.addPayment(c.id, 10_001, 'cash')).rejects.toSatisfy((e) => code(e) === 'too_much');
    await store.credit.addPayment(c.id, 10_000, 'cash');
  });

  it('lists the sales of a given period', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 100, minStock: 0 }, 10);
    await store.sales.create({ cart: addToCart([], a), method: 'cash' });
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    expect(await store.sales.between(from, to)).toHaveLength(1);
    expect(await store.sales.between(to, new Date(Date.now() + 120_000).toISOString())).toHaveLength(0);
  });
});

describe('Store: reminders', () => {
  it('remembers when a customer was last reminded', async () => {
    const c = await store.customers.create('Cliente Exemplo', '923000000');
    expect(c.lastRemindedAt).toBeUndefined();
    await store.customers.markReminded(c.id);
    expect((await store.customers.get(c.id))!.lastRemindedAt).toBeDefined();
  });
});

describe('Store: NIF with letters', () => {
  it('saves a NIF with letters and digits, normalised', async () => {
    await store.settings.save({ storeName: 'Loja', nif: ' 000 000 000-aa.000 ' });
    expect((await store.settings.get()).nif).toBe('000000000AA000');
    await expect(store.settings.save({ storeName: 'Loja', nif: '12AB#' })).rejects.toSatisfy((e) => code(e) === 'invalid_nif');
  });
});

describe('Store: payment terms', () => {
  it('every credit sale gets a due date: the one chosen, or the usual term', async () => {
    const now = new Date(2026, 10, 6, 10);
    const s = new Store(db, () => now);
    const a = await s.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    const c = await s.customers.create('Cliente Exemplo');
    const chosen = await s.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id, dueDate: '2026-11-30' });
    expect(chosen.dueDate).toBe('2026-11-30');
    const usual = await s.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id });
    expect(usual.dueDate).toBe('2026-11-21');
    await s.settings.save({ creditTermDays: 7 });
    expect((await s.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id })).dueDate).toBe('2026-11-13');
    const cash = await s.sales.create({ cart: addToCart([], a), method: 'cash' });
    expect(cash.dueDate).toBeUndefined();
  });

  it('refuses due dates in the past or malformed', async () => {
    const s = new Store(db, () => new Date(2026, 10, 6, 10));
    const a = await s.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    const c = await s.customers.create('Cliente Exemplo');
    for (const dueDate of ['2026-11-05', '06/12/2026', '2026-02-30']) {
      await expect(s.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id, dueDate })).rejects.toSatisfy(
        (e) => code(e) === 'invalid_due_date',
      );
    }
  });

  it('saving the shop details keeps the payment term (and vice versa)', async () => {
    await store.settings.save({ creditTermDays: 30 });
    await store.settings.save({ storeName: 'Loja', phone: '923000000', nif: '5000000000' });
    const s = await store.settings.get();
    expect(s.creditTermDays).toBe(30);
    await store.settings.save({ creditTermDays: 7 });
    expect((await store.settings.get()).storeName).toBe('Loja');
    await expect(store.settings.save({ creditTermDays: 0 })).rejects.toSatisfy((e) => code(e) === 'invalid_term');
  });
});

describe('database upgrade', () => {
  it('gives old credit sales (saved before due dates existed) the default term', async () => {
    const { default: Dexie } = await import('dexie');
    const name = `test-upgrade-${n++}`;
    const old = new Dexie(name);
    old.version(1).stores({ sales: 'id, createdAt, customerId, method, updatedAt', meta: 'key' });
    await old.table('sales').bulkAdd([
      { id: 's1', method: 'credit', customerId: 'c1', totalCents: 100, items: [], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '' },
      { id: 's2', method: 'cash', totalCents: 100, items: [], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '' },
    ]);
    old.close();
    const upgraded = new CaixaDB(name);
    expect((await upgraded.sales.get('s1'))!.dueDate).toBe('2026-11-16');
    expect((await upgraded.sales.get('s2'))!.dueDate).toBeUndefined();
    await upgraded.delete();
  });
});

describe('Store: recording operations', () => {
  it('keeps the payment reference for electronic payments only, and the phone id on every sale', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    const e = await store.sales.create({ cart: addToCart([], a), method: 'paypay', transactionRef: '  PP 123  456 ' });
    expect(e.transactionRef).toBe('PP 123 456');
    const cash = await store.sales.create({ cart: addToCart([], a), method: 'cash', transactionRef: 'x' });
    expect(cash.transactionRef).toBeUndefined();
    expect(e.deviceId).toBeDefined();
    expect(cash.deviceId).toBe(e.deviceId);
    const c = await store.customers.create('Cliente Exemplo');
    await store.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id });
    const p = await store.credit.addPayment(c.id, 5_000, 'multicaixa_express', 'MCX-998877');
    expect(p.transactionRef).toBe('MCX-998877');
    expect(p.deviceId).toBe(e.deviceId);
  });
});

describe('Store: owner code', () => {
  it('sets, verifies, changes (with the current code) and removes it, auditing each step', async () => {
    expect(await store.security.hasPin()).toBe(false);
    expect(await store.security.verify('')).toBe(true);
    await expect(store.security.setPin('12')).rejects.toSatisfy((e) => code(e) === 'invalid_pin');
    await store.security.setPin('2580');
    expect(await store.security.hasPin()).toBe(true);
    expect(await store.security.verify('2580')).toBe(true);
    expect(await store.security.verify('0000')).toBe(false);
    await expect(store.security.setPin('1111', '0000')).rejects.toSatisfy((e) => code(e) === 'wrong_pin');
    await store.security.setPin('1111', '2580');
    await expect(store.security.removePin('2580')).rejects.toSatisfy((e) => code(e) === 'wrong_pin');
    await store.security.removePin('1111');
    expect(await store.security.hasPin()).toBe(false);
    const pinAudits = (await store.auditLog.list()).filter((x) => x.entityId === 'owner_pin');
    expect(pinAudits.map((x) => (x.after as { pin: string }).pin)).toEqual(['set', 'set', 'removed']);
    const raw = JSON.stringify(await db.meta.toArray());
    expect(raw).not.toContain('2580');
  });

  it("never travels in a backup, and restoring a backup keeps this phone's code", async () => {
    const { exportBackup, importBackup } = await import('./backup');
    await store.security.setPin('2580');
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    expect(JSON.stringify(backup)).not.toContain('ownerPin');
    await importBackup(db, backup);
    expect(await store.security.verify('2580')).toBe(true);
  });
});

describe('Store: checking the numbers', () => {
  it('finds a stock that no longer matches its movements and puts it right', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 10_000, minStock: 0 }, 10);
    await store.sales.create({ cart: addToCart([], a, 3), method: 'cash' });
    expect(await store.integrity.check()).toEqual([]);
    await db.products.update(a.id, { stock: 50 }); // e.g. a bug or a bad restore
    expect(await store.integrity.check()).toEqual([{ kind: 'stock_mismatch', productId: a.id, name: 'A', recorded: 50, computed: 7 }]);
    await store.integrity.fixStock(a.id);
    expect((await store.products.get(a.id))!.stock).toBe(7);
    expect(await store.integrity.check()).toEqual([]);
  });
});
