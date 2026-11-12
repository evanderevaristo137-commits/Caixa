import { DEFAULT_TERM_DAYS, dueDateFromTerm } from '../../domain/credit';
import { isValidDateString, toLocalDateString } from '../../lib/dates';
import { byName } from '../../domain/ranking';
import { MAX_GRAMS } from '../../domain/quantity';
import type { Product, Purchase, PurchaseItem, Supplier, SupplierPayment } from '../../domain/types';
import { PURCHASE_PAYMENTS } from '../../domain/types';
import { purchaseLineTotal } from '../../domain/purchases';
import { changedFields, purchaseLog } from '../../domain/audit-entry';
import { payablesBook, payableStatus, totalPayable } from '../../domain/payables';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError, clean, cleanShort, type NewPurchase } from './shared';

/** Suppliers, purchases and what the shop owes them. */
export class SuppliersRepository {
  constructor(private readonly c: StoreCore) {}

  list = async (): Promise<Supplier[]> => (await this.c.db.suppliers.toArray()).sort(byName);
  get = (id: string) => this.c.db.suppliers.get(id);
  create = (name: string, phone?: string): Promise<Supplier> =>
    this.c.db.transaction('rw', [this.c.db.suppliers, this.c.db.audit], async () => {
      if (!name.trim()) throw new DomainError('name_required');
      const at = this.c.stamp();
      const supplier: Supplier = { id: uuid(), name: name.trim(), phone: clean(phone), createdAt: at, updatedAt: at };
      await this.c.db.suppliers.add(supplier);
      await this.c.audit({ entity: 'supplier', entityId: supplier.id, action: 'created', after: supplier });
      return supplier;
    });
  update = (id: string, changes: { name?: string; phone?: string }): Promise<Supplier> =>
    this.c.db.transaction('rw', [this.c.db.suppliers, this.c.db.audit], async () => {
      const before = await this.c.db.suppliers.get(id);
      if (!before) throw new DomainError('not_found');
      const after: Supplier = { ...before, updatedAt: this.c.stamp() };
      if ('name' in changes) {
        if (!changes.name?.trim()) throw new DomainError('name_required');
        after.name = changes.name.trim();
      }
      if ('phone' in changes) after.phone = clean(changes.phone);
      await this.c.db.suppliers.put(after);
      await this.c.audit({ entity: 'supplier', entityId: id, action: 'updated', ...changedFields(before, after, ['name']) });
      return after;
    });
}

export class PurchasesRepository {
  constructor(private readonly c: StoreCore) {}

  list = () => this.c.db.purchases.orderBy('createdAt').toArray();
  get = (id: string) => this.c.db.purchases.get(id);
  between = (fromIso: string, toIso: string) => this.c.db.purchases.where('createdAt').between(fromIso, toIso, true, false).toArray();
  bySupplier = (supplierId: string) => this.c.db.purchases.where('supplierId').equals(supplierId).toArray();
  /**
   * Goods received: stock goes up (one movement per line), each product's cost price becomes the
   * cost of this purchase and its usual supplier this one. All or nothing, audited.
   */
  create = (input: NewPurchase): Promise<Purchase> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.purchases, this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta, this.c.db.suppliers],
      async () => {
        if (input.lines.length === 0) throw new DomainError('empty_purchase');
        if (!(PURCHASE_PAYMENTS as readonly string[]).includes(input.payment)) throw new DomainError('invalid_payment');
        if (input.supplierId && !(await this.c.db.suppliers.get(input.supplierId))) throw new DomainError('supplier_required');
        let dueDate: string | undefined;
        if (input.payment === 'credit') {
          if (!input.supplierId) throw new DomainError('supplier_required');
          const today = toLocalDateString(this.c.now());
          if (input.dueDate !== undefined && (!isValidDateString(input.dueDate) || input.dueDate < today)) {
            throw new DomainError('invalid_due_date');
          }
          dueDate = input.dueDate ?? dueDateFromTerm(DEFAULT_TERM_DAYS, this.c.now());
        }
        const items: PurchaseItem[] = [];
        for (const line of input.lines) {
          const product = await this.c.db.products.get(line.productId);
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
        const counter = await this.c.db.meta.get('purchaseNumber');
        const number = (typeof counter?.value === 'number' ? counter.value : 0) + 1;
        await this.c.db.meta.put({ key: 'purchaseNumber', value: number });
        const at = this.c.stamp();
        const purchase: Purchase = {
          id: uuid(),
          number,
          supplierId: input.supplierId,
          items,
          totalCents: items.reduce((a, i) => a + i.lineTotalCents, 0),
          payment: input.payment,
          dueDate,
          note: cleanShort(input.note, 120),
          deviceId: await this.c.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.purchases.add(purchase);
        await this.c.audit({ entity: 'purchase', entityId: purchase.id, action: 'created', after: purchaseLog(purchase) });
        for (const item of items) {
          await this.c.addMovement({ productId: item.productId, type: 'purchase', delta: item.quantity, purchaseId: purchase.id });
          const before = (await this.c.db.products.get(item.productId))!;
          const after: Product = { ...before, costCents: item.unitCostCents, updatedAt: this.c.stamp() };
          if (input.supplierId) after.supplierId = input.supplierId;
          if (after.costCents !== before.costCents || after.supplierId !== before.supplierId) {
            await this.c.db.products.put(after);
            await this.c.audit({
              entity: 'product',
              entityId: item.productId,
              action: 'updated',
              ...changedFields(before, after, ['name']),
            });
          }
        }
        return purchase;
      },
    );
  /** A mistake stays in the history as voided; the stock goes back down. A reason is mandatory. */
  void = (id: string, reason: string): Promise<Purchase> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.purchases, this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta],
      async () => {
        await this.c.store.security.requireOwner();
        const before = await this.c.db.purchases.get(id);
        if (!before) throw new DomainError('not_found');
        if (before.voidedAt) throw new DomainError('already_voided');
        if (reason.trim().length < 3) throw new DomainError('reason_required');
        const at = this.c.stamp();
        const after: Purchase = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
        await this.c.db.purchases.put(after);
        await this.c.audit({ entity: 'purchase', entityId: id, action: 'voided', after: purchaseLog(after) });
        for (const item of before.items) {
          await this.c.addMovement({
            productId: item.productId,
            type: 'purchase_void',
            delta: -item.quantity,
            reason: reason.trim(),
            purchaseId: id,
          });
        }
        return after;
      },
    );
}

export class SupplierPaymentsRepository {
  constructor(private readonly c: StoreCore) {}

  list = () => this.c.db.supplierPayments.orderBy('createdAt').toArray();
  bySupplier = (supplierId: string) => this.c.db.supplierPayments.where('supplierId').equals(supplierId).toArray();
  between = (fromIso: string, toIso: string) =>
    this.c.db.supplierPayments.where('createdAt').between(fromIso, toIso, true, false).toArray();
  add = (supplierId: string, amountCents: number, fromCash: boolean): Promise<SupplierPayment> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.supplierPayments, this.c.db.purchases, this.c.db.suppliers, this.c.db.audit, this.c.db.meta],
      async () => {
        if (!(await this.c.db.suppliers.get(supplierId))) throw new DomainError('not_found');
        if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('zero');
        const [purchases, payments] = await Promise.all([
          this.c.db.purchases.where('supplierId').equals(supplierId).toArray(),
          this.c.db.supplierPayments.where('supplierId').equals(supplierId).toArray(),
        ]);
        if (amountCents > payableStatus(supplierId, purchases, payments, this.c.now()).balanceCents) throw new DomainError('too_much');
        const at = this.c.stamp();
        const payment: SupplierPayment = {
          id: uuid(),
          supplierId,
          amountCents,
          fromCash,
          deviceId: await this.c.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.supplierPayments.add(payment);
        await this.c.audit({ entity: 'supplier_payment', entityId: payment.id, action: 'created', after: payment });
        return payment;
      },
    );
}

export class PayablesRepository {
  constructor(private readonly c: StoreCore) {}

  /** Every supplier with what the shop owes, most urgent first. */
  book = async (now = new Date()) => {
    const [suppliers, purchases, payments] = await Promise.all([
      this.c.store.suppliers.list(),
      this.c.store.purchases.list(),
      this.c.store.supplierPayments.list(),
    ]);
    return payablesBook(suppliers, purchases, payments, now);
  };
  totalOwed = async (now = new Date()) => totalPayable(await this.book(now));
}
