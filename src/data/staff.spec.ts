import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { addToCart } from '../domain/cart';
import { exportBackup, importBackup } from './backup';
import { salesByPerson } from '../domain/staff';

let db: CaixaDB;
let store: Store;
let n = 0;
let clock = new Date(2026, 10, 13, 9, 0).getTime();
beforeEach(() => {
  db = new CaixaDB(`test-staff-${n++}`);
  clock = new Date(2026, 10, 13, 9, 0).getTime();
  store = new Store(db, () => new Date((clock += 1000)));
});
afterEach(async () => {
  await db.delete();
});

const code = (e: unknown) => (e instanceof DomainError ? e.code : String(e));
const OWNER_PIN = '2580';

/** The owner sets the owner code and authorises the next sensitive action (as the screens do). */
async function ownerReady() {
  await store.security.setPin(OWNER_PIN);
  await store.security.unlock(OWNER_PIN);
}

async function rice() {
  return store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, costCents: 100_000, minStock: 0 }, 10);
}

describe('a shop without employees', () => {
  it('works as always: nothing asks who is using the app, and nothing says who did it', async () => {
    await store.staff.load();
    expect(store.staff.isOn()).toBe(false);
    const p = await rice();
    const sale = await store.sales.create({ cart: addToCart([], p, 1), method: 'cash' });
    expect(sale.by).toBeUndefined();
    expect((await store.auditLog.list()).every((e) => e.by === undefined)).toBe(true);
  });
});

describe('adding employees', () => {
  it('needs the owner code first, and the owner typing it now', async () => {
    await expect(store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111')).rejects.toSatisfy(
      (e) => code(e) === 'owner_code_first',
    );
    await store.security.setPin(OWNER_PIN);
    await expect(store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111')).rejects.toSatisfy(
      (e) => code(e) === 'owner_code_required',
    );
    await store.security.unlock(OWNER_PIN);
    const maria = await store.staff.add({ name: '  Maria   João ', role: 'seller', canCredit: false }, '1111');
    expect(maria.name).toBe('Maria João');
    expect(store.staff.isOn()).toBe(true);
    // The owner, who just added her, keeps using the app.
    expect(store.staff.current()).toEqual({ kind: 'owner' });
  });

  it("never takes the owner's code, nor a bad code, and never keeps a code in the employee's record", async () => {
    await ownerReady();
    await expect(store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, OWNER_PIN)).rejects.toSatisfy(
      (e) => code(e) === 'same_as_owner',
    );
    await expect(store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '12a4')).rejects.toSatisfy(
      (e) => code(e) === 'invalid_pin',
    );
    const maria = await store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111');
    expect(JSON.stringify(await db.staff.get(maria.id))).not.toMatch(/hash|salt|1111/);
    expect(await store.staff.hasPin(maria.id)).toBe(true);
  });

  it('cannot remove the owner code while the shop has employees', async () => {
    await ownerReady();
    await store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111');
    await expect(store.security.removePin(OWNER_PIN)).rejects.toSatisfy((e) => code(e) === 'staff_need_owner_code');
  });
});

describe('who is using the app', () => {
  it('an employee starts with her own code; wrong codes make her wait, as with the owner code', async () => {
    await ownerReady();
    const maria = await store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111');
    store.security.lock();
    expect(await store.staff.signIn(maria.id, '9999')).toEqual({ ok: false });
    expect(await store.staff.signIn(maria.id, '9999')).toEqual({ ok: false });
    expect(await store.staff.signIn(maria.id, '9999')).toEqual({ ok: false, waitSeconds: 30 });
    // While waiting, not even the right code is tried.
    expect(await store.staff.signIn(maria.id, '1111')).toEqual({ ok: false, waitSeconds: expect.any(Number) as number });
    clock += 31_000;
    expect(await store.staff.signIn(maria.id, '1111')).toEqual({ ok: true });
    expect(store.staff.current()).toMatchObject({ kind: 'staff', member: { id: maria.id } });
    const log = await store.auditLog.list();
    expect(log.some((e) => e.entity === 'staff' && e.action === 'signed_in' && e.by === maria.id)).toBe(true);
  });

  it('closing and opening the app keeps the person (no code again); an archived employee is nobody', async () => {
    await ownerReady();
    const maria = await store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111');
    const again = new Store(db, () => new Date((clock += 1000)));
    expect(await again.staff.restore(maria.id)).toMatchObject({ kind: 'staff' });
    expect(await again.staff.restore('owner')).toEqual({ kind: 'owner' });
    expect(await again.staff.restore('someone-else')).toBeNull();
    await store.security.unlock(OWNER_PIN);
    const ana = await store.staff.add({ name: 'Ana', role: 'seller', canCredit: false }, '2222');
    await store.security.unlock(OWNER_PIN);
    await store.staff.archive(maria.id);
    expect(await again.staff.restore(maria.id)).toBeNull();
    // Without employees left, the app is the owner's again, as before.
    await store.security.unlock(OWNER_PIN);
    await store.staff.archive(ana.id);
    expect(await again.staff.restore(ana.id)).toEqual({ kind: 'owner' });
    expect(again.staff.isOn()).toBe(false);
  });
});

describe('what a seller can do', () => {
  async function sellerOnDuty(canCredit: boolean) {
    await ownerReady();
    const p = await rice();
    const customer = await store.customers.create('Cliente Exemplo');
    const maria = await store.staff.add({ name: 'Maria', role: 'seller', canCredit }, '1111');
    store.security.lock();
    await store.staff.signIn(maria.id, '1111');
    return { p, customer, maria };
  }

  it('sells, and every sale and payment says who', async () => {
    const { p, maria } = await sellerOnDuty(false);
    const sale = await store.sales.create({ cart: addToCart([], p, 2), method: 'cash' });
    expect(sale.by).toBe(maria.id);
    const log = await store.auditLog.list();
    expect(log.find((e) => e.entity === 'sale' && e.entityId === sale.id)?.by).toBe(maria.id);
  });

  it('on credit only if the owner allowed it, or with the owner code typed on the spot', async () => {
    const { p, customer } = await sellerOnDuty(false);
    await expect(store.sales.create({ cart: addToCart([], p, 1), method: 'credit', customerId: customer.id })).rejects.toSatisfy(
      (e) => code(e) === 'owner_code_required',
    );
    await store.security.unlock(OWNER_PIN);
    const sale = await store.sales.create({ cart: addToCart([], p, 1), method: 'credit', customerId: customer.id });
    expect(sale.method).toBe('credit');
  });

  it('with credit allowed, sells on credit and receives what customers pay', async () => {
    const { p, customer, maria } = await sellerOnDuty(true);
    await store.sales.create({ cart: addToCart([], p, 1), method: 'credit', customerId: customer.id });
    const payment = await store.credit.addPayment(customer.id, 50_000, 'cash');
    expect(payment.by).toBe(maria.id);
  });

  it('does not change products, stock or settings without the owner code', async () => {
    const { p } = await sellerOnDuty(true);
    for (const attempt of [
      () => store.products.create({ name: 'Feijão', priceCents: 1000, minStock: 0 }),
      () => store.products.addEntry(p.id, 5),
      () => store.suppliers.create('Armazém Exemplo'),
      () => store.settings.save({ storeName: 'Outra loja' }),
      () => store.expenses.create({ category: 'withdrawal', amountCents: 1000, fromCash: true }),
    ]) {
      await expect(attempt()).rejects.toSatisfy((e) => code(e) === 'owner_code_required');
    }
    // An ordinary expense (the taxi) is fine, and says who.
    const taxi = await store.expenses.create({ category: 'transport', amountCents: 50_000, fromCash: true });
    expect(taxi.by).toBeDefined();
  });

  it('closes the day, and the close says who counted', async () => {
    const { maria } = await sellerOnDuty(false);
    const close = await store.cash.close({ floatCents: 0, countedCents: 0 });
    expect(close.by).toBe(maria.id);
  });
});

describe('a manager', () => {
  it('handles products and stock, but not the settings', async () => {
    await ownerReady();
    const ana = await store.staff.add({ name: 'Ana', role: 'manager', canCredit: false }, '2222');
    expect(ana.canCredit).toBe(true); // a manager always may sell on credit
    store.security.lock();
    await store.staff.signIn(ana.id, '2222');
    const p = await store.products.create({ name: 'Feijão', priceCents: 1000, minStock: 0 });
    await store.products.addEntry(p.id, 5);
    await expect(store.settings.save({ storeName: 'Outra loja' })).rejects.toSatisfy((e) => code(e) === 'owner_code_required');
  });
});

describe('the owner', () => {
  it('signs in with the owner code; sensitive actions still ask the code each time', async () => {
    await ownerReady();
    const p = await rice();
    await store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111');
    store.security.lock();
    expect(await store.staff.signIn('owner', '0000')).toEqual({ ok: false });
    expect(await store.staff.signIn('owner', OWNER_PIN)).toEqual({ ok: true });
    const sale = await store.sales.create({ cart: addToCart([], p, 1), method: 'cash' });
    expect(sale.by).toBe('owner');
    await expect(store.sales.void(sale.id, 'Engano no registo')).rejects.toSatisfy((e) => code(e) === 'owner_code_required');
  });
});

describe('employees and backups', () => {
  it('a backup takes the employees but never their codes; restoring keeps the codes of this phone', async () => {
    await ownerReady();
    const maria = await store.staff.add({ name: 'Maria', role: 'seller', canCredit: false }, '1111');
    const backup = await exportBackup(db);
    expect(backup.data.staff).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toMatch(/staffPins|"hash"/);

    // Another phone: Maria comes with the backup, without a code (the owner gives her a new one).
    const other = new CaixaDB(`test-staff-other-${n++}`);
    try {
      await importBackup(other, backup);
      const otherStore = new Store(other);
      await otherStore.staff.load();
      expect(otherStore.staff.isOn()).toBe(true);
      expect(await otherStore.staff.hasPin(maria.id)).toBe(false);
      await expect(otherStore.staff.signIn(maria.id, '1111')).rejects.toSatisfy((e) => code(e) === 'no_code');
    } finally {
      await other.delete();
    }

    // The same phone: her code is still there.
    await importBackup(db, backup);
    expect(await store.staff.hasPin(maria.id)).toBe(true);
  });
});

describe('salesByPerson', () => {
  it("adds up each person's valid sales, the biggest first", () => {
    const base = { number: 1, items: [], currency: 'AOA' as const, method: 'cash' as const, createdAt: '', updatedAt: '' };
    const rows = salesByPerson([
      { ...base, id: 'a', by: 'owner', totalCents: 1000 },
      { ...base, id: 'b', by: 'm1', totalCents: 3000 },
      { ...base, id: 'c', by: 'm1', totalCents: 2000 },
      { ...base, id: 'd', by: 'm1', totalCents: 9000, voidedAt: 'x' },
      { ...base, id: 'e', totalCents: 500 },
    ]);
    expect(rows).toEqual([
      { by: 'm1', count: 2, totalCents: 5000 },
      { by: 'owner', count: 1, totalCents: 1000 },
    ]);
  });
});
