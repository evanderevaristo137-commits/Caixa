import { adjustmentDelta, validateEntry, type StockChangeError } from '../../domain/stock';
import { isExpiryDate } from '../../domain/expiry';
import { byName } from '../../domain/ranking';
import { MAX_GRAMS } from '../../domain/quantity';
import type { PlanRow } from '../../domain/import-products';
import type { Product } from '../../domain/types';
import { changedFields } from '../../domain/audit-entry';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError, STOCK_COUNT_REASON, clean, cleanShort, type ProductInput } from './shared';

/** Products. */
export class ProductsRepository {
  constructor(private readonly c: StoreCore) {}

  list = async (): Promise<Product[]> => (await this.c.db.products.toArray()).filter((p) => !p.archivedAt).sort(byName);
  /** Every product, archived ones too (to name them in old records). */
  all = async (): Promise<Product[]> => (await this.c.db.products.toArray()).sort(byName);
  get = (id: string) => this.c.db.products.get(id);
  findByBarcode = async (code: string): Promise<Product | undefined> => {
    const matches = await this.c.db.products.where('barcode').equals(code.trim()).toArray();
    return matches.find((p) => !p.archivedAt);
  };
  /** `initialExpiresOn`: the date of the initial stock, for a product that follows its dates. */
  create = (input: ProductInput, initialStock = 0, initialExpiresOn?: string): Promise<Product> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.batches, this.c.db.meta],
      async () => {
        await this.c.allow('stock');
        await this.c.assertProduct(input);
        if (!Number.isInteger(initialStock) || initialStock < 0) throw new DomainError('invalid_stock');
        if (initialExpiresOn !== undefined && !isExpiryDate(initialExpiresOn)) throw new DomainError('invalid_date');
        const at = this.c.stamp();
        const product: Product = {
          id: uuid(),
          name: input.name.trim(),
          priceCents: input.priceCents,
          ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
          ...(input.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
          barcode: clean(input.barcode),
          category: await this.c.categoryFor(input.category),
          minStock: input.minStock,
          unit: cleanShort(input.unit, 10),
          taxRateBp: input.taxRateBp,
          taxExemption: cleanShort(input.taxExemption, 120),
          ...(input.tracksExpiry ? { tracksExpiry: true } : {}),
          stock: 0, // raised by the initial-stock movement below
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.products.add(product);
        await this.c.audit({ entity: 'product', entityId: product.id, action: 'created', after: product });
        if (initialStock > 0) {
          await this.c.addMovement({ productId: product.id, type: 'entry', delta: initialStock, reason: 'Stock inicial' });
          if (product.tracksExpiry) {
            await this.c.addBatch({ productId: product.id, quantity: initialStock, expiresOn: initialExpiresOn, source: 'entry' });
          }
        }
        // Return the saved product (with the initial stock already applied).
        return (await this.c.db.products.get(product.id))!;
      },
    );
  update = (id: string, input: ProductInput): Promise<Product> =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.allow('stock');
      const before = await this.c.db.products.get(id);
      if (!before) throw new DomainError('not_found');
      // A new price needs the owner code (when there is one).
      if (input.priceCents !== before.priceCents) await this.c.store.security.requireOwner();
      await this.c.assertProduct(input, id);
      const after: Product = {
        ...before,
        name: input.name.trim(),
        priceCents: input.priceCents,
        barcode: clean(input.barcode),
        minStock: input.minStock,
        unit: cleanShort(input.unit, 10),
        taxRateBp: input.taxRateBp,
        taxExemption: cleanShort(input.taxExemption, 120),
        updatedAt: this.c.stamp(),
      };
      if ('category' in input) {
        const category = await this.c.categoryFor(input.category);
        if (category) after.category = category;
        else delete after.category;
      }
      // The cost price changes only when the form sends it (undefined clears it).
      if ('costCents' in input) {
        if (input.costCents === undefined) delete after.costCents;
        else after.costCents = input.costCents;
      }
      if (input.tracksExpiry !== undefined) {
        if (input.tracksExpiry) after.tracksExpiry = true;
        else delete after.tracksExpiry;
      }
      await this.c.db.products.put(after);
      await this.c.audit({ entity: 'product', entityId: id, action: 'updated', ...changedFields(before, after, ['name']) });
      return after;
    });
  archive = (id: string) =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.allow('stock');
      await this.c.store.security.requireOwner();
      const before = await this.c.db.products.get(id);
      if (!before) throw new DomainError('not_found');
      const at = this.c.stamp();
      const after = { ...before, archivedAt: at, updatedAt: at };
      await this.c.db.products.put(after);
      await this.c.audit({ entity: 'product', entityId: id, action: 'archived', ...changedFields(before, after, ['name']) });
    });
  /** `expiresOn`: the date of these goods, for a product that follows its dates. */
  addEntry = (id: string, quantity: number, expiresOn?: string) =>
    this.c.db.transaction(
      'rw',
      [this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.batches, this.c.db.meta],
      async () => {
        await this.c.allow('stock');
        const err = validateEntry(quantity);
        if (err) throw new DomainError(err);
        if (expiresOn !== undefined && !isExpiryDate(expiresOn)) throw new DomainError('invalid_date');
        await this.c.addMovement({ productId: id, type: 'entry', delta: quantity });
        // With or without a date: the batches must cover all the stock that came in (see expiry.ts).
        if ((await this.c.db.products.get(id))?.tracksExpiry) {
          await this.c.addBatch({ productId: id, quantity, expiresOn, source: 'entry' });
        }
      },
    );
  adjust = (id: string, countedQuantity: number, reason: string) =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.allow('stock');
      await this.c.store.security.requireOwner();
      const product = await this.c.db.products.get(id);
      if (!product) throw new DomainError('not_found');
      const result = adjustmentDelta(product.stock, countedQuantity, reason);
      if ('error' in result) throw new DomainError(result.error satisfies StockChangeError);
      await this.c.addMovement({ productId: id, type: 'adjustment', delta: result.delta, reason: reason.trim() });
    });
  /** Category of every product that has one (archived ones too: their past sales still count). */
  categoryMap = async (): Promise<Map<string, string>> =>
    new Map((await this.c.db.products.orderBy('category').toArray()).flatMap((p) => (p.category ? [[p.id, p.category] as const] : [])));
  /**
   * Applies a stock count, all or nothing: each counted product gets an adjustment of
   * (counted − what the app had when it was counted), so sales made meanwhile still count.
   * Equal counts change nothing but are part of the audited count.
   */
  applyCount = (lines: { productId: string; counted: number; expected: number }[]): Promise<{ counted: number; adjusted: number }> =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.allow('stock');
      // Adjusting the stock needs the owner code; a count where everything matches does not.
      if (lines.some((l) => l.counted !== l.expected)) await this.c.store.security.requireOwner();
      let adjusted = 0;
      for (const line of lines) {
        if (!Number.isInteger(line.counted) || line.counted < 0 || line.counted > MAX_GRAMS || !Number.isInteger(line.expected)) {
          throw new DomainError('invalid_quantity');
        }
        const product = await this.c.db.products.get(line.productId);
        if (!product || product.archivedAt) throw new DomainError('not_found');
        const delta = line.counted - line.expected;
        if (delta === 0) continue;
        await this.c.addMovement({ productId: line.productId, type: 'adjustment', delta, reason: STOCK_COUNT_REASON });
        adjusted += 1;
      }
      await this.c.audit({ entity: 'data', entityId: 'stock_count', action: 'counted', after: { counted: lines.length, adjusted } });
      return { counted: lines.length, adjusted };
    });
  movements = (productId: string) => this.c.db.stockMovements.where('productId').equals(productId).reverse().sortBy('createdAt');
  /** Stock movements with from <= createdAt < to (ISO strings). */
  movementsBetween = (fromIso: string, toIso: string) =>
    this.c.db.stockMovements.where('createdAt').between(fromIso, toIso, true, false).toArray();
  /**
   * Next free in-store barcode (EAN-13 starting with 20). The number is reserved at once,
   * so two products never get the same code, even if the form is cancelled.
   */
  nextInternalBarcode = (): Promise<string> =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.meta], () => this.c.reserveInternalBarcode());
  /** Gives an in-store barcode to each of these products that has none. Audited. Returns how many got one. */
  assignInternalBarcodes = (ids: string[]): Promise<number> =>
    this.c.db.transaction('rw', [this.c.db.products, this.c.db.meta, this.c.db.audit], async () => {
      await this.c.allow('stock');
      let count = 0;
      for (const id of ids) {
        const before = await this.c.db.products.get(id);
        if (!before || before.archivedAt || clean(before.barcode)) continue;
        const after: Product = { ...before, barcode: await this.c.reserveInternalBarcode(), updatedAt: this.c.stamp() };
        await this.c.db.products.put(after);
        await this.c.audit({ entity: 'product', entityId: id, action: 'updated', ...changedFields(before, after, ['name']) });
        count += 1;
      }
      return count;
    });
  /**
   * Saves an import from Excel, all or nothing: new products (with their initial stock) and updates
   * of existing ones (price, cost, minimum, barcode, category; never the stock). Audited.
   */
  importMany = (rows: PlanRow[]): Promise<{ created: number; updated: number }> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.products, this.c.db.stockMovements, this.c.db.audit, this.c.db.meta, this.c.db.batches],
      async () => {
        await this.c.allow('stock');
        let created = 0;
        let updated = 0;
        for (const row of rows) {
          const p = row.product;
          if (row.action === 'create') {
            const input: ProductInput = {
              name: p.name,
              priceCents: p.priceCents,
              costCents: p.costCents,
              barcode: p.barcode,
              minStock: p.minStock ?? 0,
              category: p.category,
              ...(p.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
            };
            await this.create(input, p.stock ?? 0);
            created += 1;
          } else if (row.action === 'update' && row.productId) {
            const current = await this.c.db.products.get(row.productId);
            if (!current || current.archivedAt) throw new DomainError('not_found');
            await this.update(row.productId, {
              name: current.name,
              priceCents: p.priceCents,
              ...(p.costCents !== undefined ? { costCents: p.costCents } : {}),
              barcode: p.barcode ?? current.barcode,
              minStock: p.minStock ?? current.minStock,
              ...(p.category ? { category: p.category } : {}),
              unit: current.unit,
              taxRateBp: current.taxRateBp,
              taxExemption: current.taxExemption,
            });
            updated += 1;
          }
        }
        await this.c.audit({ entity: 'data', entityId: 'products_import', action: 'imported', after: { created, updated } });
        return { created, updated };
      },
    );
}
