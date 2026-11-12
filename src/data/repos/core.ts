import { lineProblem, saleItem, type Cart } from '../../domain/cart';
import { addDays, startOfLocalDay } from '../../lib/dates';
import { drawer, summariseOutflows, type Drawer } from '../../domain/cash';
import { internalBarcode } from '../../domain/barcode';
import { canonicalCategory } from '../../domain/categories';
import { savedCents } from '../../domain/inss';
import { summariseReturns } from '../../domain/returns';
import type { AuditEntry, SaleItem, StockMovement } from '../../domain/types';
import { uuid } from '../../lib/ids';
import { CaixaDB } from '../db';
import type { Store } from '../store';
import { DomainError, LINE_ERRORS, SETTINGS_ID, clean, tillPurchasesCents, validTaxRate, type ProductInput } from './shared';

/**
 * What every repository of the Store shares: the database, the clock, the activity log, the phone's
 * id, stock movements and the checks that more than one area needs. Internal to the Store.
 */
export class StoreCore {
  constructor(
    readonly db: CaixaDB,
    readonly now: () => Date,
    private readonly getStore: () => Store,
  ) {}

  /** The Store, for the few places where one area calls another. */
  get store(): Store {
    return this.getStore();
  }

  /** Until when (ms, on the Store's clock) a typed owner code allows sensitive actions. */
  ownerGrantUntil = 0;

  stamp() {
    return this.now().toISOString();
  }

  /** What a customer owes now: valid credit sales minus payments (call inside a transaction with sales and creditPayments). */
  async customerBalance(customerId: string): Promise<number> {
    const [sales, payments] = await Promise.all([
      this.db.sales.where('customerId').equals(customerId).toArray(),
      this.db.creditPayments.where('customerId').equals(customerId).toArray(),
    ]);
    const bought = sales.filter((x) => x.method === 'credit' && !x.voidedAt).reduce((a, x) => a + x.totalCents, 0);
    return bought - payments.reduce((a, p) => a + p.amountCents, 0);
  }

  /**
   * The lines of a sale (call inside the sale transaction). Name, price and how it is sold come from
   * the product as it is now, with the cost and the invoicing data that apply today. A line the
   * screen priced differently, or whose product is no longer sold, stops the sale.
   */
  async saleItems(cart: Cart): Promise<SaleItem[]> {
    const settings = await this.db.settings.get(SETTINGS_ID);
    const products = await this.db.products.bulkGet(cart.map((l) => l.productId));
    return cart.map((line, i) => {
      const p = products[i];
      const problem = lineProblem(line, p);
      if (!p || problem) throw new DomainError(LINE_ERRORS[problem ?? 'unavailable']);
      return {
        ...saleItem(line, p),
        ...(p.costCents !== undefined ? { unitCostCents: p.costCents } : {}),
        barcode: p.barcode,
        unit: p.unit,
        taxRateBp: p.taxRateBp ?? settings?.defaultTaxRateBp,
        taxExemption: p.taxExemption,
      };
    });
  }

  /** This phone's id, created once (call inside a transaction that includes `meta`). */
  async deviceId(): Promise<string> {
    const row = await this.db.meta.get('deviceId');
    if (typeof row?.value === 'string') return row.value;
    const id = uuid();
    await this.db.meta.put({ key: 'deviceId', value: id });
    return id;
  }

  /** Throws 'pin_locked' (with the seconds to wait) or 'wrong_pin' unless the code is right. */
  async ownerCode(pin: string): Promise<void> {
    const result = await this.store.security.check(pin);
    if (result.ok) return;
    throw result.waitSeconds ? new DomainError('pin_locked', result.waitSeconds) : new DomainError('wrong_pin');
  }

  audit(entry: Omit<AuditEntry, 'id' | 'createdAt' | 'updatedAt'>) {
    const at = this.stamp();
    return this.db.audit.add({ ...entry, id: uuid(), createdAt: at, updatedAt: at });
  }

  /** The category as the shop already writes it ("bebidas" → "Bebidas"). Call inside a transaction with products. */
  async categoryFor(input: string | undefined): Promise<string | undefined> {
    const known = (await this.db.products.orderBy('category').uniqueKeys()).filter((k): k is string => typeof k === 'string');
    return canonicalCategory(input, known);
  }

  /** Call inside a transaction with products and meta. Skips codes already used by any product. */
  async reserveInternalBarcode(): Promise<string> {
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

  async assertProduct(input: ProductInput, selfId?: string) {
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

  /**
   * Records a movement and updates the product's stock projection. Call inside a transaction.
   * Entries and adjustments are actions by themselves and get their own line in the activity log;
   * the movements of a sale, a purchase or a void are covered by that line (they keep its id).
   */
  async addMovement(m: Omit<StockMovement, 'id' | 'createdAt' | 'updatedAt'>) {
    const product = await this.db.products.get(m.productId);
    if (!product) throw new DomainError('not_found');
    const at = this.stamp();
    const movement: StockMovement = { ...m, id: uuid(), createdAt: at, updatedAt: at };
    await this.db.stockMovements.add(movement);
    await this.db.products.update(m.productId, { stock: product.stock + m.delta, updatedAt: at });
    if (m.type === 'entry' || m.type === 'adjustment') {
      await this.audit({ entity: 'stock_movement', entityId: movement.id, action: 'created', after: movement });
    }
  }

  /** Call inside a transaction that reads sales, creditPayments, expenses, purchases, supplierPayments and returns. */
  async drawerOn(day: Date, floatCents: number): Promise<Drawer> {
    const from = startOfLocalDay(day).toISOString();
    const to = addDays(startOfLocalDay(day), 1).toISOString();
    const [sales, payments, expenses, purchases, supplierPayments, returns] = await Promise.all([
      this.db.sales.where('createdAt').between(from, to, true, false).toArray(),
      this.db.creditPayments.where('createdAt').between(from, to, true, false).toArray(),
      this.db.expenses.where('createdAt').between(from, to, true, false).toArray(),
      this.db.purchases.where('createdAt').between(from, to, true, false).toArray(),
      this.db.supplierPayments.where('createdAt').between(from, to, true, false).toArray(),
      this.db.returns.where('createdAt').between(from, to, true, false).toArray(),
    ]);
    return drawer({
      floatCents,
      cashSalesCents: sales.filter((s) => s.method === 'cash' && !s.voidedAt).reduce((a, s) => a + s.totalCents, 0),
      cashCreditPaymentsCents: payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amountCents, 0),
      cashOutCents: summariseOutflows(expenses).cashOutCents,
      cashPurchasesCents: tillPurchasesCents(purchases, supplierPayments),
      cashRefundsCents: summariseReturns(returns).cashCents,
    });
  }

  /** Call inside a transaction with expenses and inssContributions. */
  async inssSaved(): Promise<number> {
    const [setAside, contributions] = await Promise.all([
      this.db.expenses.where('category').equals('inss').toArray(),
      this.db.inssContributions.toArray(),
    ]);
    return savedCents(setAside, contributions);
  }
}
