import { checkCreditLimit, creditBook, DEFAULT_TERM_DAYS, dueDateFromTerm, totalOutstanding } from '../../domain/credit';
import { isValidDateString, toLocalDateString } from '../../lib/dates';
import { MAX_GRAMS } from '../../domain/quantity';
import type { CreditPayment, Sale } from '../../domain/types';
import { CURRENCY, PAYMENT_METHODS } from '../../domain/types';
import { saleLog } from '../../domain/audit-entry';
import { isUuid, uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError, SETTINGS_ID, cleanReference, type NewSale } from './shared';

/** Sales. */
export class SalesRepository {
  constructor(private readonly c: StoreCore) {}

  list = () => this.c.db.sales.orderBy('createdAt').toArray();
  since = (iso: string) => this.c.db.sales.where('createdAt').aboveOrEqual(iso).toArray();
  byCustomer = (customerId: string) => this.c.db.sales.where('customerId').equals(customerId).toArray();
  onCredit = () => this.c.db.sales.where('method').equals('credit').toArray();
  get = (id: string) => this.c.db.sales.get(id);
  /** Sales with from <= createdAt < to (ISO strings). */
  between = (fromIso: string, toIso: string) => this.c.db.sales.where('createdAt').between(fromIso, toIso, true, false).toArray();
  /**
   * Voids a sale: it stays in history, marked as voided, and stops counting.
   * The stock comes back through 'void' movements. A reason is mandatory.
   */
  void = (id: string, reason: string): Promise<Sale> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.sales, this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta],
      async () => {
        await this.c.store.security.requireOwner();
        const before = await this.c.db.sales.get(id);
        if (!before) throw new DomainError('not_found');
        if (before.voidedAt) throw new DomainError('already_voided');
        if (reason.trim().length < 3) throw new DomainError('reason_required');
        const at = this.c.stamp();
        const after: Sale = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
        await this.c.db.sales.put(after);
        await this.c.audit({ entity: 'sale', entityId: id, action: 'voided', after: saleLog(after) });
        for (const item of before.items) {
          await this.c.addMovement({ productId: item.productId, type: 'void', delta: item.quantity, reason: reason.trim(), saleId: id });
        }
        return after;
      },
    );
  /** Saves the sale, lowers stock and writes the audit log, all or nothing. */
  create = (input: NewSale): Promise<Sale> =>
    this.c.db.transaction(
      'rw',
      [
        this.c.db.sales,
        this.c.db.products,
        this.c.db.stockMovements,
        this.c.db.audit,
        this.c.db.meta,
        this.c.db.customers,
        this.c.db.settings,
        this.c.db.creditPayments,
      ],
      async () => {
        if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) throw new DomainError('invalid_method');
        if (input.cart.length === 0) throw new DomainError('empty_cart');
        if (input.cart.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > MAX_GRAMS)) {
          throw new DomainError('invalid_quantity');
        }
        // The same cart is never recorded twice (the app closed just after saving, a second tap…).
        if (input.id !== undefined) {
          if (!isUuid(input.id)) throw new DomainError('invalid_id');
          if (await this.c.db.sales.get(input.id)) throw new DomainError('duplicate_sale');
        }
        const items = await this.c.saleItems(input.cart);
        const totalCents = items.reduce((a, i) => a + i.lineTotalCents, 0);
        if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new DomainError('invalid_amount');
        if (input.method === 'cash' && input.cashReceivedCents !== undefined) {
          if (!Number.isSafeInteger(input.cashReceivedCents) || input.cashReceivedCents < totalCents)
            throw new DomainError('invalid_amount');
        }
        let dueDate: string | undefined;
        let creditLimitOverride: Sale['creditLimitOverride'];
        if (input.method === 'credit') {
          if (!input.customerId || !(await this.c.db.customers.get(input.customerId))) {
            throw new DomainError('customer_required');
          }
          const today = toLocalDateString(this.c.now());
          if (input.dueDate !== undefined && (!isValidDateString(input.dueDate) || input.dueDate < today)) {
            throw new DomainError('invalid_due_date');
          }
          const settings = await this.c.db.settings.get(SETTINGS_ID);
          dueDate = input.dueDate ?? dueDateFromTerm(settings?.creditTermDays ?? DEFAULT_TERM_DAYS, this.c.now());
          const customer = (await this.c.db.customers.get(input.customerId))!;
          const balanceBeforeCents = await this.c.customerBalance(input.customerId);
          const limit = checkCreditLimit({
            balanceCents: balanceBeforeCents,
            saleCents: totalCents,
            customerLimitCents: customer.creditLimitCents,
            shopLimitCents: settings?.creditLimitCents,
          });
          if (limit.exceedsByCents > 0) {
            if (!input.allowOverLimit) throw new DomainError('credit_limit');
            // Going over the limit needs the owner code (when there is one).
            await this.c.store.security.requireOwner();
            creditLimitOverride = { limitCents: limit.limitCents!, balanceBeforeCents };
          }
        }
        const counter = await this.c.db.meta.get('saleNumber');
        const number = (typeof counter?.value === 'number' ? counter.value : 0) + 1;
        await this.c.db.meta.put({ key: 'saleNumber', value: number });
        const at = this.c.stamp();
        const sale: Sale = {
          id: input.id ?? uuid(),
          number,
          items,
          totalCents,
          currency: CURRENCY,
          method: input.method,
          customerId: input.method === 'credit' ? input.customerId : undefined,
          dueDate,
          creditLimitOverride,
          paymentRef: input.paymentRef,
          transactionRef: input.method !== 'cash' && input.method !== 'credit' ? cleanReference(input.transactionRef) : undefined,
          deviceId: await this.c.deviceId(),
          cashReceivedCents: input.method === 'cash' ? input.cashReceivedCents : undefined,
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.sales.add(sale);
        await this.c.audit({ entity: 'sale', entityId: sale.id, action: 'created', after: saleLog(sale) });
        for (const item of sale.items) {
          await this.c.addMovement({ productId: item.productId, type: 'sale', delta: -item.quantity, saleId: sale.id });
        }
        return sale;
      },
    );
}

/** Fiado payments. */
export class CreditRepository {
  constructor(private readonly c: StoreCore) {}

  payments = () => this.c.db.creditPayments.orderBy('createdAt').toArray();
  paymentsBetween = (fromIso: string, toIso: string) =>
    this.c.db.creditPayments.where('createdAt').between(fromIso, toIso, true, false).toArray();
  /** Every customer with balance and payment situation, most urgent first. */
  book = async (now = new Date()) => {
    const [customers, sales, payments] = await Promise.all([this.c.store.customers.list(), this.c.store.sales.onCredit(), this.payments()]);
    return creditBook(customers, sales, payments, now);
  };
  /** Total owed by all customers right now. */
  totalOwed = async (now = new Date()) => totalOutstanding(await this.book(now));
  byCustomer = (customerId: string) => this.c.db.creditPayments.where('customerId').equals(customerId).toArray();
  addPayment = (
    customerId: string,
    amountCents: number,
    method: CreditPayment['method'],
    transactionRef?: string,
  ): Promise<CreditPayment> =>
    this.c.db.transaction('rw', [this.c.db.creditPayments, this.c.db.sales, this.c.db.audit, this.c.db.meta], async () => {
      if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('zero');
      const owed = await this.c.customerBalance(customerId);
      if (amountCents > owed) throw new DomainError('too_much');
      const at = this.c.stamp();
      const payment: CreditPayment = {
        id: uuid(),
        customerId,
        amountCents,
        method,
        transactionRef: method === 'cash' ? undefined : cleanReference(transactionRef),
        deviceId: await this.c.deviceId(),
        createdAt: at,
        updatedAt: at,
      };
      await this.c.db.creditPayments.add(payment);
      await this.c.audit({ entity: 'credit_payment', entityId: payment.id, action: 'created', after: payment });
      return payment;
    });
}
