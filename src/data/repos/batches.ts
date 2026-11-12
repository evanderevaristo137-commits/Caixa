import { isExpiryDate } from '../../domain/expiry';
import type { Batch } from '../../domain/types';
import { StoreCore } from './core';
import { DomainError } from './shared';

/**
 * Expiry dates of the stock of products that follow them (optional). Stock coming in makes a batch
 * (with or without a date); what is left of each is worked out from the stock (src/domain/expiry.ts).
 */
export class BatchesRepository {
  constructor(private readonly c: StoreCore) {}

  /** The batches of a product, oldest first (voided ones too: batchesOnShelf leaves them out). */
  forProduct = (productId: string) => this.c.db.batches.where('productId').equals(productId).sortBy('createdAt');
  /** Every batch still counting (not voided), oldest first. */
  all = async () => (await this.c.db.batches.orderBy('createdAt').toArray()).filter((b) => !b.voidedAt);

  /**
   * Gives a date to stock already on the shelf (when a product starts following its dates, or for
   * stock that came in without one). It counts as the oldest stock. Audited.
   */
  addShelf = (productId: string, quantity: number, expiresOn: string): Promise<Batch> =>
    this.c.db.transaction('rw', [this.c.db.batches, this.c.db.products, this.c.db.audit, this.c.db.meta], async () => {
      const product = await this.c.db.products.get(productId);
      if (!product || product.archivedAt) throw new DomainError('not_found');
      if (!product.tracksExpiry) throw new DomainError('not_tracked');
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > product.stock) throw new DomainError('invalid_quantity');
      if (!isExpiryDate(expiresOn)) throw new DomainError('invalid_date');
      const batch = await this.c.addBatch({ productId, quantity, expiresOn, source: 'shelf' });
      await this.c.audit({
        entity: 'batch',
        entityId: batch.id,
        action: 'created',
        after: { productId, name: product.name, quantity, ...(product.soldBy ? { soldBy: product.soldBy } : {}), expiresOn },
      });
      return batch;
    });

  /** A date given by mistake: the batch stops counting (never deleted). Audited. */
  remove = (id: string): Promise<void> =>
    this.c.db.transaction('rw', [this.c.db.batches, this.c.db.products, this.c.db.audit], async () => {
      const before = await this.c.db.batches.get(id);
      if (!before || before.voidedAt) throw new DomainError('not_found');
      const at = this.c.stamp();
      await this.c.db.batches.put({ ...before, voidedAt: at, updatedAt: at });
      const product = await this.c.db.products.get(before.productId);
      await this.c.audit({
        entity: 'batch',
        entityId: id,
        action: 'voided',
        after: {
          productId: before.productId,
          name: product?.name,
          quantity: before.quantity,
          ...(product?.soldBy ? { soldBy: product.soldBy } : {}),
          expiresOn: before.expiresOn,
        },
      });
    });
}
