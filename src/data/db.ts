import Dexie, { type Table } from 'dexie';
import { dueDateOf } from '../domain/credit';
import type {
  AuditEntry,
  CashClose,
  CreditPayment,
  Customer,
  Expense,
  Product,
  Purchase,
  Sale,
  Settings,
  StockMovement,
  Supplier,
  SupplierPayment,
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

  constructor(name: string) {
    super(name);
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
] as const;
/** Tables added after the first version: older backups do not have them (read as empty). */
export const LATER_TABLES: readonly TableName[] = ['expenses', 'cashCloses', 'suppliers', 'purchases', 'supplierPayments'];
export type TableName = (typeof TABLES)[number];
