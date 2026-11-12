import { returnLog } from '../../domain/audit-entry';
import { returnItems } from '../../domain/returns';
import { isPaymentPending, type CreditPayment, type SaleReturn } from '../../domain/types';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError } from './shared';

export interface NewReturn {
  saleId: string;
  /** How much of each product comes back (units, or grams for weighed products). */
  lines: { productId: string; quantity: number }[];
  /** A credit sale always lowers the debt ('debt'); any other sale: from the till ('cash') or another way ('other'). */
  refund: SaleReturn['refund'];
  /** The goods go back on the shelf (the stock goes up). */
  restock: boolean;
  reason: string;
}

/** Goods given back by customers, all or part of a sale. */
export class ReturnsRepository {
  constructor(private readonly c: StoreCore) {}

  list = () => this.c.db.returns.orderBy('createdAt').toArray();
  bySale = (saleId: string) => this.c.db.returns.where('saleId').equals(saleId).sortBy('createdAt');
  /** Returns with from <= createdAt < to (ISO strings). */
  between = (fromIso: string, toIso: string) => this.c.db.returns.where('createdAt').between(fromIso, toIso, true, false).toArray();

  /**
   * Records a return, all or nothing: never more than what is left of each line, the money is
   * proportional to what the line cost, restocked goods go back through 'return' movements, and on a
   * credit sale the amount lowers what the customer owes. Needs the owner code (when there is one). Audited.
   */
  create = (input: NewReturn): Promise<SaleReturn> =>
    this.c.db.transaction(
      'rw',
      [
        this.c.db.sales,
        this.c.db.returns,
        this.c.db.products,
        this.c.db.stockMovements,
        this.c.db.creditPayments,
        this.c.db.audit,
        this.c.db.meta,
      ],
      async () => {
        await this.c.store.security.requireOwner();
        const sale = await this.c.db.sales.get(input.saleId);
        if (!sale) throw new DomainError('not_found');
        if (sale.voidedAt) throw new DomainError('sale_voided');
        // The money never came in: confirm it first (or record again how the customer pays).
        if (isPaymentPending(sale)) throw new DomainError('payment_pending');
        const reason = input.reason.trim();
        if (reason.length < 3) throw new DomainError('reason_required');
        const onCredit = sale.method === 'credit';
        const refundOk = onCredit ? input.refund === 'debt' : input.refund === 'cash' || input.refund === 'other';
        if (!refundOk) throw new DomainError('invalid_refund');
        const earlier = await this.c.db.returns.where('saleId').equals(sale.id).toArray();
        const items = returnItems(sale, earlier, input.lines);
        if (typeof items === 'string') throw new DomainError(items);

        const counter = await this.c.db.meta.get('returnNumber');
        const number = (typeof counter?.value === 'number' ? counter.value : 0) + 1;
        await this.c.db.meta.put({ key: 'returnNumber', value: number });
        const at = this.c.stamp();
        const ret: SaleReturn = {
          id: uuid(),
          number,
          saleId: sale.id,
          saleNumber: sale.number,
          items,
          totalCents: items.reduce((a, i) => a + i.refundCents, 0),
          refund: input.refund,
          restock: input.restock === true,
          reason: reason.slice(0, 120),
          ...(onCredit && sale.customerId ? { customerId: sale.customerId } : {}),
          deviceId: await this.c.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.returns.add(ret);
        if (ret.restock) {
          for (const i of items) {
            await this.c.addMovement({
              productId: i.productId,
              type: 'return',
              delta: i.quantity,
              reason: ret.reason,
              saleId: sale.id,
              returnId: ret.id,
            });
          }
        }
        if (onCredit && sale.customerId && ret.totalCents > 0) {
          // The customer owes less; no money moves, so it never counts as money received.
          const lower: CreditPayment = {
            id: uuid(),
            customerId: sale.customerId,
            amountCents: ret.totalCents,
            method: 'return',
            returnId: ret.id,
            deviceId: ret.deviceId,
            createdAt: at,
            updatedAt: at,
          };
          await this.c.db.creditPayments.add(lower);
        }
        await this.c.audit({ entity: 'return', entityId: ret.id, action: 'created', after: returnLog(ret) });
        return ret;
      },
    );
}
