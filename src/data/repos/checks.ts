import { creditAccounts } from '../../domain/credit';
import { accountDifferences, checkIntegrity, type IntegrityIssue } from '../../domain/integrity';
import { rebuildAccounts } from '../accounts';
import type { Product } from '../../domain/types';
import { changedFields } from '../../domain/audit-entry';
import { StoreCore } from './core';
import { DomainError } from './shared';

/** Checking the numbers. */
export class IntegrityRepository {
  constructor(private readonly c: StoreCore) {}

  check = async (): Promise<IntegrityIssue[]> => {
    const [products, movements, sales, customers, payments, accounts] = await Promise.all([
      this.c.db.products.toArray(),
      this.c.db.stockMovements.toArray(),
      this.c.db.sales.toArray(),
      this.c.db.customers.toArray(),
      this.c.db.creditPayments.toArray(),
      this.c.db.accounts.toArray(),
    ]);
    return checkIntegrity({ products, movements, sales, customers, payments, accounts });
  };
  /**
   * Checks the customers' saved accounts against their sales and payments, and builds them all again
   * if any differs. Returns how many differed (0: all right). No owner code: the accounts are worked
   * out from the facts, which stay as they are.
   */
  reconcileAccounts = (): Promise<number> =>
    this.c.db.transaction('rw', [this.c.db.sales, this.c.db.creditPayments, this.c.db.accounts], async () => {
      const [sales, payments, saved] = await Promise.all([
        this.c.db.sales.where('method').equals('credit').toArray(),
        this.c.db.creditPayments.toArray(),
        this.c.db.accounts.toArray(),
      ]);
      const differ = accountDifferences(saved, creditAccounts(sales, payments)).length;
      if (differ > 0) await rebuildAccounts(this.c.db);
      return differ;
    });
  /** Puts a product's stock back to the sum of its movements (the facts). Audited. */
  fixStock = (productId: string) =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.store.security.requireOwner();
      const before = await this.c.db.products.get(productId);
      if (!before) throw new DomainError('not_found');
      const computed = (await this.c.db.stockMovements.where('productId').equals(productId).toArray()).reduce((a, m) => a + m.delta, 0);
      if (computed === before.stock) return;
      // Like a sale or a stock entry, this is no edit of the product's own data: updatedAt stays, so
      // another phone's newer name or price is never lost to it (see sync-merge.ts).
      const after: Product = { ...before, stock: computed };
      await this.c.db.products.put(after);
      await this.c.audit({ entity: 'product', entityId: productId, action: 'updated', ...changedFields(before, after, ['name']) });
    });
}

export class AuditLogRepository {
  constructor(private readonly c: StoreCore) {}

  /** Most recent first. */
  recent = (limit = 300) => this.c.db.audit.orderBy('createdAt').reverse().limit(limit).toArray();
  list = () => this.c.db.audit.orderBy('createdAt').toArray();
}
