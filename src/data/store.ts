import { cartItems, cartTotal, type Cart } from '../domain/cart';
import { adjustmentDelta, validateEntry, type StockChangeError } from '../domain/stock';
import { checkCreditLimit, creditBook, DEFAULT_TERM_DAYS, dueDateFromTerm, totalOutstanding } from '../domain/credit';
import { addDays, isValidDateString, startOfLocalDay, toLocalDateString } from '../lib/dates';
import { drawer, closeResult, summariseOutflows, type Drawer } from '../domain/cash';
import { byName } from '../domain/ranking';
import { normaliseNif } from '../domain/nif';
import { MAX_GRAMS } from '../domain/quantity';
import { checkIntegrity, type IntegrityIssue } from '../domain/integrity';
import { hashPin, isValidPin, newSalt, verifyPin } from '../domain/pin';
import { internalBarcode } from '../domain/barcode';
import type {
  AuditEntry,
  CashClose,
  CreditPayment,
  Customer,
  Expense,
  ExpenseCategory,
  PaymentMethod,
  Product,
  Purchase,
  PurchaseItem,
  PurchasePayment,
  Sale,
  SaleItem,
  Settings,
  StockMovement,
  Supplier,
  SupplierPayment,
} from '../domain/types';
import { CURRENCY, EXPENSE_CATEGORIES, PURCHASE_PAYMENTS } from '../domain/types';
import { purchaseLineTotal } from '../domain/purchases';
import { payablesBook, payableStatus, totalPayable } from '../domain/payables';
import { uuid } from '../lib/ids';
import { CaixaDB } from './db';

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

export class DomainError extends Error {
  constructor(public readonly code: string) {
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
}

/** IVA in basis points: whole number from 0 to 10000 (0% to 100%). */
const validTaxRate = (bp: number | undefined) => bp === undefined || (Number.isInteger(bp) && bp >= 0 && bp <= 10_000);
const cleanShort = (s: string | undefined, max: number) => clean(s)?.slice(0, max);

export interface NewPurchase {
  supplierId?: string;
  lines: { productId: string; quantity: number; unitCostCents: number }[];
  payment: PurchasePayment;
  /** On credit: "YYYY-MM-DD"; when missing, the usual term (15 days). */
  dueDate?: string;
  note?: string;
}

export interface NewSale {
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

/** Owner code (PIN) is kept in `meta`, only as a salted hash. */
export const PIN_KEYS = ['ownerPinHash', 'ownerPinSalt'] as const;

/** References typed by people: trimmed, at most 60 characters, empty = none. */
export function cleanReference(ref: string | undefined): string | undefined {
  const v = ref?.trim().replace(/\s+/g, ' ');
  return v ? v.slice(0, 60) : undefined;
}

export const SETTINGS_ID = 'main';
export const DEFAULT_STORE_NAME = 'A minha loja';

const clean = (s: string | undefined) => {
  const v = s?.trim();
  return v ? v : undefined;
};

/**
 * Repositories over the local database. Screens only talk to these, so the storage
 * can later be swapped for (or synchronised with) a server without touching the UI.
 * Every write is recorded in the audit log, inside the same transaction.
 */
export class Store {
  readonly db: CaixaDB;
  private readonly now: () => Date;

  constructor(db: CaixaDB, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  private stamp() {
    return this.now().toISOString();
  }

  /** What a customer owes now: valid credit sales minus payments (call inside a transaction with sales and creditPayments). */
  private async customerBalance(customerId: string): Promise<number> {
    const [sales, payments] = await Promise.all([
      this.db.sales.where('customerId').equals(customerId).toArray(),
      this.db.creditPayments.where('customerId').equals(customerId).toArray(),
    ]);
    const bought = sales.filter((x) => x.method === 'credit' && !x.voidedAt).reduce((a, x) => a + x.totalCents, 0);
    return bought - payments.reduce((a, p) => a + p.amountCents, 0);
  }

  /** Sale lines with the invoicing data that applies today (call inside the sale transaction). */
  private async snapshotItems(cart: Cart): Promise<SaleItem[]> {
    const settings = await this.db.settings.get(SETTINGS_ID);
    const items = cartItems(cart);
    const products = await this.db.products.bulkGet(items.map((i) => i.productId));
    return items.map((item, i) => {
      const p = products[i];
      // The product decides how it is sold: a stale cart line can never sell grams as units.
      if (p && (p.soldBy ?? 'unit') !== (item.soldBy ?? 'unit')) throw new DomainError('invalid_quantity');
      return {
        ...item,
        ...(p?.costCents !== undefined ? { unitCostCents: p.costCents } : {}),
        barcode: p?.barcode,
        unit: p?.unit,
        taxRateBp: p?.taxRateBp ?? settings?.defaultTaxRateBp,
        taxExemption: p?.taxExemption,
      };
    });
  }

  /** This phone's id, created once (call inside a transaction that includes `meta`). */
  private async deviceId(): Promise<string> {
    const row = await this.db.meta.get('deviceId');
    if (typeof row?.value === 'string') return row.value;
    const id = uuid();
    await this.db.meta.put({ key: 'deviceId', value: id });
    return id;
  }

  private audit(entry: Omit<AuditEntry, 'id' | 'createdAt' | 'updatedAt'>) {
    const at = this.stamp();
    return this.db.audit.add({ ...entry, id: uuid(), createdAt: at, updatedAt: at });
  }

  // ---------- Products ----------
  readonly products = {
    list: async (): Promise<Product[]> => (await this.db.products.toArray()).filter((p) => !p.archivedAt).sort(byName),
    get: (id: string) => this.db.products.get(id),
    findByBarcode: async (code: string): Promise<Product | undefined> => {
      const matches = await this.db.products.where('barcode').equals(code.trim()).toArray();
      return matches.find((p) => !p.archivedAt);
    },
    create: (input: ProductInput, initialStock = 0): Promise<Product> =>
      this.db.transaction('rw', [this.db.products, this.db.stockMovements, this.db.audit], async () => {
        await this.assertProduct(input);
        if (!Number.isInteger(initialStock) || initialStock < 0) throw new DomainError('invalid_stock');
        const at = this.stamp();
        const product: Product = {
          id: uuid(),
          name: input.name.trim(),
          priceCents: input.priceCents,
          ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
          ...(input.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
          barcode: clean(input.barcode),
          minStock: input.minStock,
          unit: cleanShort(input.unit, 10),
          taxRateBp: input.taxRateBp,
          taxExemption: cleanShort(input.taxExemption, 120),
          stock: 0, // raised by the initial-stock movement below
          createdAt: at,
          updatedAt: at,
        };
        await this.db.products.add(product);
        await this.audit({ entity: 'product', entityId: product.id, action: 'created', after: product });
        if (initialStock > 0) {
          await this.addMovement({ productId: product.id, type: 'entry', delta: initialStock, reason: 'Stock inicial' });
        }
        // Return the saved product (with the initial stock already applied).
        return (await this.db.products.get(product.id))!;
      }),
    update: (id: string, input: ProductInput): Promise<Product> =>
      this.db.transaction('rw', [this.db.products, this.db.audit], async () => {
        const before = await this.db.products.get(id);
        if (!before) throw new DomainError('not_found');
        await this.assertProduct(input, id);
        const after: Product = {
          ...before,
          name: input.name.trim(),
          priceCents: input.priceCents,
          barcode: clean(input.barcode),
          minStock: input.minStock,
          unit: cleanShort(input.unit, 10),
          taxRateBp: input.taxRateBp,
          taxExemption: cleanShort(input.taxExemption, 120),
          updatedAt: this.stamp(),
        };
        // The cost price changes only when the form sends it (undefined clears it).
        if ('costCents' in input) {
          if (input.costCents === undefined) delete after.costCents;
          else after.costCents = input.costCents;
        }
        await this.db.products.put(after);
        await this.audit({ entity: 'product', entityId: id, action: 'updated', before, after });
        return after;
      }),
    archive: (id: string) =>
      this.db.transaction('rw', [this.db.products, this.db.audit], async () => {
        const before = await this.db.products.get(id);
        if (!before) throw new DomainError('not_found');
        const at = this.stamp();
        const after = { ...before, archivedAt: at, updatedAt: at };
        await this.db.products.put(after);
        await this.audit({ entity: 'product', entityId: id, action: 'archived', before, after });
      }),
    addEntry: (id: string, quantity: number) =>
      this.db.transaction('rw', [this.db.products, this.db.stockMovements, this.db.audit], async () => {
        const err = validateEntry(quantity);
        if (err) throw new DomainError(err);
        await this.addMovement({ productId: id, type: 'entry', delta: quantity });
      }),
    adjust: (id: string, countedQuantity: number, reason: string) =>
      this.db.transaction('rw', [this.db.products, this.db.stockMovements, this.db.audit], async () => {
        const product = await this.db.products.get(id);
        if (!product) throw new DomainError('not_found');
        const result = adjustmentDelta(product.stock, countedQuantity, reason);
        if ('error' in result) throw new DomainError(result.error satisfies StockChangeError);
        await this.addMovement({ productId: id, type: 'adjustment', delta: result.delta, reason: reason.trim() });
      }),
    movements: (productId: string) => this.db.stockMovements.where('productId').equals(productId).reverse().sortBy('createdAt'),
    /**
     * Next free in-store barcode (EAN-13 starting with 20). The number is reserved at once,
     * so two products never get the same code, even if the form is cancelled.
     */
    nextInternalBarcode: (): Promise<string> =>
      this.db.transaction('rw', [this.db.products, this.db.meta], () => this.reserveInternalBarcode()),
    /** Gives an in-store barcode to each of these products that has none. Audited. Returns how many got one. */
    assignInternalBarcodes: (ids: string[]): Promise<number> =>
      this.db.transaction('rw', [this.db.products, this.db.meta, this.db.audit], async () => {
        let count = 0;
        for (const id of ids) {
          const before = await this.db.products.get(id);
          if (!before || before.archivedAt || clean(before.barcode)) continue;
          const after: Product = { ...before, barcode: await this.reserveInternalBarcode(), updatedAt: this.stamp() };
          await this.db.products.put(after);
          await this.audit({ entity: 'product', entityId: id, action: 'updated', before, after });
          count += 1;
        }
        return count;
      }),
  };

  /** Call inside a transaction with products and meta. Skips codes already used by any product. */
  private async reserveInternalBarcode(): Promise<string> {
    const row = await this.db.meta.get('barcodeSeq');
    let seq = typeof row?.value === 'number' ? row.value : 0;
    let code: string;
    do {
      seq += 1;
      code = internalBarcode(seq);
    } while ((await this.db.products.where('barcode').equals(code).count()) > 0);
    await this.db.meta.put({ key: 'barcodeSeq', value: seq });
    return code;
  }

  private async assertProduct(input: ProductInput, selfId?: string) {
    if (!input.name.trim()) throw new DomainError('name_required');
    if (input.soldBy !== undefined && input.soldBy !== 'weight') throw new DomainError('invalid_sold_by');
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new DomainError('invalid_price');
    if (input.costCents !== undefined && (!Number.isInteger(input.costCents) || input.costCents < 0)) throw new DomainError('invalid_cost');
    if (!Number.isInteger(input.minStock) || input.minStock < 0) throw new DomainError('invalid_stock');
    if (!validTaxRate(input.taxRateBp)) throw new DomainError('invalid_tax');
    const code = clean(input.barcode);
    if (code) {
      const same = await this.db.products.where('barcode').equals(code).toArray();
      if (same.some((p) => p.id !== selfId && !p.archivedAt)) throw new DomainError('duplicate_barcode');
    }
  }

  /** Records a movement and updates the product's stock projection. Call inside a transaction. */
  private async addMovement(m: Omit<StockMovement, 'id' | 'createdAt' | 'updatedAt'>) {
    const product = await this.db.products.get(m.productId);
    if (!product) throw new DomainError('not_found');
    const at = this.stamp();
    const movement: StockMovement = { ...m, id: uuid(), createdAt: at, updatedAt: at };
    await this.db.stockMovements.add(movement);
    await this.db.products.update(m.productId, { stock: product.stock + m.delta, updatedAt: at });
    await this.audit({ entity: 'stock_movement', entityId: movement.id, action: 'created', after: movement });
  }

  // ---------- Customers ----------
  readonly customers = {
    list: async (): Promise<Customer[]> => (await this.db.customers.toArray()).sort(byName),
    get: (id: string) => this.db.customers.get(id),
    create: (name: string, phone?: string): Promise<Customer> =>
      this.db.transaction('rw', [this.db.customers, this.db.audit], async () => {
        if (!name.trim()) throw new DomainError('name_required');
        const at = this.stamp();
        const customer: Customer = { id: uuid(), name: name.trim(), phone: clean(phone), createdAt: at, updatedAt: at };
        await this.db.customers.add(customer);
        await this.audit({ entity: 'customer', entityId: customer.id, action: 'created', after: customer });
        return customer;
      }),
    markReminded: (id: string): Promise<void> =>
      this.db.transaction('rw', [this.db.customers, this.db.audit], async () => {
        const before = await this.db.customers.get(id);
        if (!before) throw new DomainError('not_found');
        const at = this.stamp();
        const after: Customer = { ...before, lastRemindedAt: at, updatedAt: at };
        await this.db.customers.put(after);
        await this.audit({ entity: 'customer', entityId: id, action: 'updated', before, after });
      }),
    /** Updates only the fields given. */
    update: (id: string, changes: { name?: string; phone?: string; nif?: string; creditLimitCents?: number | null }): Promise<Customer> =>
      this.db.transaction('rw', [this.db.customers, this.db.audit], async () => {
        const before = await this.db.customers.get(id);
        if (!before) throw new DomainError('not_found');
        const after: Customer = { ...before, updatedAt: this.stamp() };
        if ('name' in changes) {
          if (!changes.name?.trim()) throw new DomainError('name_required');
          after.name = changes.name.trim();
        }
        if ('phone' in changes) after.phone = clean(changes.phone);
        if ('nif' in changes) {
          const nif = normaliseNif(changes.nif);
          if (!nif.ok) throw new DomainError('invalid_nif');
          after.nif = nif.value;
        }
        if ('creditLimitCents' in changes) {
          const limit = changes.creditLimitCents;
          if (limit === null || limit === undefined) delete after.creditLimitCents;
          else if (!Number.isInteger(limit) || limit < 0) throw new DomainError('invalid_limit');
          else after.creditLimitCents = limit;
        }
        await this.db.customers.put(after);
        await this.audit({ entity: 'customer', entityId: id, action: 'updated', before, after });
        return after;
      }),
  };

  // ---------- Sales ----------
  readonly sales = {
    list: () => this.db.sales.orderBy('createdAt').toArray(),
    since: (iso: string) => this.db.sales.where('createdAt').aboveOrEqual(iso).toArray(),
    byCustomer: (customerId: string) => this.db.sales.where('customerId').equals(customerId).toArray(),
    onCredit: () => this.db.sales.where('method').equals('credit').toArray(),
    get: (id: string) => this.db.sales.get(id),
    /** Sales with from <= createdAt < to (ISO strings). */
    between: (fromIso: string, toIso: string) => this.db.sales.where('createdAt').between(fromIso, toIso, true, false).toArray(),
    /**
     * Voids a sale: it stays in history, marked as voided, and stops counting.
     * The stock comes back through 'void' movements. A reason is mandatory.
     */
    void: (id: string, reason: string): Promise<Sale> =>
      this.db.transaction('rw', [this.db.sales, this.db.products, this.db.stockMovements, this.db.audit], async () => {
        const before = await this.db.sales.get(id);
        if (!before) throw new DomainError('not_found');
        if (before.voidedAt) throw new DomainError('already_voided');
        if (reason.trim().length < 3) throw new DomainError('reason_required');
        const at = this.stamp();
        const after: Sale = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
        await this.db.sales.put(after);
        await this.audit({ entity: 'sale', entityId: id, action: 'voided', before, after });
        for (const item of before.items) {
          await this.addMovement({ productId: item.productId, type: 'void', delta: item.quantity, reason: reason.trim(), saleId: id });
        }
        return after;
      }),
    /** Saves the sale, lowers stock and writes the audit log, all or nothing. */
    create: (input: NewSale): Promise<Sale> =>
      this.db.transaction(
        'rw',
        [
          this.db.sales,
          this.db.products,
          this.db.stockMovements,
          this.db.audit,
          this.db.meta,
          this.db.customers,
          this.db.settings,
          this.db.creditPayments,
        ],
        async () => {
          if (input.cart.length === 0) throw new DomainError('empty_cart');
          if (input.cart.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > MAX_GRAMS)) {
            throw new DomainError('invalid_quantity');
          }
          let dueDate: string | undefined;
          let creditLimitOverride: Sale['creditLimitOverride'];
          if (input.method === 'credit') {
            if (!input.customerId || !(await this.db.customers.get(input.customerId))) {
              throw new DomainError('customer_required');
            }
            const today = toLocalDateString(this.now());
            if (input.dueDate !== undefined && (!isValidDateString(input.dueDate) || input.dueDate < today)) {
              throw new DomainError('invalid_due_date');
            }
            const settings = await this.db.settings.get(SETTINGS_ID);
            dueDate = input.dueDate ?? dueDateFromTerm(settings?.creditTermDays ?? DEFAULT_TERM_DAYS, this.now());
            const customer = (await this.db.customers.get(input.customerId))!;
            const balanceBeforeCents = await this.customerBalance(input.customerId);
            const limit = checkCreditLimit({
              balanceCents: balanceBeforeCents,
              saleCents: cartTotal(input.cart),
              customerLimitCents: customer.creditLimitCents,
              shopLimitCents: settings?.creditLimitCents,
            });
            if (limit.exceedsByCents > 0) {
              if (!input.allowOverLimit) throw new DomainError('credit_limit');
              creditLimitOverride = { limitCents: limit.limitCents!, balanceBeforeCents };
            }
          }
          const counter = await this.db.meta.get('saleNumber');
          const number = (typeof counter?.value === 'number' ? counter.value : 0) + 1;
          await this.db.meta.put({ key: 'saleNumber', value: number });
          const at = this.stamp();
          const sale: Sale = {
            id: uuid(),
            number,
            items: await this.snapshotItems(input.cart),
            totalCents: cartTotal(input.cart),
            currency: CURRENCY,
            method: input.method,
            customerId: input.method === 'credit' ? input.customerId : undefined,
            dueDate,
            creditLimitOverride,
            paymentRef: input.paymentRef,
            transactionRef: input.method !== 'cash' && input.method !== 'credit' ? cleanReference(input.transactionRef) : undefined,
            deviceId: await this.deviceId(),
            cashReceivedCents: input.method === 'cash' ? input.cashReceivedCents : undefined,
            createdAt: at,
            updatedAt: at,
          };
          await this.db.sales.add(sale);
          await this.audit({ entity: 'sale', entityId: sale.id, action: 'created', after: sale });
          for (const item of sale.items) {
            await this.addMovement({ productId: item.productId, type: 'sale', delta: -item.quantity, saleId: sale.id });
          }
          return sale;
        },
      ),
  };

  // ---------- Fiado payments ----------
  readonly credit = {
    payments: () => this.db.creditPayments.orderBy('createdAt').toArray(),
    paymentsBetween: (fromIso: string, toIso: string) =>
      this.db.creditPayments.where('createdAt').between(fromIso, toIso, true, false).toArray(),
    /** Every customer with balance and payment situation, most urgent first. */
    book: async (now = new Date()) => {
      const [customers, sales, payments] = await Promise.all([this.customers.list(), this.sales.onCredit(), this.credit.payments()]);
      return creditBook(customers, sales, payments, now);
    },
    /** Total owed by all customers right now. */
    totalOwed: async (now = new Date()) => totalOutstanding(await this.credit.book(now)),
    byCustomer: (customerId: string) => this.db.creditPayments.where('customerId').equals(customerId).toArray(),
    addPayment: (
      customerId: string,
      amountCents: number,
      method: CreditPayment['method'],
      transactionRef?: string,
    ): Promise<CreditPayment> =>
      this.db.transaction('rw', [this.db.creditPayments, this.db.sales, this.db.audit, this.db.meta], async () => {
        if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('zero');
        const owed = await this.customerBalance(customerId);
        if (amountCents > owed) throw new DomainError('too_much');
        const at = this.stamp();
        const payment: CreditPayment = {
          id: uuid(),
          customerId,
          amountCents,
          method,
          transactionRef: method === 'cash' ? undefined : cleanReference(transactionRef),
          deviceId: await this.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.db.creditPayments.add(payment);
        await this.audit({ entity: 'credit_payment', entityId: payment.id, action: 'created', after: payment });
        return payment;
      }),
  };

  // ---------- Money out: expenses and the owner's withdrawals ----------
  readonly expenses = {
    list: () => this.db.expenses.orderBy('createdAt').toArray(),
    /** Records with from <= createdAt < to (ISO strings). */
    between: (fromIso: string, toIso: string) => this.db.expenses.where('createdAt').between(fromIso, toIso, true, false).toArray(),
    create: (input: { category: ExpenseCategory; amountCents: number; fromCash: boolean; note?: string }): Promise<Expense> =>
      this.db.transaction('rw', [this.db.expenses, this.db.audit, this.db.meta], async () => {
        if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) throw new DomainError('invalid_category');
        if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('invalid_amount');
        const at = this.stamp();
        const expense: Expense = {
          id: uuid(),
          category: input.category,
          amountCents: input.amountCents,
          fromCash: input.fromCash,
          note: cleanShort(input.note, 120),
          deviceId: await this.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.db.expenses.add(expense);
        await this.audit({ entity: 'expense', entityId: expense.id, action: 'created', after: expense });
        return expense;
      }),
    /** A mistake stays in the history, marked as voided, and stops counting. A reason is mandatory. */
    void: (id: string, reason: string): Promise<Expense> =>
      this.db.transaction('rw', [this.db.expenses, this.db.audit], async () => {
        const before = await this.db.expenses.get(id);
        if (!before) throw new DomainError('not_found');
        if (before.voidedAt) throw new DomainError('already_voided');
        if (reason.trim().length < 3) throw new DomainError('reason_required');
        const at = this.stamp();
        const after: Expense = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
        await this.db.expenses.put(after);
        await this.audit({ entity: 'expense', entityId: id, action: 'voided', before, after });
        return after;
      }),
  };

  // ---------- Cash in the till and the end-of-day count ----------
  readonly cash = {
    /** What the till should have on that local day (from the facts), with this opening float. */
    drawer: (day: Date, floatCents: number): Promise<Drawer> =>
      this.db.transaction('r', [this.db.sales, this.db.creditPayments, this.db.expenses, this.db.purchases, this.db.supplierPayments], () =>
        this.drawerOn(day, floatCents),
      ),
    /** Records the count. Expected cash is computed here, from the facts, never typed. Audited. */
    close: (input: { floatCents: number; countedCents: number; note?: string; day?: Date }): Promise<CashClose> =>
      this.db.transaction(
        'rw',
        [
          this.db.cashCloses,
          this.db.sales,
          this.db.creditPayments,
          this.db.expenses,
          this.db.purchases,
          this.db.supplierPayments,
          this.db.audit,
          this.db.meta,
        ],
        async () => {
          if (!Number.isInteger(input.floatCents) || input.floatCents < 0) throw new DomainError('invalid_float');
          if (!Number.isInteger(input.countedCents) || input.countedCents < 0) throw new DomainError('invalid_amount');
          const day = input.day ?? this.now();
          const d = await this.drawerOn(day, input.floatCents);
          const at = this.stamp();
          const close: CashClose = {
            id: uuid(),
            day: toLocalDateString(day),
            floatCents: input.floatCents,
            expectedCents: d.expectedCents,
            countedCents: input.countedCents,
            differenceCents: closeResult(d.expectedCents, input.countedCents).differenceCents,
            note: cleanShort(input.note, 120),
            deviceId: await this.deviceId(),
            createdAt: at,
            updatedAt: at,
          };
          await this.db.cashCloses.add(close);
          await this.audit({ entity: 'cash_close', entityId: close.id, action: 'created', after: close });
          return close;
        },
      ),
    /** The latest count of a local day ("YYYY-MM-DD"): if the day is closed twice, the last one counts. */
    lastClose: async (day: string): Promise<CashClose | undefined> =>
      (await this.db.cashCloses.where('day').equals(day).sortBy('createdAt')).at(-1),
    closes: () => this.db.cashCloses.orderBy('createdAt').toArray(),
  };

  /** Call inside a transaction that reads sales, creditPayments, expenses, purchases and supplierPayments. */
  private async drawerOn(day: Date, floatCents: number): Promise<Drawer> {
    const from = startOfLocalDay(day).toISOString();
    const to = addDays(startOfLocalDay(day), 1).toISOString();
    const [sales, payments, expenses, purchases, supplierPayments] = await Promise.all([
      this.db.sales.where('createdAt').between(from, to, true, false).toArray(),
      this.db.creditPayments.where('createdAt').between(from, to, true, false).toArray(),
      this.db.expenses.where('createdAt').between(from, to, true, false).toArray(),
      this.db.purchases.where('createdAt').between(from, to, true, false).toArray(),
      this.db.supplierPayments.where('createdAt').between(from, to, true, false).toArray(),
    ]);
    return drawer({
      floatCents,
      cashSalesCents: sales.filter((s) => s.method === 'cash' && !s.voidedAt).reduce((a, s) => a + s.totalCents, 0),
      cashCreditPaymentsCents: payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amountCents, 0),
      cashOutCents: summariseOutflows(expenses).cashOutCents,
      cashPurchasesCents: tillPurchasesCents(purchases, supplierPayments),
    });
  }

  // ---------- Suppliers, purchases and what the shop owes them ----------
  readonly suppliers = {
    list: async (): Promise<Supplier[]> => (await this.db.suppliers.toArray()).sort(byName),
    get: (id: string) => this.db.suppliers.get(id),
    create: (name: string, phone?: string): Promise<Supplier> =>
      this.db.transaction('rw', [this.db.suppliers, this.db.audit], async () => {
        if (!name.trim()) throw new DomainError('name_required');
        const at = this.stamp();
        const supplier: Supplier = { id: uuid(), name: name.trim(), phone: clean(phone), createdAt: at, updatedAt: at };
        await this.db.suppliers.add(supplier);
        await this.audit({ entity: 'supplier', entityId: supplier.id, action: 'created', after: supplier });
        return supplier;
      }),
    update: (id: string, changes: { name?: string; phone?: string }): Promise<Supplier> =>
      this.db.transaction('rw', [this.db.suppliers, this.db.audit], async () => {
        const before = await this.db.suppliers.get(id);
        if (!before) throw new DomainError('not_found');
        const after: Supplier = { ...before, updatedAt: this.stamp() };
        if ('name' in changes) {
          if (!changes.name?.trim()) throw new DomainError('name_required');
          after.name = changes.name.trim();
        }
        if ('phone' in changes) after.phone = clean(changes.phone);
        await this.db.suppliers.put(after);
        await this.audit({ entity: 'supplier', entityId: id, action: 'updated', before, after });
        return after;
      }),
  };

  readonly purchases = {
    list: () => this.db.purchases.orderBy('createdAt').toArray(),
    get: (id: string) => this.db.purchases.get(id),
    between: (fromIso: string, toIso: string) => this.db.purchases.where('createdAt').between(fromIso, toIso, true, false).toArray(),
    bySupplier: (supplierId: string) => this.db.purchases.where('supplierId').equals(supplierId).toArray(),
    /**
     * Goods received: stock goes up (one movement per line), each product's cost price becomes the
     * cost of this purchase and its usual supplier this one. All or nothing, audited.
     */
    create: (input: NewPurchase): Promise<Purchase> =>
      this.db.transaction(
        'rw',
        [this.db.purchases, this.db.products, this.db.stockMovements, this.db.audit, this.db.meta, this.db.suppliers],
        async () => {
          if (input.lines.length === 0) throw new DomainError('empty_purchase');
          if (!(PURCHASE_PAYMENTS as readonly string[]).includes(input.payment)) throw new DomainError('invalid_payment');
          if (input.supplierId && !(await this.db.suppliers.get(input.supplierId))) throw new DomainError('supplier_required');
          let dueDate: string | undefined;
          if (input.payment === 'credit') {
            if (!input.supplierId) throw new DomainError('supplier_required');
            const today = toLocalDateString(this.now());
            if (input.dueDate !== undefined && (!isValidDateString(input.dueDate) || input.dueDate < today)) {
              throw new DomainError('invalid_due_date');
            }
            dueDate = input.dueDate ?? dueDateFromTerm(DEFAULT_TERM_DAYS, this.now());
          }
          const items: PurchaseItem[] = [];
          for (const line of input.lines) {
            const product = await this.db.products.get(line.productId);
            if (!product || product.archivedAt) throw new DomainError('not_found');
            if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > MAX_GRAMS)
              throw new DomainError('invalid_quantity');
            if (!Number.isInteger(line.unitCostCents) || line.unitCostCents < 0) throw new DomainError('invalid_cost');
            if (items.some((i) => i.productId === line.productId)) throw new DomainError('duplicate_line');
            const item: PurchaseItem = {
              productId: product.id,
              name: product.name,
              quantity: line.quantity,
              ...(product.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
              unitCostCents: line.unitCostCents,
              lineTotalCents: 0,
            };
            item.lineTotalCents = purchaseLineTotal(item);
            items.push(item);
          }
          const counter = await this.db.meta.get('purchaseNumber');
          const number = (typeof counter?.value === 'number' ? counter.value : 0) + 1;
          await this.db.meta.put({ key: 'purchaseNumber', value: number });
          const at = this.stamp();
          const purchase: Purchase = {
            id: uuid(),
            number,
            supplierId: input.supplierId,
            items,
            totalCents: items.reduce((a, i) => a + i.lineTotalCents, 0),
            payment: input.payment,
            dueDate,
            note: cleanShort(input.note, 120),
            deviceId: await this.deviceId(),
            createdAt: at,
            updatedAt: at,
          };
          await this.db.purchases.add(purchase);
          await this.audit({ entity: 'purchase', entityId: purchase.id, action: 'created', after: purchase });
          for (const item of items) {
            await this.addMovement({ productId: item.productId, type: 'purchase', delta: item.quantity, purchaseId: purchase.id });
            const before = (await this.db.products.get(item.productId))!;
            const after: Product = { ...before, costCents: item.unitCostCents, updatedAt: this.stamp() };
            if (input.supplierId) after.supplierId = input.supplierId;
            if (after.costCents !== before.costCents || after.supplierId !== before.supplierId) {
              await this.db.products.put(after);
              await this.audit({ entity: 'product', entityId: item.productId, action: 'updated', before, after });
            }
          }
          return purchase;
        },
      ),
    /** A mistake stays in the history as voided; the stock goes back down. A reason is mandatory. */
    void: (id: string, reason: string): Promise<Purchase> =>
      this.db.transaction('rw', [this.db.purchases, this.db.products, this.db.stockMovements, this.db.audit], async () => {
        const before = await this.db.purchases.get(id);
        if (!before) throw new DomainError('not_found');
        if (before.voidedAt) throw new DomainError('already_voided');
        if (reason.trim().length < 3) throw new DomainError('reason_required');
        const at = this.stamp();
        const after: Purchase = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
        await this.db.purchases.put(after);
        await this.audit({ entity: 'purchase', entityId: id, action: 'voided', before, after });
        for (const item of before.items) {
          await this.addMovement({
            productId: item.productId,
            type: 'purchase_void',
            delta: -item.quantity,
            reason: reason.trim(),
            purchaseId: id,
          });
        }
        return after;
      }),
  };

  readonly supplierPayments = {
    list: () => this.db.supplierPayments.orderBy('createdAt').toArray(),
    bySupplier: (supplierId: string) => this.db.supplierPayments.where('supplierId').equals(supplierId).toArray(),
    between: (fromIso: string, toIso: string) => this.db.supplierPayments.where('createdAt').between(fromIso, toIso, true, false).toArray(),
    add: (supplierId: string, amountCents: number, fromCash: boolean): Promise<SupplierPayment> =>
      this.db.transaction('rw', [this.db.supplierPayments, this.db.purchases, this.db.suppliers, this.db.audit, this.db.meta], async () => {
        if (!(await this.db.suppliers.get(supplierId))) throw new DomainError('not_found');
        if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('zero');
        const [purchases, payments] = await Promise.all([
          this.db.purchases.where('supplierId').equals(supplierId).toArray(),
          this.db.supplierPayments.where('supplierId').equals(supplierId).toArray(),
        ]);
        if (amountCents > payableStatus(supplierId, purchases, payments, this.now()).balanceCents) throw new DomainError('too_much');
        const at = this.stamp();
        const payment: SupplierPayment = {
          id: uuid(),
          supplierId,
          amountCents,
          fromCash,
          deviceId: await this.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.db.supplierPayments.add(payment);
        await this.audit({ entity: 'supplier_payment', entityId: payment.id, action: 'created', after: payment });
        return payment;
      }),
  };

  readonly payables = {
    /** Every supplier with what the shop owes, most urgent first. */
    book: async (now = new Date()) => {
      const [suppliers, purchases, payments] = await Promise.all([
        this.suppliers.list(),
        this.purchases.list(),
        this.supplierPayments.list(),
      ]);
      return payablesBook(suppliers, purchases, payments, now);
    },
    totalOwed: async (now = new Date()) => totalPayable(await this.payables.book(now)),
  };

  // ---------- Settings ----------
  readonly settings = {
    get: async (): Promise<Settings> => {
      const s = await this.db.settings.get(SETTINGS_ID);
      if (s) return s;
      const at = this.stamp();
      return { id: SETTINGS_ID, storeName: DEFAULT_STORE_NAME, createdAt: at, updatedAt: at };
    },
    /** Updates only the fields given (so saving the shop name never erases the payment term). */
    save: (
      input: Partial<
        Pick<
          Settings,
          | 'storeName'
          | 'phone'
          | 'nif'
          | 'creditTermDays'
          | 'creditLimitCents'
          | 'address'
          | 'vatRegime'
          | 'defaultTaxRateBp'
          | 'cashFloatCents'
          | 'pilotPhone'
        >
      >,
    ): Promise<Settings> =>
      this.db.transaction('rw', [this.db.settings, this.db.audit], async () => {
        const before = await this.db.settings.get(SETTINGS_ID);
        const at = this.stamp();
        const after: Settings = { storeName: DEFAULT_STORE_NAME, createdAt: at, ...before, id: SETTINGS_ID, updatedAt: at };
        if ('storeName' in input) {
          if (!input.storeName?.trim()) throw new DomainError('name_required');
          after.storeName = input.storeName.trim();
        }
        if ('phone' in input) after.phone = clean(input.phone);
        if ('pilotPhone' in input) after.pilotPhone = cleanShort(input.pilotPhone, 20);
        if ('nif' in input) {
          const nif = normaliseNif(input.nif);
          if (!nif.ok) throw new DomainError('invalid_nif');
          after.nif = nif.value;
        }
        if ('address' in input) after.address = cleanShort(input.address, 200);
        if ('vatRegime' in input) after.vatRegime = input.vatRegime;
        if ('defaultTaxRateBp' in input) {
          if (!validTaxRate(input.defaultTaxRateBp)) throw new DomainError('invalid_tax');
          after.defaultTaxRateBp = input.defaultTaxRateBp;
        }
        if ('creditLimitCents' in input) {
          const limit = input.creditLimitCents;
          if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new DomainError('invalid_limit');
          if (limit) after.creditLimitCents = limit;
          else delete after.creditLimitCents; // 0 or none = no limit
        }
        if ('cashFloatCents' in input) {
          const float = input.cashFloatCents;
          if (float !== undefined && (!Number.isInteger(float) || float < 0)) throw new DomainError('invalid_float');
          if (float) after.cashFloatCents = float;
          else delete after.cashFloatCents; // 0 or none = no float
        }
        if ('creditTermDays' in input) {
          const days = input.creditTermDays;
          if (days === undefined || !Number.isInteger(days) || days < 1 || days > 365) throw new DomainError('invalid_term');
          after.creditTermDays = days;
        }
        await this.db.settings.put(after);
        await this.audit({ entity: 'settings', entityId: SETTINGS_ID, action: 'updated', before, after });
        return after;
      }),
  };

  /** This phone's id (created once). Used to tell phones apart in the pilot and, later, in synchronisation. */
  readonly device = {
    id: (): Promise<string> => this.db.transaction('rw', [this.db.meta], () => this.deviceId()),
  };

  // ---------- Owner code (PIN) ----------
  readonly security = {
    hasPin: async () => !!(await this.db.meta.get('ownerPinHash')),
    verify: async (pin: string): Promise<boolean> => {
      const [hash, salt] = await Promise.all([this.db.meta.get('ownerPinHash'), this.db.meta.get('ownerPinSalt')]);
      if (typeof hash?.value !== 'string' || typeof salt?.value !== 'string') return true; // no code set
      return verifyPin(pin, salt.value, hash.value);
    },
    /** Sets or changes the code. Changing requires the current one. */
    setPin: async (newPin: string, currentPin?: string): Promise<void> => {
      if (!isValidPin(newPin)) throw new DomainError('invalid_pin');
      if ((await this.security.hasPin()) && !(await this.security.verify(currentPin ?? ''))) throw new DomainError('wrong_pin');
      const salt = newSalt();
      const hash = await hashPin(newPin, salt);
      await this.db.transaction('rw', [this.db.meta, this.db.audit], async () => {
        await this.db.meta.bulkPut([
          { key: 'ownerPinSalt', value: salt },
          { key: 'ownerPinHash', value: hash },
        ]);
        await this.audit({ entity: 'settings', entityId: 'owner_pin', action: 'updated', after: { pin: 'set' } });
      });
    },
    removePin: async (currentPin: string): Promise<void> => {
      if (!(await this.security.verify(currentPin))) throw new DomainError('wrong_pin');
      await this.db.transaction('rw', [this.db.meta, this.db.audit], async () => {
        await this.db.meta.bulkDelete([...PIN_KEYS]);
        await this.audit({ entity: 'settings', entityId: 'owner_pin', action: 'updated', after: { pin: 'removed' } });
      });
    },
  };

  // ---------- Checking the numbers ----------
  readonly integrity = {
    check: async (): Promise<IntegrityIssue[]> => {
      const [products, movements, sales, customers, payments] = await Promise.all([
        this.db.products.toArray(),
        this.db.stockMovements.toArray(),
        this.db.sales.toArray(),
        this.db.customers.toArray(),
        this.db.creditPayments.toArray(),
      ]);
      return checkIntegrity({ products, movements, sales, customers, payments });
    },
    /** Puts a product's stock back to the sum of its movements (the facts). Audited. */
    fixStock: (productId: string) =>
      this.db.transaction('rw', [this.db.products, this.db.stockMovements, this.db.audit], async () => {
        const before = await this.db.products.get(productId);
        if (!before) throw new DomainError('not_found');
        const computed = (await this.db.stockMovements.where('productId').equals(productId).toArray()).reduce((a, m) => a + m.delta, 0);
        if (computed === before.stock) return;
        const after: Product = { ...before, stock: computed, updatedAt: this.stamp() };
        await this.db.products.put(after);
        await this.audit({ entity: 'product', entityId: productId, action: 'updated', before, after });
      }),
  };

  readonly auditLog = {
    /** Most recent first. */
    recent: (limit = 300) => this.db.audit.orderBy('createdAt').reverse().limit(limit).toArray(),
    list: () => this.db.audit.orderBy('createdAt').toArray(),
  };
}
