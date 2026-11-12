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
  /** Optional cost price (what the shop pays the supplier), per unit or per kg. Used only for profit. */
  costCents?: Cents;
  /** Manufacturer's code, or an in-store code made by the app (EAN-13 starting with 20). */
  barcode?: string;
  /** 'weight': sold by the kilo. Price is per kg; stock and minimum are in GRAMS. Chosen at creation. */
  soldBy?: 'weight';
  /** Current quantity on hand (whole units, or grams). Kept in sync with StockMovement. */
  stock: number;
  minStock: number;
  /** Soft delete: archived products disappear from lists but keep their history. */
  archivedAt?: IsoDate;
  /** Usual supplier: the one of the last purchase (used to split orders by supplier). */
  supplierId?: string;
  /** Optional group ("Bebidas", "Mercearia"…) to find products faster and see sales by group. */
  category?: string;
  /** Follows its expiry dates (pharmacies, food): stock coming in asks for a date. Off by default. */
  tracksExpiry?: boolean;
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
  /** This customer's own credit limit (overrides the shop's usual one). */
  creditLimitCents?: Cents;
}

export const PAYMENT_METHODS = [
  'cash',
  'kwik',
  'multicaixa_express',
  'unitel_money',
  'afrimoney',
  'paypay',
  'transfer',
  'tpa',
  'credit',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Paid through a payment provider licensed by the BNA (simulated in phase 1): the app asks for the
 * payment. Bank transfers and the card terminal (TPA) are only recorded: the shop checks that the
 * money arrived, in the bank or on the terminal. Only these count as "digital" for credit for stock
 * (the retention happens at the provider), as the conditions of that credit say.
 */
export const PROVIDER_METHODS = ['kwik', 'multicaixa_express', 'unitel_money', 'afrimoney', 'paypay'] as const;
export type ProviderMethod = (typeof PROVIDER_METHODS)[number];
export const isProviderMethod = (m: PaymentMethod): m is ProviderMethod => (PROVIDER_METHODS as readonly string[]).includes(m);

/** Paid by an electronic means (provider, bank transfer or TPA): neither cash nor credit. */
export const isElectronic = (m: PaymentMethod) => m !== 'cash' && m !== 'credit';

export interface SaleItem {
  productId: string;
  /** Snapshot of name and price at sale time, so later edits don't change history. */
  name: string;
  unitPriceCents: Cents;
  quantity: number;
  lineTotalCents: Cents;
  /** 'weight': quantity is in grams and unitPriceCents is the price per kg. */
  soldBy?: 'weight';
  /** Cost price on the day of the sale (per unit or per kg), for the profit. Never sent to partners. */
  unitCostCents?: Cents;
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
  /** Credit sale accepted above the customer's credit limit (with the owner code when there is one). */
  creditLimitOverride?: { limitCents: Cents; balanceBeforeCents: Cents };
  /** Cash only: amount handed over by the customer, to compute change. */
  cashReceivedCents?: Cents;
  /**
   * Electronic payments the money of which had not arrived yet when the sale was recorded ("por
   * confirmar"): when it was recorded that way, and when the shop confirmed the money arrived.
   */
  pendingSince?: IsoDate;
  confirmedAt?: IsoDate;
  /** "O pagamento não entrou": the voided sale points to the one recorded in its place, and back. */
  replacedBySaleId?: string;
  replacesSaleId?: string;
  /** Credit sales only: the day the customer must pay by ("YYYY-MM-DD", the phone's calendar). */
  dueDate?: string;
  /** Voided sales stay in history but no longer count (totals, stock, fiado). */
  voidedAt?: IsoDate;
  voidReason?: string;
}

/** A payment towards a customer's fiado balance. */
/**
 * What lowers what a customer owes: a payment (money in), or 'return' when goods bought on credit
 * came back (no money moves: see SaleReturn). Sums of money received leave returns out (`isMoneyIn`).
 */
export interface CreditPayment extends BaseRecord {
  customerId: string;
  amountCents: Cents;
  method: Exclude<PaymentMethod, 'credit'> | 'return';
  /** Electronic payments: reference shown on the customer's phone (optional). */
  transactionRef?: string;
  /** method 'return': the return that lowered the debt. */
  returnId?: string;
  deviceId?: string;
}

/**
 * Stock of a product that follows its dates, as it came in: with its expiry date, or without one.
 * What is left of each batch is worked out from the stock (src/domain/expiry.ts), so a sale never
 * says which batch it took.
 */
export interface Batch extends BaseRecord {
  productId: string;
  /** Units, or grams, that came in. */
  quantity: number;
  /** "YYYY-MM-DD"; undefined when it came in without a date. */
  expiresOn?: string;
  /** A stock entry, a purchase, or stock already on the shelf when its date was given (the oldest). */
  source: 'entry' | 'purchase' | 'shelf';
  purchaseId?: string;
  /** Voided with its purchase, or removed as a mistake: it no longer counts. */
  voidedAt?: IsoDate;
  deviceId?: string;
}

/** An electronic payment still waiting for the shop to confirm the money arrived (voided sales never wait). */
export const isPaymentPending = (s: Pick<Sale, 'pendingSince' | 'confirmedAt' | 'voidedAt'>) =>
  !!s.pendingSince && !s.confirmedAt && !s.voidedAt;

/** A customer payment that brought money in (not goods returned from a credit sale). */
export const isMoneyIn = (p: Pick<CreditPayment, 'method'>) => p.method !== 'return';

/** One line of a return: how much of a sale line came back and the money it gave back. */
export interface ReturnItem {
  productId: string;
  name: string;
  /** Units, or grams for weighed products. */
  quantity: number;
  soldBy?: 'weight';
  /** Money back for this line (proportional to what the line cost in the sale). */
  refundCents: Cents;
  /** What these goods cost the shop (from the sale line), when the cost was known. */
  costCents?: Cents;
}

/**
 * Goods given back by a customer, all or part of a sale. The sale itself never changes.
 * The money goes back from the till ('cash'), another way ('other': transfer, TPA, phone), or,
 * for a credit sale, lowers what the customer owes ('debt'). Restocked goods go back on the shelf.
 */
export interface SaleReturn extends BaseRecord {
  /** Sequential per device, for humans ("Devolução n.º 3"). */
  number: number;
  saleId: string;
  saleNumber: number;
  items: ReturnItem[];
  totalCents: Cents;
  refund: 'cash' | 'other' | 'debt';
  restock: boolean;
  reason: string;
  customerId?: string;
  deviceId?: string;
}

export type StockMovementType = 'sale' | 'entry' | 'adjustment' | 'void' | 'purchase' | 'purchase_void' | 'return';

export interface StockMovement extends BaseRecord {
  productId: string;
  type: StockMovementType;
  /** Signed change in quantity: negative for sales, positive for entries. */
  delta: number;
  /** Mandatory for adjustments. */
  reason?: string;
  saleId?: string;
  purchaseId?: string;
  returnId?: string;
}

export interface Supplier extends BaseRecord {
  name: string;
  /** Optional, only used to open WhatsApp (orders). Never sent to any external service. */
  phone?: string;
}

export interface PurchaseItem {
  productId: string;
  /** Snapshot of the name at purchase time. */
  name: string;
  /** Units, or grams when sold by weight. */
  quantity: number;
  soldBy?: 'weight';
  /** Cost paid per unit (or per kg). */
  unitCostCents: Cents;
  lineTotalCents: Cents;
  /** Products that follow their dates: the expiry date of these goods ("YYYY-MM-DD"). */
  expiresOn?: string;
}

/** How a purchase was paid: from the till, otherwise (bank, phone), or on credit with the supplier. */
export const PURCHASE_PAYMENTS = ['cash', 'other', 'credit'] as const;
export type PurchasePayment = (typeof PURCHASE_PAYMENTS)[number];

/** Goods received from a supplier: stock goes up and the cost price follows the last purchase. */
export interface Purchase extends BaseRecord {
  /** Sequential per device, only for humans ("Compra n.º 3"). */
  number: number;
  supplierId?: string;
  items: PurchaseItem[];
  totalCents: Cents;
  payment: PurchasePayment;
  /** On credit: the day the shop must pay the supplier ("YYYY-MM-DD"). */
  dueDate?: string;
  note?: string;
  deviceId?: string;
  voidedAt?: IsoDate;
  voidReason?: string;
}

/** A payment of what the shop owes a supplier (credit purchases). */
export interface SupplierPayment extends BaseRecord {
  supplierId: string;
  amountCents: Cents;
  /** True when the money came out of the till. */
  fromCash: boolean;
  deviceId?: string;
}

/**
 * Money leaving the shop. Expenses lower the day's result; the owner's withdrawal does not
 * (it is the owner's money), but both lower the cash expected in the till when paid from it.
 * 'inss' is money set aside for the owner's INSS contribution: like a withdrawal, not an expense.
 */
export const EXPENSE_CATEGORIES = [
  'transport',
  'rent',
  'energy',
  'water',
  'salary',
  'fees',
  'phone',
  'other',
  'withdrawal',
  'inss',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense extends BaseRecord {
  category: ExpenseCategory;
  amountCents: Cents;
  /** True when the money came out of the till. */
  fromCash: boolean;
  note?: string;
  deviceId?: string;
  /** Mistakes are voided with a reason, never deleted. */
  voidedAt?: IsoDate;
  voidReason?: string;
}

/** 'normal': old age, survivors, funeral (8%). 'extended': also maternity and death grant (11%). */
export type InssModality = 'normal' | 'extended';

/**
 * The owner's own plan to contribute to the INSS as a self-employed worker (optional).
 * Personal data: it stays on the phone and is never part of the pilot summary.
 */
export interface InssPlan {
  /** Declared monthly income, as a whole number of national minimum wages (1 to 35). */
  wages: number;
  modality: InssModality;
  /** First month followed in the app, "YYYY-MM". */
  startMonth: string;
  /** Year of birth, to estimate the years left until retirement. */
  birthYear?: number;
  /** Months already contributed before using the app. */
  monthsBefore?: number;
  /** Social security number (optional). */
  number?: string;
}

/** A monthly contribution the owner says was paid to the INSS. The shop's own record, not an INSS document. */
export interface InssContribution extends BaseRecord {
  /** The month the contribution is for, "YYYY-MM". */
  month: string;
  amountCents: Cents;
  /** Declared income that month (the pension is computed from it). */
  baseCents: Cents;
  /** The day it was paid, "YYYY-MM-DD". */
  paidOn: string;
  /** Number of the payment receipt (optional). */
  receipt?: string;
  /** How much of the money set aside ('inss' outflows) this payment used. */
  savedUsedCents: Cents;
  /** Outflow recorded with it, when the rest of the money came out of the till. */
  expenseId?: string;
  deviceId?: string;
  /** Mistakes are voided with a reason, never deleted. */
  voidedAt?: IsoDate;
  voidReason?: string;
}

/** End-of-day count: the cash the till should have against the cash counted. */
export interface CashClose extends BaseRecord {
  /** The local day that was closed, "YYYY-MM-DD". */
  day: string;
  /** Opening float: the change the till started the day with (0 = none). */
  floatCents: Cents;
  /** Float + cash sales + customers' cash payments − money out of the till. */
  expectedCents: Cents;
  countedCents: Cents;
  /** Counted − expected: above zero = money left over, below zero = money missing. */
  differenceCents: Cents;
  note?: string;
  deviceId?: string;
}

export interface AuditEntry extends BaseRecord {
  entity:
    | 'product'
    | 'customer'
    | 'sale'
    | 'credit_payment'
    | 'stock_movement'
    | 'settings'
    | 'data'
    | 'expense'
    | 'cash_close'
    | 'supplier'
    | 'purchase'
    | 'supplier_payment'
    | 'inss_contribution'
    | 'return'
    | 'batch';
  entityId: string;
  action: 'created' | 'updated' | 'archived' | 'voided' | 'imported' | 'reset' | 'counted' | 'confirmed';
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
  /** Usual credit limit per customer; none = no limit (the owner chooses it). */
  creditLimitCents?: Cents;
  /** Usual opening float: the change the till starts each day with (none = no float). */
  cashFloatCents?: Cents;
  /** WhatsApp number of whoever runs the pilot (receives the pilot summary). Optional. */
  pilotPhone?: string;
  /**
   * Credit for stock (phase 4): minimum share of digital receipts the contract asks for, in basis
   * points (4000 = 40%). None = no contract. In phase 4 it comes from the contract, not from the shop.
   */
  digitalMinShareBp?: number;
  /** The owner's plan to contribute to the INSS (optional; none = not used). */
  inss?: InssPlan;
  /**
   * The cost price after a purchase: none = the cost of the last purchase (the usual, simplest rule);
   * 'average' = the average of what is on the shelf and what came in (optional, off by default).
   */
  costMethod?: 'average';
  // ---- Optional data for certified invoicing (phase 3) ----
  address?: string;
  vatRegime?: VatRegime;
  /** Usual IVA rate in basis points (1400 = 14%), used for products without their own rate. */
  defaultTaxRateBp?: number;
}
