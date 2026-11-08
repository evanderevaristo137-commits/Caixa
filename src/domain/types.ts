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
  // ---- Optional data for certified invoicing (phase 3, through an AGT-certified partner) ----
  /** Unit as written on invoices ("un", "kg", "L", "cx"…). Quantities stay whole numbers in phase 1. */
  unit?: string;
  /** IVA rate in basis points (1400 = 14%). Undefined = the shop's usual rate. */
  taxRateBp?: number;
  /** Exemption reason when the rate is 0, as the accountant or the partner indicates. */
  taxExemption?: string;
}

export interface Customer extends BaseRecord {
  name: string;
  /** Optional, only used to open WhatsApp. Never sent to any external service. */
  phone?: string;
  /** When the last WhatsApp reminder was opened, so the shopkeeper doesn't insist too often. */
  lastRemindedAt?: IsoDate;
  /** Optional NIF, for invoices issued in the customer's name (phase 3). Letters and digits. */
  nif?: string;
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
  // Snapshot of the invoicing data at sale time (an invoice must show what applied that day).
  barcode?: string;
  unit?: string;
  taxRateBp?: number;
  taxExemption?: string;
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
  /** Electronic payments: the reference shown on the customer's phone, typed by the shopkeeper (to check later with the bank). */
  transactionRef?: string;
  /** Which phone recorded it (for synchronisation in phase 2). */
  deviceId?: string;
  /** Phase 3: certified invoice (or credit note, after a void) obtained from the partner. */
  invoice?: InvoiceStatus;
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
  /** Electronic payments: reference shown on the customer's phone (optional). */
  transactionRef?: string;
  deviceId?: string;
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

export interface InvoiceStatus {
  status: 'pending' | 'issued' | 'failed';
  provider?: string;
  documentNumber?: string;
  issuedAt?: IsoDate;
  creditNoteNumber?: string;
  error?: string;
}

/** IVA regime of the shop, as the accountant says ("unknown" until filled in). */
export const VAT_REGIMES = ['unknown', 'general', 'simplified', 'exempt'] as const;
export type VatRegime = (typeof VAT_REGIMES)[number];

export interface Settings extends BaseRecord {
  storeName: string;
  phone?: string;
  /** Optional NIF, shown on the non-fiscal receipt only. */
  nif?: string;
  /** Usual payment term for credit sales, in days (default 15). */
  creditTermDays?: number;
  // ---- Optional data for certified invoicing (phase 3) ----
  address?: string;
  vatRegime?: VatRegime;
  /** Usual IVA rate in basis points (1400 = 14%), used for products without their own rate. */
  defaultTaxRateBp?: number;
}
