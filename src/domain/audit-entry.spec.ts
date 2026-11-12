import { describe, expect, it } from 'vitest';
import { changedFields, purchaseLog, saleLog } from './audit-entry';
import { describeAudit } from './audit-describe';
import type { AuditEntry, Product, Purchase, Sale } from './types';

const at = '2026-11-12T10:00:00.000Z';
const sale: Sale = {
  id: 's1',
  number: 7,
  items: [
    {
      productId: 'p1',
      name: 'Arroz 1 kg',
      unitPriceCents: 120_000,
      quantity: 2,
      lineTotalCents: 240_000,
      unitCostCents: 100_000,
      barcode: '2000000000017',
    },
    { productId: 'p2', name: 'Óleo 1 L', unitPriceCents: 185_000, quantity: 1, lineTotalCents: 185_000 },
  ],
  totalCents: 425_000,
  currency: 'AOA',
  method: 'credit',
  customerId: 'c1',
  dueDate: '2026-11-27',
  deviceId: 'dev',
  createdAt: at,
  updatedAt: at,
};
const names = { product: () => 'Arroz', customer: () => 'Cliente', supplier: () => 'Fornecedor' };
const line = (e: Partial<AuditEntry>): AuditEntry => ({
  id: 'a',
  entity: 'sale',
  entityId: 's1',
  action: 'created',
  createdAt: at,
  updatedAt: at,
  ...e,
});

describe('what a log line keeps', () => {
  it('a sale: what describes it, much smaller than the sale, and the log reads it the same', () => {
    const light = saleLog(sale);
    expect(light).toEqual({ number: 7, totalCents: 425_000, method: 'credit', lines: 2, customerId: 'c1', dueDate: '2026-11-27' });
    expect(JSON.stringify(light).length).toBeLessThan(JSON.stringify(sale).length / 3);
    expect(describeAudit(line({ after: light }), names)).toEqual(describeAudit(line({ after: sale }), names));
    const voided = { ...sale, voidedAt: at, voidReason: 'Engano' };
    expect(describeAudit(line({ action: 'voided', after: saleLog(voided) }), names)).toEqual(
      describeAudit(line({ action: 'voided', before: sale, after: voided }), names),
    );
    const over = { ...sale, creditLimitOverride: { limitCents: 3_000_000, balanceBeforeCents: 2_900_000 } };
    expect(describeAudit(line({ after: saleLog(over) }), names)!.text).toContain('acima do limite');
  });

  it('a purchase: the same', () => {
    const purchase: Purchase = {
      id: 'b1',
      number: 3,
      supplierId: 'f1',
      items: [{ productId: 'p1', name: 'Arroz 1 kg', quantity: 10, unitCostCents: 95_000, lineTotalCents: 950_000 }],
      totalCents: 950_000,
      payment: 'credit',
      dueDate: '2026-11-20',
      createdAt: at,
      updatedAt: at,
    };
    const p = line({ entity: 'purchase', entityId: 'b1' });
    expect(describeAudit({ ...p, after: purchaseLog(purchase) }, names)).toEqual(describeAudit({ ...p, after: purchase }, names));
    const voided = { ...purchase, voidedAt: at, voidReason: 'Devolvida' };
    expect(describeAudit({ ...p, action: 'voided', after: purchaseLog(voided) }, names)).toEqual(
      describeAudit({ ...p, action: 'voided', before: purchase, after: voided }, names),
    );
  });

  it('a change keeps only what changed and the name, and the log says the same', () => {
    const before: Product = { id: 'p1', name: 'Sal 1 kg', priceCents: 30_000, stock: 10, minStock: 2, createdAt: at, updatedAt: at };
    const after: Product = { ...before, priceCents: 35_000, updatedAt: '2026-11-12T11:00:00.000Z' };
    expect(changedFields(before, after, ['name'])).toEqual({
      before: { name: 'Sal 1 kg', priceCents: 30_000 },
      after: { name: 'Sal 1 kg', priceCents: 35_000 },
    });
    const entry = line({ entity: 'product', entityId: 'p1', action: 'updated' });
    expect(describeAudit({ ...entry, ...changedFields(before, after, ['name']) }, names)).toEqual(
      describeAudit({ ...entry, before, after }, names),
    );
    // A field taken out (the cost price cleared) shows on one side only.
    const withCost = { ...before, costCents: 25_000 };
    expect(changedFields(withCost, before, ['name'])).toEqual({
      before: { name: 'Sal 1 kg', costCents: 25_000 },
      after: { name: 'Sal 1 kg' },
    });
    expect(describeAudit({ ...entry, ...changedFields(withCost, before, ['name']) }, names)!.text).toBe(
      'Sal 1 kg: preço de custo 250 Kz → —',
    );
    // Nothing changed: only the name.
    expect(changedFields(before, { ...before, updatedAt: 'later' }, ['name'])).toEqual({
      before: { name: 'Sal 1 kg' },
      after: { name: 'Sal 1 kg' },
    });
  });
});
