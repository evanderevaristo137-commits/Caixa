import { creditBook } from '../domain/credit';
import { formatDate, formatDateTime } from '../lib/dates';
import { methodLabel } from '../i18n/pt-AO';
import { uuid } from '../lib/ids';
import { DB_NAMES, TABLES, type CaixaDB, type TableName } from './db';

export const BACKUP_APP = 'caixa';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

/**
 * The backup is JSON inside a .txt file: Chrome on Android can share .txt files
 * (to WhatsApp, e-mail, Drive) but refuses .json. Import reads the content, not the name.
 */
export const BACKUP_MIME = 'text/plain';
export const backupFileName = (prefix: string, stamp: string) => `${prefix}-copia-de-seguranca-${stamp}.txt`;

export async function markBackupDone(db: CaixaDB, now = new Date()): Promise<void> {
  await db.meta.put({ key: 'lastBackupAt', value: now.toISOString() });
}

export async function lastBackupAt(db: CaixaDB): Promise<string | undefined> {
  const row = await db.meta.get('lastBackupAt');
  return typeof row?.value === 'string' ? row.value : undefined;
}

export async function exportBackup(db: CaixaDB, now = new Date()): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>;
  for (const name of TABLES) data[name] = await db.table(name).toArray();
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown) => typeof v === 'string';

/** Checks that a parsed file really is a backup made by this app. Returns an error code or null. */
export function validateBackup(raw: unknown): string | null {
  if (!isObj(raw) || raw.app !== BACKUP_APP) return 'not_a_backup';
  if (raw.version !== BACKUP_VERSION) return 'unsupported_version';
  if (!isObj(raw.data)) return 'missing_data';
  const data = raw.data;
  for (const name of TABLES) {
    const rows = data[name];
    if (!Array.isArray(rows)) return `missing_${name}`;
    const keyField = name === 'meta' ? 'key' : 'id';
    if (!rows.every((r) => isObj(r) && isStr(r[keyField]))) return `bad_${name}`;
  }
  const products = data.products as Record<string, unknown>[];
  if (!products.every((p) => isStr(p.name) && isInt(p.priceCents) && isInt(p.stock) && isInt(p.minStock))) return 'bad_products';
  const sales = data.sales as Record<string, unknown>[];
  if (!sales.every((s) => isInt(s.totalCents) && isStr(s.method) && isStr(s.createdAt) && Array.isArray(s.items))) return 'bad_sales';
  const payments = data.creditPayments as Record<string, unknown>[];
  if (!payments.every((p) => isInt(p.amountCents) && isStr(p.customerId))) return 'bad_creditPayments';
  return null;
}

/** True when the backup was made in demo mode (the demo marks itself in the meta table). */
export function isDemoBackup(backup: Backup): boolean {
  return backup.data.meta.some((row) => isObj(row) && row.key === 'demoSeededAt');
}

/** Replaces ALL data in this database with the backup, in one transaction. */
export async function importBackup(db: CaixaDB, raw: unknown, now = new Date()): Promise<void> {
  const error = validateBackup(raw);
  if (error) throw new Error(error);
  const backup = raw as Backup;
  // Demo data must never mix with a real shop's data.
  if (db.name === DB_NAMES.store && isDemoBackup(backup)) throw new Error('demo_into_store');
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLES) {
      const table = db.table(name);
      await table.clear();
      await table.bulkAdd(backup.data[name]);
    }
    const at = now.toISOString();
    await db.audit.add({
      id: uuid(),
      entity: 'data',
      entityId: 'backup',
      action: 'imported',
      after: { exportedAt: backup.exportedAt },
      createdAt: at,
      updatedAt: at,
    });
  });
}

// ---------- CSV (opens in Excel / Google Sheets) ----------

/** Kz with a decimal comma, no thousands separator, for spreadsheets. */
const kzNumber = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  // BOM so Excel opens accents correctly; ';' because Excel in Portuguese uses ',' for decimals.
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export async function salesCsv(db: CaixaDB): Promise<string> {
  const [sales, customers] = await Promise.all([db.sales.orderBy('createdAt').toArray(), db.customers.toArray()]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const rows: (string | number)[][] = [
    ['Data', 'Venda n.º', 'Produto', 'Quantidade', 'Preço unitário (Kz)', 'Total linha (Kz)', 'Total venda (Kz)', 'Pagamento', 'Cliente (fiado)'],
  ];
  for (const s of sales) {
    for (const it of s.items) {
      rows.push([
        formatDateTime(s.createdAt),
        s.number,
        it.name,
        it.quantity,
        kzNumber(it.unitPriceCents),
        kzNumber(it.lineTotalCents),
        kzNumber(s.totalCents),
        methodLabel[s.method],
        s.customerId ? (names.get(s.customerId) ?? '') : '',
      ]);
    }
  }
  return toCsv(rows);
}

export async function productsCsv(db: CaixaDB): Promise<string> {
  const products = (await db.products.orderBy('name').toArray()).filter((p) => !p.archivedAt);
  return toCsv([
    ['Produto', 'Código de barras', 'Preço (Kz)', 'Stock', 'Stock mínimo'],
    ...products.map((p) => [p.name, p.barcode ?? '', kzNumber(p.priceCents), p.stock, p.minStock]),
  ]);
}

export async function creditCsv(db: CaixaDB, now = new Date()): Promise<string> {
  const [customers, sales, payments] = await Promise.all([db.customers.toArray(), db.sales.toArray(), db.creditPayments.toArray()]);
  const book = creditBook(customers, sales, payments, now);
  return toCsv([
    ['Cliente', 'Telefone', 'Deve (Kz)', 'Desde', 'Dias'],
    ...book.map((b) => [
      b.customer.name,
      b.customer.phone ?? '',
      kzNumber(Math.max(0, b.balanceCents)),
      b.oldestUnpaidAt ? formatDate(b.oldestUnpaidAt) : '',
      b.daysOutstanding ?? '',
    ]),
  ]);
}
