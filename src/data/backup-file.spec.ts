import { afterEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { seedDemo } from './demo-seed';
import { DomainError, Store } from './store';
import {
  BackupError,
  backupFileText,
  exportBackup,
  importBackup,
  openBackupFile,
  openSafetyCopy,
  restoreImpact,
  safetyCopyInfo,
  summariseBackup,
  summarisePhone,
  unlockBackupFile,
  type Backup,
  type BackupFile,
  type OpenedBackup,
} from './backup';
import { addToCart } from '../domain/cart';
import { fromBase64, gunzip } from '../lib/pack';

const dbs: CaixaDB[] = [];
let n = 0;
const newDb = () => {
  const db = new CaixaDB(`test-file-${n++}`);
  dbs.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.delete()));
});

const now = new Date('2026-11-12T17:00:00Z');
const code = (e: unknown) => (e instanceof BackupError || e instanceof DomainError ? e.code : String(e));
const ready = (o: OpenedBackup): Backup => {
  if (o.kind !== 'ready') throw new Error('expected a copy without password');
  return o.backup;
};
const locked = (o: OpenedBackup): BackupFile => {
  if (o.kind !== 'locked') throw new Error('expected a copy with password');
  return o.file;
};

/** A small shop: 2 products, a customer, a cash sale and a credit sale. */
async function smallShop(db: CaixaDB) {
  const store = new Store(db, () => now);
  const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, minStock: 2 }, 20);
  const oil = await store.products.create({ name: 'Óleo 1 L', priceCents: 185_000, minStock: 2 }, 10);
  const customer = await store.customers.create('Cliente Exemplo', '923 000 000');
  await store.sales.create({ cart: addToCart([], rice, 2), method: 'cash' });
  await store.sales.create({ cart: addToCart([], oil), method: 'credit', customerId: customer.id });
  return { store, rice, oil, customer };
}

describe('backup files (format 2)', () => {
  it('are compressed, carry exactly the data, and open without a password', async () => {
    const db = newDb();
    await seedDemo(db, now);
    const plain = JSON.stringify(await exportBackup(db, now));
    const text = await backupFileText(db, null, now);
    expect(text.length).toBeLessThan(plain.length / 2);
    const file = JSON.parse(text) as BackupFile;
    expect(file).toMatchObject({ app: 'caixa', format: 2, compression: 'gzip', exportedAt: now.toISOString() });
    expect(file.lock).toBeUndefined();
    expect(file.about).toContain('Recuperar uma cópia de segurança');
    // The packed text is exactly the backup JSON.
    expect(await gunzip(fromBase64(file.payload))).toBe(plain);
    expect(ready(await openBackupFile(text))).toEqual(JSON.parse(plain));
  });

  it('read big tables page by page, losing and repeating nothing', async () => {
    const db = newDb();
    await smallShop(db);
    const at = now.toISOString();
    await db.audit.bulkAdd(
      Array.from({ length: 4_500 }, (_, i) => ({
        id: `x-${String(i).padStart(5, '0')}`,
        entity: 'data' as const,
        entityId: 'test',
        action: 'created' as const,
        createdAt: at,
        updatedAt: at,
      })),
    );
    const total = await db.audit.count();
    const backup = ready(await openBackupFile(await backupFileText(db, null, now)));
    const ids = (backup.data.audit as { id: string }[]).map((a) => a.id);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    expect(backup).toEqual(JSON.parse(JSON.stringify(await exportBackup(db, now))));
  });

  it('copies made before November 2026 (plain JSON) still open', async () => {
    const db = newDb();
    await smallShop(db);
    const old = JSON.stringify(await exportBackup(db, now));
    expect(ready(await openBackupFile(old))).toEqual(JSON.parse(old));
  });

  it('refuse files that are not copies, damaged or changed, and from newer versions', async () => {
    const db = newDb();
    await smallShop(db);
    const text = await backupFileText(db, null, now);
    const file = JSON.parse(text) as BackupFile;
    const fail = (t: string) =>
      openBackupFile(t).then(
        () => 'opened',
        (e: unknown) => code(e),
      );
    expect(await fail('Data;Venda n.º;Produto\r\n12/11/2026;1;Arroz')).toBe('not_a_backup');
    expect(await fail(JSON.stringify({ app: 'outra', format: 2 }))).toBe('not_a_backup');
    expect(await fail(text.slice(0, text.length / 2))).toBe('damaged');
    expect(await fail(JSON.stringify({ ...file, format: 3 }))).toBe('unsupported_version');
    expect(await fail(JSON.stringify({ ...file, payload: 'não é base64' }))).toBe('damaged');
    const mid = Math.floor(file.payload.length / 2);
    const flipped = file.payload.slice(0, mid) + (file.payload[mid] === 'A' ? 'B' : 'A') + file.payload.slice(mid + 1);
    expect(await fail(JSON.stringify({ ...file, payload: flipped }))).toBe('damaged');
    expect(await fail(JSON.stringify({ ...file, payload: file.payload.slice(0, mid - (mid % 4)) }))).toBe('damaged');
  });
});

describe('copies protected with a password', () => {
  it('open only with the password, and the phone that restores one keeps protecting its copies', async () => {
    const db = newDb();
    const { store } = await smallShop(db);
    await store.security.setBackupPassword('pão com chouriço');
    const lock = (await store.security.backupLock())!;
    const text = await backupFileText(db, lock, now);
    const file = locked(await openBackupFile(text));
    expect(file.lock).toMatchObject({ cipher: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 600_000 });

    await expect(unlockBackupFile(file, 'pão com chourico')).rejects.toSatisfy((e) => code(e) === 'wrong_password');
    // Spaces typed by the keyboard around the password do not matter.
    const opened = await unlockBackupFile(file, ' pão com chouriço ');
    expect((opened.backup.data.customers as { name: string }[]).map((c) => c.name)).toEqual(['Cliente Exemplo']);
    // The password itself is never kept: only the key.
    expect(JSON.stringify(opened.lock)).not.toContain('chouriço');

    // A new phone restores it and its next copies open with the same password.
    const other = newDb();
    await importBackup(other, opened.backup, now, { lock: opened.lock });
    const otherStore = new Store(other, () => now);
    const otherLock = (await otherStore.security.backupLock())!;
    expect(otherLock).toEqual(opened.lock);
    const again = locked(await openBackupFile(await backupFileText(other, otherLock, now)));
    expect((await unlockBackupFile(again, 'pão com chouriço')).backup.data.sales).toHaveLength(2);
    expect((await otherStore.auditLog.list()).map((a) => a.entityId)).toContain('backup_password');
  });

  it('a phone that already has its own password keeps it', async () => {
    const db = newDb();
    const { store } = await smallShop(db);
    await store.security.setBackupPassword('primeira frase');
    const opened = await unlockBackupFile(
      locked(await openBackupFile(await backupFileText(db, await store.security.backupLock(), now))),
      'primeira frase',
    );
    const other = newDb();
    const otherStore = new Store(other, () => now);
    await otherStore.security.setBackupPassword('segunda frase');
    const own = await otherStore.security.backupLock();
    await importBackup(other, opened.backup, now, { lock: opened.lock });
    expect(await otherStore.security.backupLock()).toEqual(own);
  });

  it('a changed date or byte makes the copy unreadable', async () => {
    const db = newDb();
    const { store } = await smallShop(db);
    await store.security.setBackupPassword('frase secreta da loja');
    const file = locked(await openBackupFile(await backupFileText(db, await store.security.backupLock(), now)));
    const later = { ...file, exportedAt: '2026-11-13T17:00:00.000Z' };
    await expect(unlockBackupFile(later, 'frase secreta da loja')).rejects.toSatisfy((e) => code(e) === 'wrong_password');
    const absurd = JSON.stringify({ ...file, lock: { ...file.lock, iterations: 1_000_000_000 } });
    await expect(openBackupFile(absurd)).rejects.toSatisfy((e) => code(e) === 'damaged');
  });

  it('the owner code and the backup password never travel in a copy', async () => {
    const db = newDb();
    const { store } = await smallShop(db);
    await store.security.setPin('1234');
    await store.security.setBackupPassword('frase secreta da loja');
    const file = locked(await openBackupFile(await backupFileText(db, await store.security.backupLock(), now)));
    const { backup } = await unlockBackupFile(file, 'frase secreta da loja');
    const keys = (backup.data.meta as { key: string }[]).map((m) => m.key);
    expect(keys).not.toContain('ownerPinHash');
    expect(keys).not.toContain('backupLock');
    expect((await exportBackup(db)).data.meta.map((m) => (m as { key: string }).key)).not.toContain('backupLock');
  });

  it('a password has at least 8 characters, is audited without itself, and can be removed', async () => {
    const db = newDb();
    let tick = 0;
    const store = new Store(db, () => new Date(now.getTime() + 1000 * tick++));
    await expect(store.security.setBackupPassword('  curta  ')).rejects.toSatisfy((e) => code(e) === 'weak_password');
    await store.security.setBackupPassword('frase secreta da loja');
    await store.security.setBackupPassword('outra frase secreta');
    await store.security.setBackupPassword(null);
    expect(await store.security.backupLock()).toBeNull();
    const log = (await store.auditLog.list()).filter((a) => a.entityId === 'backup_password');
    expect(log.map((a) => (a.after as { password: string }).password)).toEqual(['set', 'changed', 'removed']);
    expect(JSON.stringify(await db.audit.toArray())).not.toContain('frase secreta');
  });
});

describe('restoring safely', () => {
  it('shows what the phone would lose: records missing from the copy, or changed after it', async () => {
    const db = newDb();
    const { rice, customer } = await smallShop(db);
    const backup = await exportBackup(db, now);
    expect(await restoreImpact(db, backup)).toEqual({ sales: 0, creditPayments: 0, other: 0 });

    // A minute after the copy.
    const store = new Store(db, () => new Date(now.getTime() + 60_000));
    const cashSale = (await store.sales.list()).find((s) => s.method === 'cash')!;
    await store.sales.void(cashSale.id, 'Engano do vendedor');
    await store.sales.create({ cart: addToCart([], rice), method: 'cash' });
    await store.credit.addPayment(customer.id, 50_000, 'cash');
    const impact = await restoreImpact(db, backup);
    expect(impact.sales).toBe(2); // the new sale, and the one voided after the copy
    expect(impact.creditPayments).toBe(1);
    expect(impact.other).toBeGreaterThan(0); // stock movements
  });

  it('describes a copy and the phone in the same way', async () => {
    const db = newDb();
    await seedDemo(db, now);
    const fromCopy = summariseBackup(await exportBackup(db, now));
    const fromPhone = await summarisePhone(db, now);
    expect(fromCopy).toEqual(fromPhone);
    expect(fromCopy.demo).toBe(true);
    expect(fromCopy.sales).toBeGreaterThan(50);
    expect(fromCopy.storeName).toBe('Mercearia da Dona Teresa');
  });

  it('keeps what the phone had before restoring, so the restore can be undone (and the undo too)', async () => {
    const phone = newDb();
    await smallShop(phone);
    const otherShop = newDb();
    const other = new Store(otherShop, () => now);
    await other.products.create({ name: 'Sabão', priceCents: 25_000, minStock: 0 }, 3);
    const copy = await exportBackup(otherShop, now);

    expect(await safetyCopyInfo(phone)).toBeUndefined();
    await importBackup(phone, copy, now);
    expect(await phone.sales.count()).toBe(0);
    const info = (await safetyCopyInfo(phone))!;
    expect(info.createdAt).toBe(now.toISOString());
    expect(info.summary).toMatchObject({ sales: 2, products: 2, customers: 1 });

    // Undo: the data from before comes back, and the copy just restored is kept in its place.
    const before = (await openSafetyCopy(phone))!;
    await importBackup(phone, before, now, { source: 'safety' });
    expect(await phone.sales.count()).toBe(2);
    expect((await new Store(phone).products.list()).map((p) => p.name)).toEqual(['Arroz 1 kg', 'Óleo 1 L']);
    expect((await safetyCopyInfo(phone))!.summary).toMatchObject({ sales: 0, products: 1 });
    // The activity log keeps both: the restore and its undo.
    const restores = (await phone.audit.toArray()).filter((a) => a.action === 'imported');
    expect(restores.map((a) => (a.after as { source: string }).source).sort()).toEqual(['file', 'safety']);
  });

  it('a safety copy is never part of a backup', async () => {
    const phone = newDb();
    await smallShop(phone);
    await importBackup(phone, await exportBackup(phone, now), now);
    expect(await phone.safety.count()).toBe(2);
    expect(Object.keys((await exportBackup(phone)).data)).not.toContain('safety');
  });
});

describe('database upgrade', () => {
  it('upgrades a version 6 database and keeps its data', async () => {
    const { default: Dexie } = await import('dexie');
    const name = `test-file-upgrade-${n++}`;
    const old = new Dexie(name);
    old.version(6).stores({ inssContributions: 'id, month, createdAt', settings: 'id' });
    await old.table('inssContributions').add({ id: 'c1', month: '2026-10', amountCents: 800_000, createdAt: '', updatedAt: '' });
    old.close();
    const upgraded = new CaixaDB(name);
    expect(await upgraded.inssContributions.count()).toBe(1);
    expect(await upgraded.safety.count()).toBe(0);
    await upgraded.delete();
  });
});
