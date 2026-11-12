import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CaixaDB } from './db';
import { DomainError, Store } from './store';
import { costAfterPurchase } from '../domain/purchases';
import { describeAudit } from '../domain/audit-describe';

let db: CaixaDB;
let store: Store;
let n = 0;
beforeEach(() => {
  db = new CaixaDB(`test-cost-${n++}`);
  store = new Store(db);
});
afterEach(async () => {
  await db.delete();
});

describe('cost price after a purchase', () => {
  it('is the cost of the purchase, or the average when chosen', () => {
    const shelf = { stock: 10, costCents: 30_000 };
    expect(costAfterPurchase(shelf, 10, 40_000)).toBe(40_000);
    expect(costAfterPurchase(shelf, 10, 40_000, 'average')).toBe(35_000);
    expect(costAfterPurchase({ stock: 2, costCents: 10_000 }, 1, 10_001, 'average')).toBe(10_000); // to the cêntimo
    // No stock (or negative), or no cost known: the purchase cost.
    expect(costAfterPurchase({ stock: 0, costCents: 30_000 }, 5, 40_000, 'average')).toBe(40_000);
    expect(costAfterPurchase({ stock: -3, costCents: 30_000 }, 5, 40_000, 'average')).toBe(40_000);
    expect(costAfterPurchase({ stock: 10 }, 5, 40_000, 'average')).toBe(40_000);
    // Weighed goods: grams weigh, costs per kg.
    expect(costAfterPurchase({ stock: 3_000, costCents: 100_000 }, 1_000, 140_000, 'average')).toBe(110_000);
  });

  it('a shop can choose the average cost (audited), and purchases follow it', async () => {
    const rice = await store.products.create({ name: 'Arroz 1 kg', priceCents: 120_000, costCents: 30_000, minStock: 0 }, 10);
    await store.purchases.create({ lines: [{ productId: rice.id, quantity: 10, unitCostCents: 40_000 }], payment: 'cash' });
    expect((await store.products.get(rice.id))!.costCents).toBe(40_000);

    await store.settings.save({ costMethod: 'average' });
    await store.purchases.create({ lines: [{ productId: rice.id, quantity: 20, unitCostCents: 25_000 }], payment: 'cash' });
    // 20 at 400 Kz on the shelf and 20 arrive at 250 Kz: 325 Kz.
    expect((await store.products.get(rice.id))!.costCents).toBe(32_500);

    await expect(store.settings.save({ costMethod: 'fifo' as 'average' })).rejects.toBeInstanceOf(DomainError);
    await store.settings.save({ costMethod: undefined });
    expect((await store.settings.get()).costMethod).toBeUndefined();
    const names = { product: () => undefined, customer: () => undefined };
    const log = (await store.auditLog.list()).map((e) => describeAudit(e, names)?.text);
    expect(log).toContain('Preço de custo: passa a ser o custo médio das compras');
    expect(log).toContain('Preço de custo: passa a ser o da última compra');
  });
});
