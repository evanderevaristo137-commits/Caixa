import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { addToCart, setWeightLine } from '../domain/cart';
import { creditStatus } from '../domain/credit';
import { summariseOutflows } from '../domain/cash';
import { parseCsv, planImport } from '../domain/import-products';

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

  it('keeps an optional cost price, snapshotted on each sale line', async () => {
    const p = await store.products.create({ name: 'Bolacha', priceCents: 50_000, costCents: 35_000, minStock: 0 }, 10);
    expect(p.costCents).toBe(35_000);
    await expect(store.products.create({ name: 'X', priceCents: 100, costCents: -1, minStock: 0 })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_cost',
    );
    const sale = await store.sales.create({ cart: addToCart([], p, 2), method: 'cash' });
    expect(sale.items[0]!.unitCostCents).toBe(35_000);
    // A new cost does not change past sales; clearing it leaves future lines without cost.
    await store.products.update(p.id, { name: 'Bolacha', priceCents: 50_000, costCents: 40_000, minStock: 0 });
    expect((await store.sales.get(sale.id))!.items[0]!.unitCostCents).toBe(35_000);
    await store.products.update(p.id, { name: 'Bolacha', priceCents: 50_000, costCents: undefined, minStock: 0 });
    expect((await store.products.get(p.id))!.costCents).toBeUndefined();
    const later = await store.sales.create({ cart: addToCart([], (await store.products.get(p.id))!, 1), method: 'cash' });
    expect(later.items[0]!.unitCostCents).toBeUndefined();
    // Updating without the field keeps the cost.
    await store.products.update(p.id, { name: 'Bolacha', priceCents: 50_000, costCents: 30_000, minStock: 0 });
    await store.products.update(p.id, { name: 'Bolacha doce', priceCents: 50_000, minStock: 0 });
    expect((await store.products.get(p.id))!.costCents).toBe(30_000);
  });

  it('makes in-store barcodes that are valid, unique and never reused', async () => {
    await store.products.create({ name: 'Já tem', priceCents: 100, minStock: 0, barcode: '2000000000015' });
    const first = await store.products.nextInternalBarcode();
    expect(first).toBe('2000000000022'); // number 1 was taken, so it skips to 2
    const second = await store.products.nextInternalBarcode();
    expect(second).toBe('2000000000039');
    const a = await store.products.create({ name: 'A', priceCents: 100, minStock: 0 });
    const b = await store.products.create({ name: 'B', priceCents: 100, minStock: 0, barcode: '4006381333931' });
    expect(await store.products.assignInternalBarcodes([a.id, b.id])).toBe(1);
    expect((await store.products.get(a.id))!.barcode).toBe('2000000000046');
    expect((await store.products.get(b.id))!.barcode).toBe('4006381333931');
    expect((await store.products.findByBarcode('2000000000046'))!.name).toBe('A');
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

describe('Store: data for certified invoicing (optional)', () => {
  it('products keep unit, IVA and exemption; invalid rates are refused', async () => {
    const p = await store.products.create({ name: 'Óleo', priceCents: 185_000, minStock: 0, unit: ' L ', taxRateBp: 1400 });
    expect(p).toMatchObject({ unit: 'L', taxRateBp: 1400 });
    await expect(store.products.create({ name: 'X', priceCents: 1, minStock: 0, taxRateBp: 10_001 })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_tax',
    );
  });

  it('each sale line keeps the invoicing data of that day (product rate, or the shop default)', async () => {
    await store.settings.save({ defaultTaxRateBp: 700, address: 'Rua Exemplo', vatRegime: 'simplified' });
    const own = await store.products.create({ name: 'Óleo', priceCents: 100, minStock: 0, taxRateBp: 1400, barcode: '2000000000017' }, 5);
    const usual = await store.products.create({ name: 'Pão', priceCents: 100, minStock: 0, unit: 'un' }, 5);
    const sale = await store.sales.create({ cart: addToCart(addToCart([], own), usual), method: 'cash' });
    expect(sale.items.map((i) => [i.name, i.taxRateBp, i.barcode, i.unit])).toEqual([
      ['Óleo', 1400, '2000000000017', undefined],
      ['Pão', 700, undefined, 'un'],
    ]);
    await store.products.update(own.id, { name: 'Óleo', priceCents: 100, minStock: 0, taxRateBp: 500 });
    expect((await store.sales.get(sale.id))!.items[0]!.taxRateBp).toBe(1400);
    expect(await store.settings.get()).toMatchObject({ address: 'Rua Exemplo', vatRegime: 'simplified', defaultTaxRateBp: 700 });
  });

  it('customers can get a NIF (letters allowed) without touching other fields', async () => {
    const c = await store.customers.create('Empresa Exemplo', '923000000');
    await store.customers.update(c.id, { nif: '000000000aa000' });
    expect(await store.customers.get(c.id)).toMatchObject({ name: 'Empresa Exemplo', phone: '923000000', nif: '000000000AA000' });
    await expect(store.customers.update(c.id, { nif: '12#' })).rejects.toSatisfy((e) => code(e) === 'invalid_nif');
  });
});

describe('Store: credit limit', () => {
  it('refuses a credit sale over the limit unless explicitly allowed, and records the override', async () => {
    await store.settings.save({ creditLimitCents: 1_000_000 });
    const a = await store.products.create({ name: 'A', priceCents: 400_000, minStock: 0 }, 10);
    const c = await store.customers.create('Cliente Exemplo');
    await store.sales.create({ cart: addToCart([], a, 2), method: 'credit', customerId: c.id }); // owes 8.000 Kz
    await expect(store.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id })).rejects.toSatisfy(
      (e) => code(e) === 'credit_limit',
    );
    expect(await store.sales.list()).toHaveLength(1);
    expect((await store.products.get(a.id))!.stock).toBe(8);
    const over = await store.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id, allowOverLimit: true });
    expect(over.creditLimitOverride).toEqual({ limitCents: 1_000_000, balanceBeforeCents: 800_000 });
    // Cash sales are never limited.
    await store.sales.create({ cart: addToCart([], a), method: 'cash' });
  });

  it("a customer's own limit wins; removing it brings back the shop's; 0 = no limit", async () => {
    const a = await store.products.create({ name: 'A', priceCents: 400_000, minStock: 0 }, 10);
    const c = await store.customers.create('Cliente de confiança');
    await store.settings.save({ creditLimitCents: 300_000 });
    await store.customers.update(c.id, { creditLimitCents: 2_000_000 });
    await store.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id });
    await store.customers.update(c.id, { creditLimitCents: null });
    await expect(store.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id })).rejects.toSatisfy(
      (e) => code(e) === 'credit_limit',
    );
    await store.settings.save({ creditLimitCents: 0 });
    expect((await store.settings.get()).creditLimitCents).toBeUndefined();
    await store.sales.create({ cart: addToCart([], a), method: 'credit', customerId: c.id });
  });
});

describe('Store: products sold by weight', () => {
  it('sells grams, lowers the stock in grams and keeps the line total in whole kwanzas', async () => {
    const beans = await store.products.create({ name: 'Feijão a granel', priceCents: 140_000, minStock: 5_000, soldBy: 'weight' }, 20_000);
    expect(beans).toMatchObject({ soldBy: 'weight', stock: 20_000 });
    const sale = await store.sales.create({ cart: setWeightLine([], beans, 750), method: 'cash' });
    expect(sale.items[0]).toMatchObject({ quantity: 750, soldBy: 'weight', lineTotalCents: 105_000 });
    expect((await store.products.get(beans.id))!.stock).toBe(19_250);
    const byAmount = await store.sales.create({ cart: setWeightLine([], beans, 357, 50_000), method: 'cash' });
    expect(byAmount.totalCents).toBe(50_000);
    expect(await store.integrity.check()).toEqual([]);
  });

  it('a stale cart can never sell a weighed product as units (or the other way round)', async () => {
    const beans = await store.products.create({ name: 'Feijão a granel', priceCents: 140_000, minStock: 0, soldBy: 'weight' }, 5_000);
    await expect(store.sales.create({ cart: addToCart([], beans, 2), method: 'cash' })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_quantity',
    );
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 0 }, 5);
    await expect(store.sales.create({ cart: setWeightLine([], rice, 500), method: 'cash' })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_quantity',
    );
  });

  it('exports kilos with a decimal comma', async () => {
    const { productsCsv, salesCsv } = await import('./backup');
    const beans = await store.products.create({ name: 'Feijão a granel', priceCents: 140_000, minStock: 5_000, soldBy: 'weight' }, 12_500);
    await store.sales.create({ cart: setWeightLine([], beans, 750), method: 'cash' });
    expect(await productsCsv(db)).toContain('Feijão a granel;;;kg;1400,00;;11,75;5');
    expect(await salesCsv(db)).toContain(';Feijão a granel;0,75;kg;1400,00;1050,00;1050,00;Numerário;');
  });
});

describe('Store: money out and the end-of-day count', () => {
  const fixed = new Date(2026, 10, 8, 18, 0);
  // A clock that moves one second per call, so records keep their order.
  let tick = 0;
  const clock = () => new Date(fixed.getTime() + tick++ * 1000);

  it('records expenses and withdrawals, audited; voids need a reason', async () => {
    const st = new Store(db, clock);
    const e = await st.expenses.create({ category: 'transport', amountCents: 150_000, fromCash: true, note: ' Táxi ' });
    expect(e.note).toBe('Táxi');
    await expect(st.expenses.create({ category: 'transport', amountCents: 0, fromCash: true })).rejects.toSatisfy(
      (x) => code(x) === 'invalid_amount',
    );
    await expect(st.expenses.create({ category: 'bribe' as unknown as 'other', amountCents: 100, fromCash: true })).rejects.toSatisfy(
      (x) => code(x) === 'invalid_category',
    );
    await expect(st.expenses.void(e.id, '')).rejects.toSatisfy((x) => code(x) === 'reason_required');
    const v = await st.expenses.void(e.id, 'Engano no registo');
    expect(v.voidedAt).toBeDefined();
    await expect(st.expenses.void(e.id, 'Outra vez')).rejects.toSatisfy((x) => code(x) === 'already_voided');
    expect((await st.auditLog.list()).filter((a) => a.entity === 'expense').map((a) => a.action)).toEqual(['created', 'voided']);
  });

  it('expects float + cash sales + customers paying in cash − money out of the till, and records the count', async () => {
    const st = new Store(db, clock);
    const p = await st.products.create({ name: 'Arroz', priceCents: 120_000, minStock: 0 }, 50);
    const c = await st.customers.create('Joana');
    await st.sales.create({ cart: addToCart([], p, 10), method: 'cash' }); // 12.000
    await st.sales.create({ cart: addToCart([], p, 2), method: 'multicaixa_express' }); // not cash
    await st.sales.create({ cart: addToCart([], p, 5), method: 'credit', customerId: c.id }); // 6.000 on credit
    const voided = await st.sales.create({ cart: addToCart([], p, 1), method: 'cash' });
    await st.sales.void(voided.id, 'Engano');
    await st.credit.addPayment(c.id, 200_000, 'cash'); // 2.000 in cash
    await st.expenses.create({ category: 'transport', amountCents: 150_000, fromCash: true });
    await st.expenses.create({ category: 'rent', amountCents: 3_000_000, fromCash: false });
    await st.expenses.create({ category: 'withdrawal', amountCents: 500_000, fromCash: true });

    const d = await st.cash.drawer(fixed, 500_000);
    expect(d).toEqual({
      floatCents: 500_000,
      cashSalesCents: 1_200_000,
      cashCreditPaymentsCents: 200_000,
      cashOutCents: 650_000,
      cashPurchasesCents: 0,
      expectedCents: 1_250_000,
    });
    const close = await st.cash.close({ floatCents: 500_000, countedCents: 1_230_000, note: 'Notas velhas' });
    expect(close).toMatchObject({ day: '2026-11-08', expectedCents: 1_250_000, countedCents: 1_230_000, differenceCents: -20_000 });
    // Closing again (after more sales) keeps both; the last one counts.
    await st.sales.create({ cart: addToCart([], p, 1), method: 'cash' });
    const again = await st.cash.close({ floatCents: 500_000, countedCents: 1_370_000 });
    expect(again.differenceCents).toBe(0);
    expect((await st.cash.lastClose('2026-11-08'))!.id).toBe(again.id);
    await expect(st.cash.close({ floatCents: -1, countedCents: 0 })).rejects.toSatisfy((x) => code(x) === 'invalid_float');
  });

  it('keeps the contract minimum of digital payments (0 = no contract), audited', async () => {
    expect((await store.settings.save({ digitalMinShareBp: 4000 })).digitalMinShareBp).toBe(4000);
    expect((await store.settings.save({ digitalMinShareBp: 0 })).digitalMinShareBp).toBeUndefined();
    await expect(store.settings.save({ digitalMinShareBp: 10_001 })).rejects.toSatisfy((x) => code(x) === 'invalid_share');
    expect((await store.auditLog.list()).filter((a) => a.entity === 'settings')).toHaveLength(2);
  });

  it('keeps the usual float in the settings (0 = none)', async () => {
    expect((await store.settings.save({ cashFloatCents: 500_000 })).cashFloatCents).toBe(500_000);
    expect((await store.settings.save({ cashFloatCents: 0 })).cashFloatCents).toBeUndefined();
    await expect(store.settings.save({ cashFloatCents: 10.5 })).rejects.toSatisfy((x) => code(x) === 'invalid_float');
  });
});

describe('Store: suppliers and purchases', () => {
  const fixed = new Date(2026, 10, 8, 10, 0);
  let tick = 0;
  const clock = () => new Date(fixed.getTime() + tick++ * 1000);

  it('a purchase raises the stock, follows the last cost and remembers the usual supplier', async () => {
    const st = new Store(db, clock);
    const arroz = await st.products.create({ name: 'Arroz', priceCents: 120_000, costCents: 95_000, minStock: 5 }, 2);
    const feijao = await st.products.create({ name: 'Feijão a granel', priceCents: 140_000, minStock: 1_000, soldBy: 'weight' }, 500);
    const kikolo = await st.suppliers.create(' Armazém Kikolo ', '923 000 000');
    expect(kikolo.name).toBe('Armazém Kikolo');

    const pu = await st.purchases.create({
      supplierId: kikolo.id,
      lines: [
        { productId: arroz.id, quantity: 20, unitCostCents: 100_000 },
        { productId: feijao.id, quantity: 25_000, unitCostCents: 110_000 },
      ],
      payment: 'cash',
    });
    expect(pu.number).toBe(1);
    expect(pu.items.map((i) => i.lineTotalCents)).toEqual([2_000_000, 2_750_000]);
    expect(pu.totalCents).toBe(4_750_000);
    const a = (await st.products.get(arroz.id))!;
    expect(a.stock).toBe(22);
    expect(a.costCents).toBe(100_000);
    expect(a.supplierId).toBe(kikolo.id);
    expect((await st.products.get(feijao.id))!.stock).toBe(25_500);
    expect((await st.products.movements(arroz.id)).some((m) => m.type === 'purchase' && m.purchaseId === pu.id)).toBe(true);

    // Paid from the till: the cash expected that day goes down.
    expect((await st.cash.drawer(fixed, 0)).cashPurchasesCents).toBe(4_750_000);

    // Voiding brings the stock back down (the cost price stays).
    await expect(st.purchases.void(pu.id, '')).rejects.toSatisfy((e) => code(e) === 'reason_required');
    await st.purchases.void(pu.id, 'Mercadoria devolvida');
    expect((await st.products.get(arroz.id))!.stock).toBe(2);
    expect((await st.cash.drawer(fixed, 0)).cashPurchasesCents).toBe(0);
  });

  it('refuses invalid purchases; credit needs a supplier and a valid due date', async () => {
    const st = new Store(db, clock);
    const p = await st.products.create({ name: 'Óleo', priceCents: 185_000, minStock: 0 });
    const line = { productId: p.id, quantity: 12, unitCostCents: 155_000 };
    await expect(st.purchases.create({ lines: [], payment: 'cash' })).rejects.toSatisfy((e) => code(e) === 'empty_purchase');
    await expect(st.purchases.create({ lines: [{ ...line, quantity: 0 }], payment: 'cash' })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_quantity',
    );
    await expect(st.purchases.create({ lines: [{ ...line, unitCostCents: -1 }], payment: 'cash' })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_cost',
    );
    await expect(st.purchases.create({ lines: [line, line], payment: 'cash' })).rejects.toSatisfy((e) => code(e) === 'duplicate_line');
    await expect(st.purchases.create({ lines: [line], payment: 'credit' })).rejects.toSatisfy((e) => code(e) === 'supplier_required');
    const s = await st.suppliers.create('Armazém');
    await expect(st.purchases.create({ supplierId: s.id, lines: [line], payment: 'credit', dueDate: '2026-11-01' })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_due_date',
    );
    // Without a date, the usual 15 days.
    const pu = await st.purchases.create({ supplierId: s.id, lines: [line], payment: 'credit' });
    expect(pu.dueDate).toBe('2026-11-23');
    // Nothing was half-saved by the refused attempts.
    expect((await st.products.get(p.id))!.stock).toBe(12);
  });

  it('tracks what is owed to each supplier and refuses paying more than that', async () => {
    const st = new Store(db, clock);
    const p = await st.products.create({ name: 'Cerveja', priceCents: 50_000, minStock: 0 });
    const s = await st.suppliers.create('Distribuidora');
    await st.purchases.create({
      supplierId: s.id,
      lines: [{ productId: p.id, quantity: 48, unitCostCents: 37_000 }],
      payment: 'credit',
      dueDate: '2026-11-10',
    });
    expect(await st.payables.totalOwed(fixed)).toBe(1_776_000);
    await expect(st.supplierPayments.add(s.id, 2_000_000, true)).rejects.toSatisfy((e) => code(e) === 'too_much');
    await st.supplierPayments.add(s.id, 776_000, true);
    const [row] = await st.payables.book(fixed);
    expect(row).toMatchObject({ balanceCents: 1_000_000, dueState: 'soon', daysUntilDue: 2 });
    // A supplier paid from the till lowers the cash expected that day.
    expect((await st.cash.drawer(fixed, 0)).cashPurchasesCents).toBe(776_000);
    const log = (await st.auditLog.list()).map((a) => a.entity);
    expect(log).toContain('purchase');
    expect(log).toContain('supplier_payment');
  });
});

describe('Store: importing products from Excel', () => {
  const csv = (...lines: string[]) =>
    parseCsv(['Produto;Categoria;Código de barras;Vende-se por;Preço (Kz);Preço de custo (Kz);Stock;Stock mínimo', ...lines].join('\n'));

  it('creates and updates in one go, never touching the stock of existing products', async () => {
    const arroz = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, costCents: 90_000, minStock: 5 }, 20);
    const plan = planImport(
      csv('Bolacha Maria;Mercearia;;un;500;350;24;6', 'Feijão;Granel;;kg;1.400;;12,5;2', 'arroz 1 kg;Mercearia;;un;1.300;;99;'),
      await store.products.list(),
    );
    expect(plan.errors).toEqual([]);
    expect(await store.products.importMany(plan.rows)).toEqual({ created: 2, updated: 1 });

    const after = await store.products.get(arroz.id);
    expect(after).toMatchObject({ priceCents: 130_000, costCents: 90_000, stock: 20, minStock: 5, category: 'Mercearia' });
    const list = await store.products.list();
    expect(list.find((p) => p.name === 'Bolacha Maria')).toMatchObject({
      stock: 24,
      minStock: 6,
      costCents: 35_000,
      category: 'Mercearia',
    });
    expect(list.find((p) => p.name === 'Feijão')).toMatchObject({ soldBy: 'weight', stock: 12_500, minStock: 2_000, priceCents: 140_000 });
    const audit = await store.auditLog.list();
    expect(audit.find((a) => a.entityId === 'products_import')).toMatchObject({ action: 'imported', after: { created: 2, updated: 1 } });
  });

  it('saves nothing when one line fails', async () => {
    const plan = planImport(csv('Pão;;2000000000015;un;150;;;', 'Leite;;;un;600;;;'), []);
    // Someone gives that barcode to another product before the import is saved.
    await store.products.create({ name: 'Outro', priceCents: 100, minStock: 0, barcode: '2000000000015' });
    await expect(store.products.importMany(plan.rows)).rejects.toSatisfy((e) => code(e) === 'duplicate_barcode');
    expect((await store.products.list()).map((p) => p.name)).toEqual(['Outro']);
  });

  it('reads back its own "Produtos" export with nothing to change', async () => {
    const { productsCsv } = await import('./backup');
    await store.products.create(
      { name: 'Óleo', priceCents: 185_050, costCents: 155_000, minStock: 2, barcode: '0012345678905', category: 'Mercearia' },
      3,
    );
    await store.products.create({ name: 'Feijão', priceCents: 140_000, minStock: 2_000, soldBy: 'weight' }, 12_750);
    const plan = planImport(parseCsv(await productsCsv(db)), await store.products.list());
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => [r.currentName, r.action])).toEqual([
      ['Feijão', 'same'],
      ['Óleo', 'same'],
    ]);
    expect(plan.stockKept).toBe(0);
  });
});

describe('Store: categories', () => {
  it('keeps one spelling per category and can clear it', async () => {
    await store.products.create({ name: 'Água 1,5 L', priceCents: 30_000, minStock: 0, category: 'Bebidas' });
    const gasosa = await store.products.create({ name: 'Gasosa', priceCents: 40_000, minStock: 0, category: '  bebídas ' });
    expect(gasosa.category).toBe('Bebidas');
    const updated = await store.products.update(gasosa.id, { name: 'Gasosa', priceCents: 40_000, minStock: 0, category: '' });
    expect(updated.category).toBeUndefined();
    // Without the field, the category stays as it is.
    await store.products.update(gasosa.id, { name: 'Gasosa', priceCents: 40_000, minStock: 0, category: 'BEBIDAS' });
    expect((await store.products.update(gasosa.id, { name: 'Gasosa 330 ml', priceCents: 40_000, minStock: 0 })).category).toBe('Bebidas');
  });

  it('maps every product to its category, archived ones too', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 100, minStock: 0, category: 'Casa' });
    await store.products.create({ name: 'B', priceCents: 100, minStock: 0 });
    await store.products.archive(a.id);
    expect([...(await store.products.categoryMap())]).toEqual([[a.id, 'Casa']]);
  });

  it('upgrades a version 4 database without losing products', async () => {
    const { default: Dexie } = await import('dexie');
    const name = `test-upgrade-${n++}`;
    const old = new Dexie(name);
    old.version(4).stores({ products: 'id, name, barcode, updatedAt' });
    await old.table('products').bulkAdd([
      { id: 'p1', name: 'Sal', priceCents: 30_000, stock: 1, minStock: 0, category: 'Mercearia', createdAt: '', updatedAt: '' },
      { id: 'p2', name: 'Pão', priceCents: 15_000, stock: 1, minStock: 0, createdAt: '', updatedAt: '' },
    ]);
    old.close();
    const upgraded = new CaixaDB(name);
    expect(await upgraded.products.count()).toBe(2);
    expect(await new Store(upgraded).products.categoryMap()).toEqual(new Map([['p1', 'Mercearia']]));
    await upgraded.delete();
  });
});

describe('Store: stock count', () => {
  it('adjusts each counted product against what the app had when it was counted, in one go', async () => {
    const beer = await store.products.create({ name: 'Cerveja', priceCents: 50_000, minStock: 0 }, 60);
    const water = await store.products.create({ name: 'Água', priceCents: 30_000, minStock: 0 }, 40);
    const beans = await store.products.create({ name: 'Feijão', priceCents: 140_000, minStock: 0, soldBy: 'weight' }, 3_500);
    // Two beers sold after the beer was counted (55 on the shelf, 60 in the app at that moment).
    await store.sales.create({ cart: addToCart(addToCart([], beer), beer), method: 'cash' });
    const result = await store.products.applyCount([
      { productId: beer.id, counted: 55, expected: 60 },
      { productId: water.id, counted: 40, expected: 40 },
      { productId: beans.id, counted: 4_000, expected: 3_500 },
    ]);
    expect(result).toEqual({ counted: 3, adjusted: 2 });
    expect((await store.products.get(beer.id))!.stock).toBe(53);
    expect((await store.products.get(water.id))!.stock).toBe(40);
    expect((await store.products.get(beans.id))!.stock).toBe(4_000);
    const moves = await store.products.movements(beer.id);
    expect(moves.find((m) => m.type === 'adjustment')).toMatchObject({ delta: -5, reason: 'Contagem de stock' });
    const audit = await store.auditLog.list();
    expect(audit.find((a) => a.entityId === 'stock_count')).toMatchObject({ action: 'counted', after: { counted: 3, adjusted: 2 } });
  });

  it('saves nothing when a line is wrong', async () => {
    const a = await store.products.create({ name: 'A', priceCents: 100, minStock: 0 }, 5);
    await expect(
      store.products.applyCount([
        { productId: a.id, counted: 3, expected: 5 },
        { productId: 'gone', counted: 1, expected: 1 },
      ]),
    ).rejects.toSatisfy((e) => code(e) === 'not_found');
    await expect(store.products.applyCount([{ productId: a.id, counted: -1, expected: 5 }])).rejects.toSatisfy(
      (e) => code(e) === 'invalid_quantity',
    );
    expect((await store.products.get(a.id))!.stock).toBe(5);
  });
});

describe('Store: the owner retirement plan (INSS)', () => {
  const start = new Date(2026, 10, 11, 10, 0); // 11 November 2026
  let tick = 0;
  const clock = () => new Date(start.getTime() + tick++ * 1000);

  it('starts, changes and stops the plan, keeping the month it started', async () => {
    let now = start;
    const st = new Store(db, () => now);
    await st.settings.save({ storeName: 'Cantina Exemplo' });
    const started = await st.inss.savePlan({ wages: 1, modality: 'normal', birthYear: 1981, number: ' 0012345 ', monthsBefore: 0 });
    expect(started.inss).toEqual({ wages: 1, modality: 'normal', startMonth: '2026-11', birthYear: 1981, number: '0012345' });
    now = new Date(2027, 0, 5, 9, 0);
    const changed = await st.inss.savePlan({ wages: 2, modality: 'extended', monthsBefore: 24 });
    expect(changed.inss).toEqual({ wages: 2, modality: 'extended', startMonth: '2026-11', monthsBefore: 24 });
    await expect(st.inss.savePlan({ wages: 0, modality: 'normal' })).rejects.toSatisfy((e) => code(e) === 'invalid_wages');
    await expect(st.inss.savePlan({ wages: 1, modality: 'normal', birthYear: 2020 })).rejects.toSatisfy(
      (e) => code(e) === 'invalid_birth_year',
    );
    const stopped = await st.inss.savePlan(null);
    expect(stopped.inss).toBeUndefined();
    expect(stopped.storeName).toBe('Cantina Exemplo');
  });

  it('sets money aside (not an expense), uses it to pay, and undoes a payment cleanly', async () => {
    const st = new Store(db, clock);
    await expect(st.inss.pay({ month: '2026-10', amountCents: 800_000 })).rejects.toSatisfy((e) => code(e) === 'no_plan');
    await st.inss.savePlan({ wages: 1, modality: 'normal' });
    const firstSaving = await st.expenses.create({ category: 'inss', amountCents: 500_000, fromCash: true });
    await st.expenses.create({ category: 'inss', amountCents: 60_000, fromCash: false });
    expect(await st.inss.saved()).toBe(560_000);
    expect(summariseOutflows(await st.expenses.list())).toMatchObject({ expensesCents: 0, inssCents: 560_000, cashOutCents: 500_000 });

    // Not more than what is set aside.
    await expect(st.inss.pay({ month: '2026-10', amountCents: 800_000, fromSavedCents: 800_000 })).rejects.toSatisfy(
      (e) => code(e) === 'not_saved',
    );
    // October: 5.600 Kz from what was set aside and 2.400 Kz straight from the till.
    const paid = await st.inss.pay({
      month: '2026-10',
      amountCents: 800_000,
      receipt: ' REF 123 ',
      fromSavedCents: 560_000,
      fromCashCents: 240_000,
    });
    expect(paid).toMatchObject({
      month: '2026-10',
      amountCents: 800_000,
      baseCents: 10_000_000,
      paidOn: '2026-11-11',
      receipt: 'REF 123',
      savedUsedCents: 800_000,
    });
    expect(await st.inss.saved()).toBe(0);
    const fromTill = (await st.expenses.list()).find((e) => e.id === paid.expenseId)!;
    expect(fromTill).toMatchObject({
      category: 'inss',
      amountCents: 240_000,
      fromCash: true,
      note: 'Pagamento ao INSS de Outubro de 2026',
    });
    expect(summariseOutflows(await st.expenses.list()).cashOutCents).toBe(740_000);

    const refuses = (input: Parameters<typeof st.inss.pay>[0], why: string) =>
      expect(st.inss.pay(input)).rejects.toSatisfy((e) => code(e) === why);
    await refuses({ month: '2026-10', amountCents: 800_000 }, 'duplicate_month');
    await refuses({ month: '2026-12', amountCents: 800_000 }, 'invalid_month');
    await refuses({ month: '2026-09', amountCents: 0 }, 'invalid_amount');
    await refuses({ month: '2026-09', amountCents: 800_000, fromCashCents: 900_000 }, 'invalid_source');
    await refuses({ month: '2026-09', amountCents: 800_000, paidOn: '2026-11-12' }, 'invalid_date');

    // Money a payment already used cannot be voided on its own.
    await expect(st.expenses.void(firstSaving.id, 'Engano')).rejects.toSatisfy((e) => code(e) === 'inss_used');
    await expect(st.inss.void(paid.id, '')).rejects.toSatisfy((e) => code(e) === 'reason_required');
    // Voiding the payment gives the money back and voids the outflow recorded with it.
    const voided = await st.inss.void(paid.id, 'Mês errado');
    expect(voided.voidReason).toBe('Mês errado');
    expect(await st.inss.saved()).toBe(560_000);
    expect((await st.expenses.list()).find((e) => e.id === paid.expenseId)!.voidedAt).toBeDefined();
    await st.expenses.void(firstSaving.id, 'Engano');
    expect(await st.inss.saved()).toBe(60_000);

    // The month can be recorded again, this time paid from elsewhere: what is set aside stays.
    await st.inss.pay({ month: '2026-10', amountCents: 800_000, paidOn: '2026-11-09' });
    expect(await st.inss.saved()).toBe(60_000);
    expect((await st.inss.list()).map((c) => [c.month, c.paidOn, !!c.voidedAt])).toEqual([
      ['2026-10', '2026-11-09', false],
      ['2026-10', '2026-11-11', true],
    ]);
    const log = (await st.auditLog.list()).filter((a) => a.entity === 'inss_contribution').map((a) => a.action);
    expect(log.sort()).toEqual(['created', 'created', 'voided']);
  });

  it('upgrades a version 5 database and keeps its data', async () => {
    const { default: Dexie } = await import('dexie');
    const name = `test-upgrade-${n++}`;
    const old = new Dexie(name);
    old.version(5).stores({ expenses: 'id, createdAt, category, updatedAt', settings: 'id' });
    await old.table('expenses').add({ id: 'e1', category: 'rent', amountCents: 100, fromCash: true, createdAt: '', updatedAt: '' });
    old.close();
    const upgraded = new CaixaDB(name);
    expect(await upgraded.expenses.count()).toBe(1);
    expect(await new Store(upgraded).inss.list()).toEqual([]);
    await upgraded.delete();
  });
});
