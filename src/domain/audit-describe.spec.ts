import { describe, expect, it } from 'vitest';
import { describeAudit } from './audit-describe';
import type { AuditEntry } from './types';

const names = { product: (id: string) => ({ p1: 'Arroz 1 kg' })[id], customer: (id: string) => ({ c1: 'Maria Exemplo' })[id] };
const entry = (e: Partial<AuditEntry>): AuditEntry => ({
  id: 'a',
  entityId: 'x',
  createdAt: '',
  updatedAt: '',
  entity: 'sale',
  action: 'created',
  ...e,
});

describe('describeAudit', () => {
  it('describes voids with the reason, as important', () => {
    expect(
      describeAudit(entry({ action: 'voided', after: { number: 12, totalCents: 550_000, voidReason: 'Engano no registo' } }), names),
    ).toEqual({
      text: 'Venda n.º 12 anulada (5.500 Kz). Motivo: Engano no registo',
      important: true,
    });
  });
  it('describes price changes as important, other product edits as routine', () => {
    const before = { name: 'Arroz 1 kg', priceCents: 120_000, minStock: 5 };
    expect(
      describeAudit(entry({ entity: 'product', action: 'updated', before, after: { ...before, priceCents: 130_000 } }), names),
    ).toEqual({
      text: 'Arroz 1 kg: preço 1.200 Kz → 1.300 Kz',
      important: true,
    });
    expect(
      describeAudit(entry({ entity: 'product', action: 'updated', before, after: { ...before, minStock: 8 } }), names)!.important,
    ).toBe(false);
  });
  it('describes stock adjustments and customer payments', () => {
    expect(
      describeAudit(
        entry({ entity: 'stock_movement', after: { productId: 'p1', type: 'adjustment', delta: -2, reason: 'Partido' } }),
        names,
      )!.text,
    ).toBe('Acerto de stock: Arroz 1 kg -2. Motivo: Partido');
    expect(
      describeAudit(entry({ entity: 'credit_payment', after: { customerId: 'c1', amountCents: 300_000, method: 'paypay' } }), names),
    ).toEqual({
      text: 'Pagamento recebido de Maria Exemplo: 3.000 Kz — PayPay',
      important: true,
    });
  });
  it('hides internal bookkeeping', () => {
    expect(describeAudit(entry({ entity: 'stock_movement', after: { productId: 'p1', type: 'sale', delta: -1 } }), names)).toBeNull();
    expect(
      describeAudit(
        entry({ entity: 'customer', action: 'updated', before: { name: 'A' }, after: { name: 'A', lastRemindedAt: 'x' } }),
        names,
      ),
    ).toBeNull();
  });
  it('flags restores and owner code changes', () => {
    expect(describeAudit(entry({ entity: 'data', action: 'imported' }), names)!.important).toBe(true);
    expect(describeAudit(entry({ entity: 'settings', entityId: 'owner_pin', after: { pin: 'removed' } }), names)!.text).toBe(
      'Código do dono removido',
    );
  });
});
