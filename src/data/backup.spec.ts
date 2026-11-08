import { afterEach, describe, expect, it } from 'vitest';
import { CaixaDB, DB_NAMES } from './db';
import { seedDemo } from './demo-seed';
import { Store } from './store';
import { exportBackup, importBackup, productsCsv, salesCsv, toCsv, validateBackup } from './backup';
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
});

describe('CSV', () => {
  it('escapes separators and quotes and uses decimal commas', async () => {
    expect(toCsv([['a;b', 'say "hi"', 3]])).toBe('﻿"a;b";"say ""hi""";3\r\n');
    const db = newDb('test-csv');
    const store = new Store(db);
    const p = await store.products.create({ name: 'Óleo', priceCents: 185_050, minStock: 2, barcode: '2000000000017' }, 3);
    await store.sales.create({ cart: addToCart([], p, 2), method: 'kwik' });
    expect(await productsCsv(db)).toContain('Óleo;2000000000017;un;1850,50;1;2;\r\n');
    const sale = (await new Store(db).sales.list())[0]!;
    expect(await salesCsv(db)).toContain(';Óleo;2;un;1850,50;3701,00;3701,00;QR KWiK;;;;');
    await new Store(db).sales.void(sale.id, 'Engano');
    expect(await salesCsv(db)).toContain(';QR KWiK;;;Sim;Engano;;\r\n');
    // With a cost price, each line shows its cost and profit.
    const b = await store.products.create({ name: 'Bolacha', priceCents: 50_000, costCents: 35_000, minStock: 0 }, 5);
    await store.sales.create({ cart: addToCart([], b, 3), method: 'cash' });
    expect(await productsCsv(db)).toContain('Bolacha;;un;500,00;2;0;350,00\r\n');
    expect(await salesCsv(db)).toContain(';Bolacha;3;un;500,00;1500,00;1500,00;Numerário;;;;;1050,00;450,00\r\n');
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
