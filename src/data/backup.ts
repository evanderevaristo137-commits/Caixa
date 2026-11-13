import { creditBook } from '../domain/credit';
import { kzNumber, toCsv } from '../lib/csv';
import { formatDate, formatDateString, formatDateTime } from '../lib/dates';
import { methodLabel, t } from '../i18n/pt-AO';
import { uuid } from '../lib/ids';
import { formatKg } from '../domain/quantity';
import { isPaymentPending } from '../domain/types';
import { TEMPLATE_HEADER } from '../domain/import-products';
import { lineCostCents } from '../domain/profit';
import { payablesBook } from '../domain/payables';
import { decrypt, deriveKey, encrypt, exportRawKey, fromBase64, gunzip, gzip, importRawKey, toBase64 } from '../lib/pack';
import { DB_NAMES, LATER_TABLES, TABLES, type CaixaDB, type SafetyInfo, type TableName } from './db';
import { BACKUP_LOCK_KEY, PHONE_ONLY_KEYS, type BackupLock, type Store } from './store';

export const BACKUP_APP = 'caixa';
/** Shape of the data inside a backup (the tables and their records). */
export const BACKUP_VERSION = 1;
/**
 * Shape of the file. Format 1 (until November 2026) was the data as plain JSON. Format 2 packs it:
 * compressed (gzip, about 4 times smaller) and, when the owner chose a password, encrypted (AES-GCM).
 * Both are still read.
 */
export const FILE_FORMAT = 2;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

/** A backup file in format 2: JSON with the packed data in base64. */
export interface BackupFile {
  app: typeof BACKUP_APP;
  format: typeof FILE_FORMAT;
  /** For whoever opens the file. */
  about: string;
  exportedAt: string;
  compression: 'gzip';
  /** Only when the copy is protected with a password. */
  lock?: { cipher: 'AES-GCM'; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string };
  payload: string;
}

export type BackupErrorCode =
  | 'not_a_backup'
  | 'damaged'
  | 'unsupported_version'
  | 'wrong_password'
  | 'demo_into_store'
  | 'store_into_demo'
  | 'changed_meanwhile'
  | 'no_space';

export class BackupError extends Error {
  constructor(public readonly code: BackupErrorCode) {
    super(code);
  }
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

// ---------- Reading everything ----------

const PAGE = 2_000;
const PHONE_ONLY = new Set<string>(PHONE_ONLY_KEYS);
type Row = Record<string, unknown>;

/**
 * Reads every table in one read-only transaction (one consistent picture of the shop), page by page,
 * so a big shop never needs all its records in memory at once. Rows that stay on this phone
 * (owner code, backup password) are left out. Every table is reported, even when empty.
 */
async function readAll(db: CaixaDB, onPage: (name: TableName, rows: Row[]) => void): Promise<void> {
  await db.transaction(
    'r',
    TABLES.map((n) => db.table(n)),
    async () => {
      for (const name of TABLES) {
        const table = db.table<Row, string>(name);
        const keyField = name === 'meta' ? 'key' : 'id';
        let after: string | undefined;
        for (;;) {
          const page = await (after === undefined ? table.toCollection() : table.where(':id').above(after)).limit(PAGE).toArray();
          onPage(name, name === 'meta' ? page.filter((r) => !PHONE_ONLY.has(String(r.key))) : page);
          if (page.length < PAGE) break;
          after = String(page[page.length - 1]![keyField]);
        }
      }
    },
  );
}

export async function exportBackup(db: CaixaDB, now = new Date()): Promise<Backup> {
  const data = Object.fromEntries(TABLES.map((n) => [n, [] as unknown[]])) as Record<TableName, unknown[]>;
  await readAll(db, (name, rows) => data[name].push(...rows));
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

/**
 * The backup as JSON text (the same as JSON.stringify of exportBackup), in pieces. Each piece goes
 * into a Blob at once, which Chrome keeps outside the app's memory: the text of a big shop is never one string.
 */
async function backupParts(db: CaixaDB, exportedAt: string, summary?: Summariser): Promise<Blob[]> {
  const parts = [new Blob([`{"app":"${BACKUP_APP}","version":${BACKUP_VERSION},"exportedAt":${JSON.stringify(exportedAt)},"data":{`])];
  let current: TableName | null = null;
  let empty = true;
  await readAll(db, (name, rows) => {
    summary?.add(name, rows);
    let head = '';
    if (name !== current) {
      head = `${current === null ? '' : '],'}${JSON.stringify(name)}:[`;
      current = name;
      empty = true;
    }
    const body = rows.map((r) => JSON.stringify(r)).join(',');
    parts.push(new Blob([head, !empty && body ? ',' : '', body]));
    if (body) empty = false;
  });
  parts.push(new Blob([current === null ? '}}' : ']}}']));
  return parts;
}

// ---------- What a backup holds ----------

/** What a backup (or this phone) holds, to compare before restoring. */
export interface BackupSummary {
  exportedAt: string;
  storeName?: string;
  /** All sales, voided ones included. */
  sales: number;
  lastSaleAt?: string;
  /** Products not archived. */
  products: number;
  customers: number;
  demo: boolean;
}

class Summariser {
  private readonly s: BackupSummary;
  constructor(exportedAt: string) {
    this.s = { exportedAt, sales: 0, products: 0, customers: 0, demo: false };
  }
  add(name: TableName, rows: Row[]) {
    const s = this.s;
    if (name === 'sales') {
      s.sales += rows.length;
      for (const r of rows)
        if (typeof r.createdAt === 'string' && (!s.lastSaleAt || r.createdAt > s.lastSaleAt)) s.lastSaleAt = r.createdAt;
    } else if (name === 'products') s.products += rows.filter((r) => !r.archivedAt).length;
    else if (name === 'customers') s.customers += rows.length;
    else if (name === 'settings') {
      const storeName = rows.find((r) => typeof r.storeName === 'string')?.storeName;
      if (typeof storeName === 'string') s.storeName = storeName;
    } else if (name === 'meta' && rows.some((r) => r.key === 'demoSeededAt')) s.demo = true;
  }
  result(): BackupSummary {
    return { ...this.s };
  }
}

export function summariseBackup(backup: Backup): BackupSummary {
  const s = new Summariser(backup.exportedAt);
  for (const name of TABLES) s.add(name, (backup.data[name] ?? []) as Row[]);
  return s.result();
}

/** The same summary for the data on this phone now. */
export async function summarisePhone(db: CaixaDB, now = new Date()): Promise<BackupSummary> {
  const [sales, last, products, customers, settings, demo] = await Promise.all([
    db.sales.count(),
    db.sales.orderBy('createdAt').last(),
    db.products.filter((p) => !p.archivedAt).count(),
    db.customers.count(),
    db.settings.toArray(),
    db.meta.get('demoSeededAt'),
  ]);
  return {
    exportedAt: now.toISOString(),
    storeName: settings[0]?.storeName,
    sales,
    lastSaleAt: last?.createdAt,
    products,
    customers,
    demo: demo !== undefined,
  };
}

/** Records on this phone that restoring the backup would lose: missing from it, or changed after it. */
export interface RestoreImpact {
  sales: number;
  creditPayments: number;
  other: number;
}

/** Business records only: the activity log, counters and settings follow the backup. */
const FACT_TABLES = TABLES.filter((n) => n !== 'audit' && n !== 'meta' && n !== 'settings');

export async function restoreImpact(db: CaixaDB, backup: Backup): Promise<RestoreImpact> {
  const impact: RestoreImpact = { sales: 0, creditPayments: 0, other: 0 };
  const stamp = (r: Row) => String(r.updatedAt ?? r.createdAt ?? '');
  await db.transaction(
    'r',
    FACT_TABLES.map((n) => db.table(n)),
    async () => {
      for (const name of FACT_TABLES) {
        const theirs = new Map<string, string>();
        for (const r of (backup.data[name] ?? []) as Row[]) theirs.set(String(r.id), stamp(r));
        let lost = 0;
        await db.table<Row, string>(name).each((r) => {
          const their = theirs.get(String(r.id));
          if (their === undefined || stamp(r) > their) lost++;
        });
        if (name === 'sales') impact.sales += lost;
        else if (name === 'creditPayments') impact.creditPayments += lost;
        else impact.other += lost;
      }
    },
  );
  return impact;
}

// ---------- The file ----------

const ABOUT = 'Cópia de segurança da Caixa. Para a recuperar: Caixa → Mais → Recuperar uma cópia de segurança.';
/** Sealed with the encrypted data: changing the date in the file makes it unreadable. */
const sealContext = (exportedAt: string) => `${BACKUP_APP}:${FILE_FORMAT}:${exportedAt}`;

/** The backup file (format 2), compressed and, with a lock (the owner's password), encrypted. */
export async function backupFileText(db: CaixaDB, lock: BackupLock | null, now = new Date()): Promise<string> {
  const exportedAt = now.toISOString();
  const packed = await gzip(await backupParts(db, exportedAt));
  const file: BackupFile = { app: BACKUP_APP, format: FILE_FORMAT, about: ABOUT, exportedAt, compression: 'gzip', payload: '' };
  if (lock) {
    const sealed = await encrypt(await importRawKey(fromBase64(lock.key)), packed, sealContext(exportedAt));
    file.lock = { cipher: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: lock.iterations, salt: lock.salt, iv: toBase64(sealed.iv) };
    file.payload = toBase64(sealed.data);
  } else {
    file.payload = toBase64(packed);
  }
  return JSON.stringify(file);
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
    // Backups made before a table existed simply don't have it.
    if (rows === undefined && LATER_TABLES.includes(name)) continue;
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

/** A valid Backup, or the reason it is not one. */
function checked(raw: unknown): Backup {
  const error = validateBackup(raw);
  if (error === 'not_a_backup' || error === 'unsupported_version') throw new BackupError(error);
  if (error) throw new BackupError('damaged');
  return raw as Backup;
}

/** Packed data (gzip of the backup JSON) back to a Backup. */
async function unpack(bytes: Uint8Array<ArrayBuffer>): Promise<Backup> {
  let raw: unknown;
  try {
    raw = JSON.parse(await gunzip(bytes));
  } catch {
    throw new BackupError('damaged');
  }
  return checked(raw);
}

const decode = (b64: string) => {
  try {
    return fromBase64(b64);
  } catch {
    throw new BackupError('damaged');
  }
};

/** Validates the fields of a format 2 file (a damaged or edited one could hold anything). */
function checkedFile(raw: Record<string, unknown>): BackupFile {
  const lock = raw.lock;
  const okLock =
    lock === undefined ||
    (isObj(lock) &&
      lock.cipher === 'AES-GCM' &&
      lock.kdf === 'PBKDF2-SHA256' &&
      isInt(lock.iterations) &&
      // A file from someone else must not keep the phone busy for minutes.
      (lock.iterations as number) >= 100_000 &&
      (lock.iterations as number) <= 5_000_000 &&
      isStr(lock.salt) &&
      isStr(lock.iv));
  if (!isStr(raw.exportedAt) || raw.compression !== 'gzip' || !isStr(raw.payload) || !okLock) throw new BackupError('damaged');
  return raw as unknown as BackupFile;
}

/** A backup file, opened: ready to restore, or waiting for its password. */
export type OpenedBackup = { kind: 'ready'; backup: Backup } | { kind: 'locked'; file: BackupFile };

/** Reads a backup file, in either format. Throws BackupError. */
export async function openBackupFile(text: string): Promise<OpenedBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // A file of ours cut short (a download that stopped half-way) still starts like one.
    throw new BackupError(/^\s*\{\s*"app"\s*:\s*"caixa"/.test(text) ? 'damaged' : 'not_a_backup');
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) throw new BackupError('not_a_backup');
  if (raw.format === undefined) return { kind: 'ready', backup: checked(raw) };
  if (raw.format !== FILE_FORMAT) throw new BackupError('unsupported_version');
  const file = checkedFile(raw);
  if (file.lock) return { kind: 'locked', file };
  return { kind: 'ready', backup: await unpack(decode(file.payload)) };
}

/**
 * Opens a copy protected with a password. Also returns the lock, so the phone can keep protecting
 * its next copies with the same password. Throws BackupError('wrong_password').
 */
export async function unlockBackupFile(file: BackupFile, password: string): Promise<{ backup: Backup; lock: BackupLock }> {
  const lock = file.lock;
  if (!lock) throw new BackupError('damaged');
  const key = await deriveKey(password, decode(lock.salt), lock.iterations, true);
  let packed: Uint8Array<ArrayBuffer>;
  try {
    packed = await decrypt(key, decode(lock.iv), decode(file.payload), sealContext(file.exportedAt));
  } catch {
    throw new BackupError('wrong_password');
  }
  const backup = await unpack(packed);
  return { backup, lock: { v: 1, salt: lock.salt, iterations: lock.iterations, key: toBase64(await exportRawKey(key)) } };
}

// ---------- Restoring ----------

/** True when the backup was made in demo mode (the demo marks itself in the meta table). */
export function isDemoBackup(backup: Backup): boolean {
  return backup.data.meta.some((row) => isObj(row) && row.key === 'demoSeededAt');
}

/** Changes whenever anything is recorded (every write adds a line to the activity log). */
async function changeMark(db: CaixaDB): Promise<string> {
  const [count, last] = await Promise.all([db.audit.count(), db.audit.orderBy('createdAt').last()]);
  return `${count}:${last?.id ?? ''}`;
}

const isQuotaError = (e: unknown) =>
  e instanceof Error && (e.name === 'QuotaExceededError' || (e as { inner?: Error }).inner?.name === 'QuotaExceededError');

/**
 * Replaces ALL data in this database with the backup, in one transaction. Before that, what is on the
 * phone is kept, compressed, as the safety copy: restoring it (`openSafetyCopy`) undoes this.
 * The owner code and the backup password stay this phone's; with `lock` (the password of the copy
 * just opened), the phone keeps it for its next copies when it had none.
 */
export async function importBackup(
  db: CaixaDB,
  raw: unknown,
  now = new Date(),
  options: { source?: 'file' | 'safety'; lock?: BackupLock } = {},
): Promise<void> {
  const backup = checked(raw);
  // Demo data must never mix with a real shop's data, either way: the demo renews itself every
  // day, so a shop's copy restored there would be wiped the next morning.
  if (db.name === DB_NAMES.store && isDemoBackup(backup)) throw new BackupError('demo_into_store');
  if (db.name === DB_NAMES.demo && !isDemoBackup(backup)) throw new BackupError('store_into_demo');
  const at = now.toISOString();
  try {
    const mark = await changeMark(db);
    const summary = new Summariser(at);
    const bytes = await gzip(await backupParts(db, at, summary));
    await db.transaction('rw', db.tables, async () => {
      if ((await changeMark(db)) !== mark) throw new BackupError('changed_meanwhile');
      const kept = (await db.meta.bulkGet([...PHONE_ONLY_KEYS])).filter((r) => r !== undefined);
      // The history of restores stays in the activity log, whatever the copy holds (so an undo still shows the restore it undid).
      const restores = await db.audit.where('[entity+entityId]').equals(['data', 'backup']).toArray();
      for (const name of TABLES) {
        const table = db.table(name);
        await table.clear();
        const rows = name === 'meta' ? backup.data.meta.filter((r) => !PHONE_ONLY.has(String((r as Row).key))) : (backup.data[name] ?? []);
        await table.bulkAdd(rows);
      }
      if (kept.length) await db.meta.bulkPut(kept);
      if (restores.length) await db.audit.bulkPut(restores);
      const adopt = options.lock && !kept.some((r) => r.key === BACKUP_LOCK_KEY);
      if (adopt) await db.meta.put({ key: BACKUP_LOCK_KEY, value: JSON.stringify(options.lock) });
      await db.safety.bulkPut([
        { id: 'info', createdAt: at, summary: summary.result() },
        { id: 'data', bytes },
      ]);
      await db.audit.add({
        id: uuid(),
        entity: 'data',
        entityId: 'backup',
        action: 'imported',
        after: { exportedAt: backup.exportedAt, source: options.source ?? 'file' },
        createdAt: at,
        updatedAt: at,
      });
      if (adopt) {
        await db.audit.add({
          id: uuid(),
          entity: 'settings',
          entityId: 'backup_password',
          action: 'updated',
          after: { password: 'adopted' },
          createdAt: at,
          updatedAt: at,
        });
      }
    });
  } catch (e) {
    if (isQuotaError(e)) throw new BackupError('no_space');
    throw e;
  }
}

/** Restoring from the app: replacing everything is a sensitive action, so the Store asks for the owner code. */
export async function restoreBackup(
  store: Store,
  backup: Backup,
  now = new Date(),
  options: { source?: 'file' | 'safety'; lock?: BackupLock } = {},
): Promise<void> {
  await store.security.requireOwner();
  await importBackup(store.db, backup, now, options);
  // The backup may bring (or drop) employees: who can use the app is read again.
  await store.staff.load();
}

/** When and what the phone held before the last restore, if a safety copy exists. */
export async function safetyCopyInfo(db: CaixaDB): Promise<SafetyInfo | undefined> {
  const row = await db.safety.get('info');
  return row && 'summary' in row ? row : undefined;
}

/** The data the phone held before the last restore, ready to restore again (source 'safety'). */
export async function openSafetyCopy(db: CaixaDB): Promise<Backup | null> {
  const row = await db.safety.get('data');
  return row && 'bytes' in row ? unpack(row.bytes) : null;
}

// ---------- CSV (opens in Excel / Google Sheets) ----------

// The CSV helpers live in lib/csv.ts (the printable reports use them too).
export { toCsv } from '../lib/csv';

export async function salesCsv(db: CaixaDB): Promise<string> {
  const [sales, customers, products] = await Promise.all([
    db.sales.orderBy('createdAt').toArray(),
    db.customers.toArray(),
    db.products.toArray(),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  // The product's current category, as in the reports.
  const categories = new Map(products.map((p) => [p.id, p.category ?? '']));
  const rows: (string | number)[][] = [
    [
      'Data',
      'Venda n.º',
      'Produto',
      'Quantidade',
      'Unidade',
      'Preço unitário (Kz)',
      'Total linha (Kz)',
      'Total venda (Kz)',
      'Pagamento',
      'Cliente (a crédito)',
      'Referência do pagamento',
      'Anulada',
      'Motivo da anulação',
      'Custo linha (Kz)',
      'Lucro linha (Kz)',
      'Categoria',
      t.pending.exportColumn,
    ],
  ];
  for (const s of sales) {
    for (const it of s.items) {
      const cost = lineCostCents(it);
      rows.push([
        formatDateTime(s.createdAt),
        s.number,
        it.name,
        it.soldBy === 'weight' ? formatKg(it.quantity) : it.quantity,
        it.soldBy === 'weight' ? 'kg' : 'un',
        kzNumber(it.unitPriceCents),
        kzNumber(it.lineTotalCents),
        kzNumber(s.totalCents),
        methodLabel[s.method],
        s.customerId ? (names.get(s.customerId) ?? '') : '',
        s.transactionRef ?? '',
        s.voidedAt ? 'Sim' : '',
        s.voidReason ?? '',
        cost === undefined ? '' : kzNumber(cost),
        cost === undefined ? '' : kzNumber(it.lineTotalCents - cost),
        categories.get(it.productId) ?? '',
        isPaymentPending(s) ? t.pending.tag : s.confirmedAt ? t.pending.exportConfirmed(formatDateTime(s.confirmedAt)) : '',
      ]);
    }
  }
  return toCsv(rows);
}

/** ="…" keeps a barcode as text when Excel opens the file (no 4,00638E+12, no lost zeros). The import reads it back. */
const excelText = (s: string) => `="${s.replace(/"/g, '""')}"`;

/** Products in the import format (TEMPLATE_HEADER): change them in Excel and import them back. */
export async function productsCsv(db: CaixaDB): Promise<string> {
  const products = (await db.products.orderBy('name').toArray()).filter((p) => !p.archivedAt);
  return toCsv([
    TEMPLATE_HEADER,
    ...products.map((p) => {
      const byWeight = p.soldBy === 'weight';
      const qty = (n: number) => (byWeight ? formatKg(n) : n);
      return [
        p.name,
        p.category ?? '',
        p.barcode ? excelText(p.barcode) : '',
        byWeight ? 'kg' : 'un',
        kzNumber(p.priceCents),
        p.costCents === undefined ? '' : kzNumber(p.costCents),
        qty(p.stock),
        qty(p.minStock),
      ];
    }),
  ]);
}

/** Empty template for the import: just the column names. */
export const productsTemplateCsv = (): string => toCsv([TEMPLATE_HEADER]);

export async function returnsCsv(db: CaixaDB): Promise<string> {
  const returns = await db.returns.orderBy('createdAt').toArray();
  const rows: (string | number)[][] = [
    ['Data', 'Devolução n.º', 'Venda n.º', 'Produto', 'Quantidade', 'Unidade', 'Valor devolvido (Kz)', 'Como', 'Voltou ao stock', 'Motivo'],
  ];
  for (const r of returns) {
    for (const it of r.items) {
      rows.push([
        formatDateTime(r.createdAt),
        r.number,
        r.saleNumber,
        it.name,
        it.soldBy === 'weight' ? formatKg(it.quantity) : it.quantity,
        it.soldBy === 'weight' ? 'kg' : 'un',
        kzNumber(it.refundCents),
        t.returns.refunds[r.refund],
        r.restock ? 'Sim' : 'Não',
        r.reason,
      ]);
    }
  }
  return toCsv(rows);
}

export async function expensesCsv(db: CaixaDB): Promise<string> {
  const expenses = await db.expenses.orderBy('createdAt').toArray();
  return toCsv([
    ['Data', 'Tipo', 'Valor (Kz)', 'Saiu da caixa', 'Nota', 'Anulada', 'Motivo da anulação'],
    ...expenses.map((e) => [
      formatDateTime(e.createdAt),
      t.expenses.categories[e.category],
      kzNumber(e.amountCents),
      e.fromCash ? 'Sim' : 'Não',
      e.note ?? '',
      e.voidedAt ? 'Sim' : '',
      e.voidReason ?? '',
    ]),
  ]);
}

export async function purchasesCsv(db: CaixaDB): Promise<string> {
  const [purchases, suppliers] = await Promise.all([db.purchases.orderBy('createdAt').toArray(), db.suppliers.toArray()]);
  const names = new Map(suppliers.map((s) => [s.id, s.name]));
  const rows: (string | number)[][] = [
    [
      'Data',
      'Compra n.º',
      'Fornecedor',
      'Produto',
      'Quantidade',
      'Unidade',
      'Custo unitário (Kz)',
      'Total linha (Kz)',
      'Total compra (Kz)',
      'Pagamento',
      'Pagar até',
      'Anulada',
      'Motivo da anulação',
    ],
  ];
  for (const p of purchases) {
    for (const it of p.items) {
      rows.push([
        formatDateTime(p.createdAt),
        p.number,
        p.supplierId ? (names.get(p.supplierId) ?? '') : '',
        it.name,
        it.soldBy === 'weight' ? formatKg(it.quantity) : it.quantity,
        it.soldBy === 'weight' ? 'kg' : 'un',
        kzNumber(it.unitCostCents),
        kzNumber(it.lineTotalCents),
        kzNumber(p.totalCents),
        t.purchases.payments[p.payment],
        p.dueDate ? formatDateString(p.dueDate) : '',
        p.voidedAt ? 'Sim' : '',
        p.voidReason ?? '',
      ]);
    }
  }
  return toCsv(rows);
}

export async function suppliersCsv(db: CaixaDB, now = new Date()): Promise<string> {
  const [suppliers, purchases, payments] = await Promise.all([
    db.suppliers.toArray(),
    db.purchases.toArray(),
    db.supplierPayments.toArray(),
  ]);
  return toCsv([
    ['Fornecedor', 'Telefone', 'A loja deve (Kz)', 'Pagar até'],
    ...payablesBook(suppliers, purchases, payments, now).map((b) => [
      b.supplier.name,
      b.supplier.phone ?? '',
      kzNumber(Math.max(0, b.balanceCents)),
      b.nextDueDate ? formatDateString(b.nextDueDate) : '',
    ]),
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
