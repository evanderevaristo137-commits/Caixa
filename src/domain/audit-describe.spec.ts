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
  it('says when a copy was restored, when a restore was undone and when the backup password changed', () => {
    const restored = describeAudit(
      entry({ entity: 'data', entityId: 'backup', action: 'imported', after: { exportedAt: '2026-11-10T17:32:00Z', source: 'file' } }),
      names,
    )!;
    expect(restored.text).toMatch(/^Cópia de segurança de 10\/11\/2026 .+ recuperada \(todos os dados substituídos\)$/);
    expect(describeAudit(entry({ entity: 'data', action: 'imported' }), names)!.text).toBe(
      'Cópia de segurança recuperada (todos os dados substituídos)',
    );
    expect(describeAudit(entry({ entity: 'data', action: 'imported', after: { source: 'safety' } }), names)).toEqual({
      text: 'Recuperação desfeita: voltaram os dados que estavam no telemóvel antes dela',
      important: true,
    });
    const password = (p: string) =>
      describeAudit(entry({ entity: 'settings', entityId: 'backup_password', after: { password: p } }), names)!.text;
    expect(password('set')).toBe('Cópias de segurança protegidas com palavra-passe');
    expect(password('changed')).toBe('Palavra-passe das cópias de segurança mudada');
    expect(password('removed')).toBe('Palavra-passe das cópias de segurança retirada');
    expect(password('adopted')).toBe('Cópias de segurança protegidas com a palavra-passe da cópia recuperada');
  });
});

describe('describeAudit — credit limit', () => {
  it('flags a credit sale accepted above the limit', () => {
    const after = { number: 9, totalCents: 550_000, creditLimitOverride: { limitCents: 3_000_000, balanceBeforeCents: 2_955_000 } };
    expect(describeAudit(entry({ action: 'created', after }), names)).toEqual({
      text: 'Venda n.º 9 a crédito acima do limite: 5.500 Kz (já devia 29.550 Kz, limite 30.000 Kz)',
      important: true,
    });
  });
  it('describes money out, voided money out and the end-of-day count as important', () => {
    expect(
      describeAudit(
        entry({ entity: 'expense', after: { category: 'energy', amountCents: 400_000, fromCash: true, note: 'Gasóleo do gerador' } }),
        names,
      ),
    ).toEqual({ text: 'Saída de dinheiro: Luz e gerador — 4.000 Kz (da caixa) · Gasóleo do gerador', important: true });
    expect(
      describeAudit(
        entry({
          entity: 'expense',
          action: 'voided',
          after: { category: 'withdrawal', amountCents: 2_000_000, voidReason: 'Valor errado' },
        }),
        names,
      ),
    ).toEqual({ text: 'Saída anulada: Retirada do dono — 20.000 Kz. Motivo: Valor errado', important: true });
    expect(
      describeAudit(
        entry({
          entity: 'cash_close',
          after: { day: '2026-11-08', expectedCents: 1_250_000, countedCents: 1_230_000, differenceCents: -20_000 },
        }),
        names,
      ),
    ).toEqual({ text: 'Dia 08/11/2026 fechado: contou 12.300 Kz, devia ter 12.500 Kz — faltam 200 Kz', important: true });
    expect(
      describeAudit(
        entry({
          entity: 'product',
          action: 'updated',
          before: { name: 'Bolacha', priceCents: 500, costCents: 350 },
          after: { name: 'Bolacha', priceCents: 500 },
        }),
        names,
      )?.text,
    ).toBe('Bolacha: preço de custo 3,50 Kz → —');
  });

  it('describes the INSS plan and payments without ever showing the social security number', () => {
    const plan = { wages: 1, modality: 'normal', startMonth: '2026-11', number: '0012345' };
    const settings = (inss?: object) =>
      entry({ entity: 'settings', action: 'updated', before: { storeName: 'Loja' }, after: { storeName: 'Loja', inss } });
    expect(describeAudit(settings(plan), names)).toEqual({
      text: 'Reforma (INSS): começou a acompanhar — 1 salário mínimo, 8.000 Kz por mês',
      important: true,
    });
    expect(
      describeAudit(
        entry({
          entity: 'settings',
          action: 'updated',
          before: { inss: plan },
          after: { inss: { ...plan, wages: 2, modality: 'extended' } },
        }),
        names,
      )!.text,
    ).toBe('Reforma (INSS): plano alterado — 2 salários mínimos, 22.000 Kz por mês');
    expect(describeAudit(entry({ entity: 'settings', action: 'updated', before: { inss: plan }, after: {} }), names)!.text).toBe(
      'Reforma (INSS): deixou de acompanhar',
    );
    const paid = { month: '2026-10', amountCents: 800_000, receipt: 'REF 123' };
    expect(describeAudit(entry({ entity: 'inss_contribution', action: 'created', after: paid }), names)).toEqual({
      text: 'Pagamento ao INSS registado: Outubro de 2026, 8.000 Kz (comprovativo REF 123)',
      important: true,
    });
    expect(
      describeAudit(entry({ entity: 'inss_contribution', action: 'voided', after: { ...paid, voidReason: 'Mês errado' } }), names)!.text,
    ).toBe('Pagamento ao INSS anulado: Outubro de 2026, 8.000 Kz. Motivo: Mês errado');
  });
});
