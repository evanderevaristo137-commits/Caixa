import { cartItems, cartTotal, type Cart } from '../domain/cart';
import { adjustmentDelta, validateEntry, type StockChangeError } from '../domain/stock';
import { creditBook, totalOutstanding } from '../domain/credit';
import { byName } from '../domain/ranking';
import { normaliseNif } from '../domain/nif';
import type { AuditEntry, CreditPayment, Customer, PaymentMethod, Product, Sale, Settings, StockMovement } from '../domain/types';
import { CURRENCY } from '../domain/types';
import { uuid } from '../lib/ids';
import { CaixaDB } from './db';

export class DomainError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export interface ProductInput {
  name: string;
  priceCents: number;
  barcode?: string;
  minStock: number;
}

export interface NewSale {
  cart: Cart;
  method: PaymentMethod;
  customerId?: string;
  paymentRef?: string;
  cashReceivedCents?: number;
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
          barcode: clean(input.barcode),
          minStock: input.minStock,
          stock: 0, // raised by the initial-stock movement below
          createdAt: at,
          updatedAt: at,
        };
        await this.db.products.add(product);
        await this.audit({ entity: 'product', entityId: product.id, action: 'created', after: product });
        if (initialStock > 0) {
          await this.addMovement({ productId: product.id, type: 'entry', delta: initialStock, reason: 'Stock inicial' });
        }
        return product;
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
          updatedAt: this.stamp(),
        };
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
  };

  private async assertProduct(input: ProductInput, selfId?: string) {
    if (!input.name.trim()) throw new DomainError('name_required');
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new DomainError('invalid_price');
    if (!Number.isInteger(input.minStock) || input.minStock < 0) throw new DomainError('invalid_stock');
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
    update: (id: string, name: string, phone?: string): Promise<Customer> =>
      this.db.transaction('rw', [this.db.customers, this.db.audit], async () => {
        const before = await this.db.customers.get(id);
        if (!before) throw new DomainError('not_found');
        if (!name.trim()) throw new DomainError('name_required');
        const after: Customer = { ...before, name: name.trim(), phone: clean(phone), updatedAt: this.stamp() };
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
        [this.db.sales, this.db.products, this.db.stockMovements, this.db.audit, this.db.meta, this.db.customers],
        async () => {
          if (input.cart.length === 0) throw new DomainError('empty_cart');
          if (input.cart.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) throw new DomainError('invalid_quantity');
          if (input.method === 'credit') {
            if (!input.customerId || !(await this.db.customers.get(input.customerId))) {
              throw new DomainError('customer_required');
            }
          }
          const counter = await this.db.meta.get('saleNumber');
          const number = (typeof counter?.value === 'number' ? counter.value : 0) + 1;
          await this.db.meta.put({ key: 'saleNumber', value: number });
          const at = this.stamp();
          const sale: Sale = {
            id: uuid(),
            number,
            items: cartItems(input.cart),
            totalCents: cartTotal(input.cart),
            currency: CURRENCY,
            method: input.method,
            customerId: input.method === 'credit' ? input.customerId : undefined,
            paymentRef: input.paymentRef,
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
    /** Total owed by all customers right now. */
    totalOwed: async (now = new Date()) => {
      const [customers, sales, payments] = await Promise.all([this.customers.list(), this.sales.onCredit(), this.credit.payments()]);
      return totalOutstanding(creditBook(customers, sales, payments, now));
    },
    byCustomer: (customerId: string) => this.db.creditPayments.where('customerId').equals(customerId).toArray(),
    addPayment: (customerId: string, amountCents: number, method: CreditPayment['method']): Promise<CreditPayment> =>
      this.db.transaction('rw', [this.db.creditPayments, this.db.sales, this.db.audit], async () => {
        if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('zero');
        const owed =
          (await this.db.sales.where('customerId').equals(customerId).toArray())
            .filter((s) => s.method === 'credit' && !s.voidedAt)
            .reduce((a, s) => a + s.totalCents, 0) -
          (await this.db.creditPayments.where('customerId').equals(customerId).toArray()).reduce((a, p) => a + p.amountCents, 0);
        if (amountCents > owed) throw new DomainError('too_much');
        const at = this.stamp();
        const payment: CreditPayment = { id: uuid(), customerId, amountCents, method, createdAt: at, updatedAt: at };
        await this.db.creditPayments.add(payment);
        await this.audit({ entity: 'credit_payment', entityId: payment.id, action: 'created', after: payment });
        return payment;
      }),
  };

  // ---------- Settings ----------
  readonly settings = {
    get: async (): Promise<Settings> => {
      const s = await this.db.settings.get(SETTINGS_ID);
      if (s) return s;
      const at = this.stamp();
      return { id: SETTINGS_ID, storeName: DEFAULT_STORE_NAME, createdAt: at, updatedAt: at };
    },
    save: (input: Pick<Settings, 'storeName' | 'phone' | 'nif'>): Promise<Settings> =>
      this.db.transaction('rw', [this.db.settings, this.db.audit], async () => {
        if (!input.storeName.trim()) throw new DomainError('name_required');
        const nif = normaliseNif(input.nif);
        if (!nif.ok) throw new DomainError('invalid_nif');
        const before = await this.db.settings.get(SETTINGS_ID);
        const at = this.stamp();
        const after: Settings = {
          id: SETTINGS_ID,
          storeName: input.storeName.trim(),
          phone: clean(input.phone),
          nif: nif.value,
          createdAt: before?.createdAt ?? at,
          updatedAt: at,
        };
        await this.db.settings.put(after);
        await this.audit({ entity: 'settings', entityId: SETTINGS_ID, action: 'updated', before, after });
        return after;
      }),
  };

  readonly auditLog = {
    list: () => this.db.audit.orderBy('createdAt').toArray(),
  };
}
