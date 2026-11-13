import Dexie, { type Table } from 'dexie';
import { dueDateOf } from '../domain/credit';
import type {
  AuditEntry,
  Batch,
  CashClose,
  CreditPayment,
  Customer,
  Expense,
  InssContribution,
  Product,
  SaleReturn,
  Purchase,
  Sale,
  Settings,
  StockMovement,
  Supplier,
  SupplierPayment,
  StaffMember,
} from '../domain/types';

export type DataMode = 'store' | 'demo';

/** Real shop data and demo data live in two separate databases: they can never mix. */
export const DB_NAMES: Record<DataMode, string> = {
  store: 'caixa-loja',
  demo: 'caixa-demo',
};

export interface MetaRow {
  key: string;
  value: number | string;
}

/** What the phone held before the last restore of a backup (shown to undo it). */
export interface SafetyInfo {
  id: 'info';
  createdAt: string;
  summary: import('./backup').BackupSummary;
}

/**
 * The safety copy: before a backup replaces everything, what was on the phone is kept here,
 * compressed (gzip of the backup JSON), so the restore can be undone. Never part of a backup.
 */
export type SafetyRow = SafetyInfo | { id: 'data'; bytes: Uint8Array<ArrayBuffer> };

/** An employee's code (salted PBKDF2 hash) and wrong tries. Only on the phone: never in a backup. */
export interface StaffPinRow {
  id: string;
  salt: string;
  hash: string;
  fails?: number;
  waitUntil?: number;
}

export class CaixaDB extends Dexie {
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;
  sales!: Table<Sale, string>;
  creditPayments!: Table<CreditPayment, string>;
  stockMovements!: Table<StockMovement, string>;
  audit!: Table<AuditEntry, string>;
  settings!: Table<Settings, string>;
  meta!: Table<MetaRow, string>;
  expenses!: Table<Expense, string>;
  cashCloses!: Table<CashClose, string>;
  suppliers!: Table<Supplier, string>;
  purchases!: Table<Purchase, string>;
  supplierPayments!: Table<SupplierPayment, string>;
  inssContributions!: Table<InssContribution, string>;
  safety!: Table<SafetyRow, string>;
  returns!: Table<SaleReturn, string>;
  batches!: Table<Batch, string>;
  staff!: Table<StaffMember, string>;
  staffPins!: Table<StaffPinRow, string>;

  constructor(name: string) {
    // No query cache: it copies and tracks every record a live screen reads (thousands of sales),
    // which is slow on cheap phones. Screens still update after each change, once it is saved.
    super(name, { cache: 'disabled' });
    this.version(1).stores({
      products: 'id, name, barcode, updatedAt',
      customers: 'id, name, updatedAt',
      sales: 'id, createdAt, customerId, method, updatedAt',
      creditPayments: 'id, customerId, createdAt, updatedAt',
      stockMovements: 'id, productId, createdAt',
      audit: 'id, [entity+entityId], createdAt',
      settings: 'id',
      meta: 'key',
    });
    // v2: every credit sale has a due date. Older ones get the default term from their purchase date.
    this.version(2)
      .stores({ sales: 'id, createdAt, customerId, method, updatedAt' })
      .upgrade((tx) =>
        tx
          .table<Sale, string>('sales')
          .toCollection()
          .modify((s) => {
            if (s.method === 'credit' && !s.dueDate) s.dueDate = dueDateOf(s);
          }),
      );
    // v3: money going out of the shop (expenses, owner's withdrawals) and end-of-day cash counts.
    this.version(3).stores({
      expenses: 'id, createdAt, category, updatedAt',
      cashCloses: 'id, day, createdAt',
    });
    // v4: suppliers, purchases (stock in, with cost) and payments of what the shop owes them.
    this.version(4).stores({
      suppliers: 'id, name, updatedAt',
      purchases: 'id, createdAt, supplierId, updatedAt',
      supplierPayments: 'id, supplierId, createdAt',
    });
    // v5: products have an optional category, indexed to list the categories without reading every product.
    this.version(5).stores({ products: 'id, name, barcode, category, updatedAt' });
    // v6: the owner's INSS contributions (the plan itself is kept in the settings).
    this.version(6).stores({ inssContributions: 'id, month, createdAt' });
    // v7: the safety copy kept before restoring a backup (to undo it). Not a business table: never backed up.
    this.version(7).stores({ safety: 'id' });
    // v8: goods given back by customers (all or part of a sale).
    this.version(8).stores({ returns: 'id, saleId, createdAt' });
    // v9: electronic payments to confirm later, indexed to find them without reading every sale.
    this.version(9).stores({ sales: 'id, createdAt, customerId, method, updatedAt, pendingSince' });
    // v10: expiry dates of the stock of products that follow them (optional).
    this.version(10).stores({ batches: 'id, productId, createdAt' });
    // v11: employees on the shop's phone (off by default), and their codes, kept only on the phone.
    this.version(11).stores({ staff: 'id, name', staffPins: 'id' });
  }
}

export const TABLES = [
  'products',
  'customers',
  'sales',
  'creditPayments',
  'stockMovements',
  'audit',
  'settings',
  'meta',
  'expenses',
  'cashCloses',
  'suppliers',
  'purchases',
  'supplierPayments',
  'inssContributions',
  'returns',
  'batches',
  'staff',
] as const;
/** Tables added after the first version: older backups do not have them (read as empty). */
export const LATER_TABLES: readonly TableName[] = [
  'expenses',
  'cashCloses',
  'suppliers',
  'purchases',
  'supplierPayments',
  'inssContributions',
  'returns',
  'batches',
  'staff',
];
export type TableName = (typeof TABLES)[number];
