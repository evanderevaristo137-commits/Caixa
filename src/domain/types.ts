/**
 * Core records. Every record has a UUID and created/updated timestamps (ISO 8601, UTC)
 * so it can be synchronised with a server in a later phase.
 * Money is always an integer number of cêntimos (1 Kz = 100 cêntimos).
 */

export type Cents = number;
export type IsoDate = string;
export const CURRENCY = 'AOA' as const;

export interface BaseRecord {
  id: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface Product extends BaseRecord {
  name: string;
  priceCents: Cents;
  barcode?: string;
  /** Current quantity on hand (whole units). Kept in sync with StockMovement. */
  stock: number;
  minStock: number;
  /** Soft delete: archived products disappear from lists but keep their history. */
  archivedAt?: IsoDate;
}

export interface Customer extends BaseRecord {
  name: string;
  /** Optional, only used to open WhatsApp. Never sent to any external service. */
  phone?: string;
  /** When the last WhatsApp reminder was opened, so the shopkeeper doesn't insist too often. */
  lastRemindedAt?: IsoDate;
}

export const PAYMENT_METHODS = ['cash', 'kwik', 'multicaixa_express', 'unitel_money', 'afrimoney', 'paypay', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface SaleItem {
  productId: string;
  /** Snapshot of name and price at sale time, so later edits don't change history. */
  name: string;
  unitPriceCents: Cents;
  quantity: number;
  lineTotalCents: Cents;
}

export interface Sale extends BaseRecord {
  /** Sequential per device, only for humans ("Venda n.º 12"). */
  number: number;
  items: SaleItem[];
  totalCents: Cents;
  currency: typeof CURRENCY;
  method: PaymentMethod;
  /** Required when method is 'credit' (fiado). */
  customerId?: string;
  /** Reference returned by the PaymentProvider (test-only in phase 1). */
  paymentRef?: string;
  /** Cash only: amount handed over by the customer, to compute change. */
  cashReceivedCents?: Cents;
  /** Credit sales only: the day the customer must pay by ("YYYY-MM-DD", the phone's calendar). */
  dueDate?: string;
  /** Voided sales stay in history but no longer count (totals, stock, fiado). */
  voidedAt?: IsoDate;
  voidReason?: string;
}

/** A payment towards a customer's fiado balance. */
export interface CreditPayment extends BaseRecord {
  customerId: string;
  amountCents: Cents;
  method: Exclude<PaymentMethod, 'credit'>;
}

export type StockMovementType = 'sale' | 'entry' | 'adjustment' | 'void';

export interface StockMovement extends BaseRecord {
  productId: string;
  type: StockMovementType;
  /** Signed change in quantity: negative for sales, positive for entries. */
  delta: number;
  /** Mandatory for adjustments. */
  reason?: string;
  saleId?: string;
}

export interface AuditEntry extends BaseRecord {
  entity: 'product' | 'customer' | 'sale' | 'credit_payment' | 'stock_movement' | 'settings' | 'data';
  entityId: string;
  action: 'created' | 'updated' | 'archived' | 'voided' | 'imported' | 'reset';
  before?: unknown;
  after?: unknown;
}

export interface Settings extends BaseRecord {
  storeName: string;
  phone?: string;
  /** Optional NIF, shown on the non-fiscal receipt only. */
  nif?: string;
  /** Usual payment term for credit sales, in days (default 15). */
  creditTermDays?: number;
}
