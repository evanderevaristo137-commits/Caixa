import { type Cart, type LineProblem } from '../../domain/cart';
import type { PaymentMethod, Purchase, PurchasePayment, SupplierPayment } from '../../domain/types';

/** Types, constants and small helpers of the Store, used by its repositories. */

/** Purchases paid in cash and supplier payments made with money from the till. */
export function tillPurchasesCents(
  purchases: Pick<Purchase, 'payment' | 'totalCents' | 'voidedAt'>[],
  supplierPayments: Pick<SupplierPayment, 'amountCents' | 'fromCash'>[],
): number {
  return (
    purchases.filter((p) => p.payment === 'cash' && !p.voidedAt).reduce((a, p) => a + p.totalCents, 0) +
    supplierPayments.filter((p) => p.fromCash).reduce((a, p) => a + p.amountCents, 0)
  );
}

/** Reason of the adjustments made by a stock count. */
export const STOCK_COUNT_REASON = 'Contagem de stock';

export class DomainError extends Error {
  /** `detail`: a number that goes with the code (e.g. the seconds to wait after wrong owner codes). */
  constructor(
    public readonly code: string,
    public readonly detail?: number,
  ) {
    super(code);
  }
}

export interface ProductInput {
  name: string;
  priceCents: number;
  /** Optional cost price (per unit, or per kg when sold by weight). Undefined = not known. */
  costCents?: number;
  barcode?: string;
  minStock: number;
  unit?: string;
  taxRateBp?: number;
  taxExemption?: string;
  /** Only used when creating: 'weight' = sold by the kilo (price per kg, stock in grams). */
  soldBy?: 'weight';
  /** Optional group ("Bebidas", "Mercearia"…). */
  category?: string;
}

/** IVA in basis points: whole number from 0 to 10000 (0% to 100%). */
export const validTaxRate = (bp: number | undefined) => bp === undefined || (Number.isInteger(bp) && bp >= 0 && bp <= 10_000);
export const cleanShort = (s: string | undefined, max: number) => clean(s)?.slice(0, max);

export interface NewPurchase {
  supplierId?: string;
  lines: { productId: string; quantity: number; unitCostCents: number }[];
  payment: PurchasePayment;
  /** On credit: "YYYY-MM-DD"; when missing, the usual term (15 days). */
  dueDate?: string;
  note?: string;
}

export interface NewSale {
  /**
   * Id of the sale, born with the cart on the screen. A cart that was already recorded is refused
   * ('duplicate_sale'), so a sale is never saved twice. Without it, a new id is made here.
   */
  id?: string;
  /**
   * What is being sold. Only the product and the quantity are taken from here: the name and the
   * price come from the product. The price the screen showed must still be the product's price.
   */
  cart: Cart;
  method: PaymentMethod;
  customerId?: string;
  paymentRef?: string;
  cashReceivedCents?: number;
  /** Credit sales: "YYYY-MM-DD". When missing, the shop's usual term is used. */
  dueDate?: string;
  /** Electronic payments: reference typed by the shopkeeper (optional). */
  transactionRef?: string;
  /** Credit sales: the shopkeeper confirmed going over the customer's credit limit. */
  allowOverLimit?: boolean;
}

/** Why the Store refuses a cart line (the screen must show the cart again). */
export const LINE_ERRORS: Record<LineProblem, string> = {
  unavailable: 'product_unavailable',
  sold_by: 'invalid_quantity',
  price: 'price_changed',
  amount: 'price_changed',
};

/** Owner code (PIN) is kept in `meta`, only as a salted hash, with the count of wrong codes in a row. */
export const PIN_KEYS = ['ownerPinHash', 'ownerPinSalt', 'ownerPinFails', 'ownerPinWaitUntil'] as const;

/**
 * How long a typed owner code allows sensitive actions. The screens close it as soon as the action
 * ends; this is only the limit, so the Store never stays open by mistake.
 */
export const OWNER_GRANT_MS = 2 * 60_000;

/** Result of checking an owner code. `waitSeconds`: too many wrong codes, try again after this. */
export type PinCheck = { ok: true } | { ok: false; waitSeconds?: number };

/**
 * The password of the backups is never kept: only the key made from it (PBKDF2), so the phone can
 * protect each new copy without asking. Whoever has the phone already sees the data; the key only
 * opens this shop's copies, and does not reveal the password (which may be used elsewhere).
 */
export const BACKUP_LOCK_KEY = 'backupLock';
export interface BackupLock {
  v: 1;
  /** base64 */
  salt: string;
  iterations: number;
  /** AES-256 key, base64 */
  key: string;
}

/** Rows of `meta` that belong to this phone: never in a backup, kept when a backup is restored. */
export const PHONE_ONLY_KEYS = [...PIN_KEYS, BACKUP_LOCK_KEY] as const;

/** Shortest password accepted for the backups (after spaces around it are dropped). */
export const BACKUP_PASSWORD_MIN = 8;

/** Reads the backup lock kept in `meta`; anything malformed counts as none. */
export function parseBackupLock(value: unknown): BackupLock | null {
  if (typeof value !== 'string') return null;
  try {
    const l = JSON.parse(value) as Partial<BackupLock>;
    return l.v === 1 && typeof l.salt === 'string' && typeof l.key === 'string' && Number.isInteger(l.iterations)
      ? { v: 1, salt: l.salt, key: l.key, iterations: l.iterations! }
      : null;
  } catch {
    return null;
  }
}

/** References typed by people: trimmed, at most 60 characters, empty = none. */
export function cleanReference(ref: string | undefined): string | undefined {
  const v = ref?.trim().replace(/\s+/g, ' ');
  return v ? v.slice(0, 60) : undefined;
}

export const SETTINGS_ID = 'main';
export const DEFAULT_STORE_NAME = 'A minha loja';

export const clean = (s: string | undefined) => {
  const v = s?.trim();
  return v ? v : undefined;
};
