import { afterEach, describe, expect, it } from 'vitest';
import { CaixaDB, DB_NAMES } from './db';
import { seedDemo } from './demo-seed';
import { Store } from './store';
import {
  expensesCsv,
  exportBackup,
  importBackup,
  productsCsv,
  purchasesCsv,
  salesCsv,
  suppliersCsv,
  toCsv,
  validateBackup,
} from './backup';
import { addToCart } from '../domain/cart';

const dbs: CaixaDB[] = [];
const newDb = (name: string) => {
  const db = new CaixaDB(name);
  dbs.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.delete()));
});

describe('backup', () => {
  it('round-trips all data into another database', async () => {
    const a = newDb('test-bk-a');
    const store = new Store(a);
    const p = await store.products.create({ name: 'Arroz; "bom"', priceCents: 120_050, minStock: 1 }, 5);
    const c = await store.customers.create('Cliente Exemplo');
    await store.sales.create({ cart: addToCart([], p, 2), method: 'credit', customerId: c.id });
    const backup = JSON.parse(JSON.stringify(await exportBackup(a)));
    expect(validateBackup(backup)).toBeNull();

    const b = newDb('test-bk-b');
    await new Store(b).products.create({ name: 'Será apagado', priceCents: 1, minStock: 0 });
    await importBackup(b, backup);
    const restored = new Store(b);
    expect((await restored.products.list()).map((x) => x.name)).toEqual(['Arroz; "bom"']);
    expect((await restored.sales.list())[0]!.totalCents).toBe(240_100);
    expect((await restored.auditLog.list()).at(-1)!.action).toBe('imported');
  });

  it('rejects files that are not valid backups, without touching data', async () => {
    expect(validateBackup({})).toBe('not_a_backup');
    expect(validateBackup({ app: 'caixa', version: 99, data: {} })).toBe('unsupported_version');
    const db = newDb('test-bk-c');
    await new Store(db).products.create({ name: 'Fica', priceCents: 1, minStock: 0 });
    await expect(importBackup(db, { app: 'caixa', version: 1, data: { products: [{ id: 'x', priceCents: 1.5 }] } })).rejects.toThrow();
    expect(await db.products.count()).toBe(1);
  });
});

describe('demo backups', () => {
  it('can never be imported into the real store', async () => {
    const demo = newDb('test-bk-demo');
    await seedDemo(demo, new Date(2026, 10, 6, 12));
    const backup = JSON.parse(JSON.stringify(await exportBackup(demo)));
    const real = newDb(DB_NAMES.store);
    await new Store(real).products.create({ name: 'Produto real', priceCents: 100, minStock: 0 });
    await expect(importBackup(real, backup)).rejects.toThrow('demo_into_store');
    expect((await new Store(real).products.list()).map((p) => p.name)).toEqual(['Produto real']);
  });

  it("a shop's copy never goes into the demo, which renews itself every day", async () => {
    const real = newDb('test-bk-real');
    await new Store(real).products.create({ name: 'Produto real', priceCents: 100, minStock: 0 });
    const backup = await exportBackup(real);
    const demo = newDb(DB_NAMES.demo);
    await seedDemo(demo, new Date(2026, 10, 6, 12));
    await expect(importBackup(demo, backup)).rejects.toThrow('store_into_demo');
    // The demo's own copies (and its safety copy) can be restored there.
    await importBackup(demo, await exportBackup(demo));
    expect(await demo.products.count()).toBeGreaterThan(20);
  });
});

describe('backups and the tables added later', () => {
  it('imports a backup made before expenses existed, and carries expenses and counts', async () => {
    const db = newDb('test-bk-later');
    const store = new Store(db);
    await store.expenses.create({ category: 'energy', amountCents: 400_000, fromCash: true });
    await store.cash.close({ floatCents: 0, countedCents: 0 });
    const backup = await exportBackup(db);
    expect(backup.data.expenses).toHaveLength(1);
    expect(backup.data.cashCloses).toHaveLength(1);

    const old = JSON.parse(JSON.stringify(backup));
    delete old.data.expenses;
    delete old.data.cashCloses;
    expect(validateBackup(old)).toBeNull();
    await importBackup(db, old);
    expect(await db.expenses.count()).toBe(0);
    await importBackup(db, backup);
    expect(await db.expenses.count()).toBe(1);
    expect(await db.cashCloses.count()).toBe(1);
  });

  it('carries the INSS plan and contributions, and still reads backups made before they existed', async () => {
    const db = newDb('test-bk-inss');
    const store = new Store(db, () => new Date(2026, 10, 11, 10, 0));
    await store.inss.savePlan({ wages: 1, modality: 'normal', birthYear: 1981 });
    await store.inss.pay({ month: '2026-10', amountCents: 800_000, receipt: 'REF 1' });
    const backup = await exportBackup(db);
    expect(backup.data.inssContributions).toHaveLength(1);

    const other = newDb('test-bk-inss-2');
    await importBackup(other, JSON.parse(JSON.stringify(backup)));
    expect((await new Store(other).settings.get()).inss).toMatchObject({ wages: 1, startMonth: '2026-11' });
    expect((await new Store(other).inss.list())[0]).toMatchObject({ month: '2026-10', receipt: 'REF 1' });

    const old = JSON.parse(JSON.stringify(backup));
    delete old.data.inssContributions;
    expect(validateBackup(old)).toBeNull();
    await importBackup(other, old);
    expect(await other.inssContributions.count()).toBe(0);
  });
});

describe('CSV', () => {
  it('escapes separators and quotes and uses decimal commas', async () => {
    expect(toCsv([['a;b', 'say "hi"', 3]])).toBe('﻿"a;b";"say ""hi""";3\r\n');
    const db = newDb('test-csv');
    const store = new Store(db);
    const p = await store.products.create({ name: 'Óleo', priceCents: 185_050, minStock: 2, barcode: '2000000000017' }, 3);
    await store.sales.create({ cart: addToCart([], p, 2), method: 'kwik' });
    expect(await productsCsv(db)).toContain('Óleo;;;"=""2000000000017""";un;1850,50;;1;2\r\n');
    const sale = (await new Store(db).sales.list())[0]!;
    expect(await salesCsv(db)).toContain(';Óleo;2;un;1850,50;3701,00;3701,00;QR KWiK;;;;');
    await new Store(db).sales.void(sale.id, 'Engano');
    expect(await salesCsv(db)).toContain(';QR KWiK;;;Sim;Engano;;;;;\r\n');
    // With a cost price, each line shows its cost and profit.
    const b = await store.products.create({ name: 'Bolacha', priceCents: 50_000, costCents: 35_000, minStock: 0 }, 5);
    await store.sales.create({ cart: addToCart([], b, 3), method: 'cash' });
    expect(await productsCsv(db)).toContain('Bolacha;;;;un;500,00;350,00;2;0\r\n');
    expect(await salesCsv(db)).toContain(';Bolacha;3;un;500,00;1500,00;1500,00;Numerário;;;;;1050,00;450,00;;;\r\n');
    // Electronic payments still to confirm, and confirmed later, say so in the last column.
    const waiting = await store.sales.create({ cart: addToCart([], b), method: 'transfer', pending: true });
    expect(await salesCsv(db)).toContain(';Bolacha;1;un;500,00;500,00;500,00;Transferência bancária;;;;;350,00;150,00;;;Por confirmar\r\n');
    await store.sales.confirmPayment(waiting.id);
    expect(await salesCsv(db)).toMatch(/;Transferência bancária;;;;;350,00;150,00;;;Confirmado em \d\d\/\d\d\/\d{4} \d\d:\d\d\r\n/);
    const e = await store.expenses.create({ category: 'energy', amountCents: 400_000, fromCash: true, note: 'Gasóleo; 20 L' });
    await store.expenses.void(e.id, 'Valor errado');
    await store.expenses.create({ category: 'rent', amountCents: 3_000_000, fromCash: false });
    const csv = await expensesCsv(db);
    expect(csv).toContain(';Luz e gerador;4000,00;Sim;"Gasóleo; 20 L";Sim;Valor errado\r\n');
    expect(csv).toContain(';Renda;30000,00;Não;;;\r\n');
    const sup = await store.suppliers.create('Armazém; Kikolo', '923 000 000');
    await store.purchases.create({
      supplierId: sup.id,
      lines: [{ productId: b.id, quantity: 10, unitCostCents: 34_000 }],
      payment: 'credit',
      dueDate: '2099-12-31',
    });
    expect(await purchasesCsv(db)).toContain(
      ';1;"Armazém; Kikolo";Bolacha;10;un;340,00;3400,00;3400,00;A crédito (pagar depois);31/12/2099;;\r\n',
    );
    expect(await suppliersCsv(db)).toContain('"Armazém; Kikolo";923 000 000;3400,00;31/12/2099\r\n');
  });
});

describe('backup bookkeeping', () => {
  it('remembers when the last backup was made', async () => {
    const db = newDb('test-bk-mark');
    const { lastBackupAt, markBackupDone, backupFileName } = await import('./backup');
    expect(await lastBackupAt(db)).toBeUndefined();
    await markBackupDone(db, new Date('2026-11-06T10:00:00Z'));
    expect(await lastBackupAt(db)).toBe('2026-11-06T10:00:00.000Z');
    expect(backupFileName('caixa', '2026-11-06')).toBe('caixa-copia-de-seguranca-2026-11-06.txt');
  });
});
