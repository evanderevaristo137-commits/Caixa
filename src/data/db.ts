import Dexie, { type Table } from 'dexie';
import type { AuditEntry, CreditPayment, Customer, Product, Sale, Settings, StockMovement } from '../domain/types';

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
  }
}

export const TABLES = ['products', 'customers', 'sales', 'creditPayments', 'stockMovements', 'audit', 'settings', 'meta'] as const;
export type TableName = (typeof TABLES)[number];
