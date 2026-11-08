import { describe, expect, it } from 'vitest';
import { payablesBook, payableStatus, totalPayable } from './payables';
import { purchaseLineTotal, purchaseTotal, supplierOrderText } from './purchases';

const now = new Date(2026, 10, 8, 10, 0);
const at = (day: number) => new Date(2026, 10, day, 9).toISOString();
const purchase = (supplierId: string, day: number, totalCents: number, dueDate: string, extra = {}) => ({
  supplierId,
  payment: 'credit' as const,
  totalCents,
  createdAt: at(day),
  dueDate,
  ...extra,
});

describe('what the shop owes suppliers', () => {
  it('settles the oldest purchases first and tells when the next payment is due', () => {
    const purchases = [
      purchase('s1', 1, 5_000_000, '2026-11-06'),
      purchase('s1', 4, 3_000_000, '2026-11-09'),
      purchase('s1', 5, 1_000_000, '2026-11-20', { voidedAt: at(6) }),
      { supplierId: 's1', payment: 'cash' as const, totalCents: 999_999, createdAt: at(2) },
    ];
    const s = payableStatus('s1', purchases, [{ supplierId: 's1', amountCents: 2_000_000 }], now);
    expect(s.balanceCents).toBe(6_000_000);
    expect(s.nextDueDate).toBe('2026-11-06');
    expect(s.dueState).toBe('overdue');
    expect(s.daysOverdue).toBe(2);
    expect(s.dueNowCents).toBe(3_000_000);

    const paidFirst = payableStatus('s1', purchases, [{ supplierId: 's1', amountCents: 5_000_000 }], now);
    expect(paidFirst).toMatchObject({
      balanceCents: 3_000_000,
      nextDueDate: '2026-11-09',
      dueState: 'soon',
      daysUntilDue: 1,
      dueNowCents: 0,
    });
    expect(payableStatus('s1', purchases, [{ supplierId: 's1', amountCents: 9_000_000 }], now)).toEqual({
      supplierId: 's1',
      balanceCents: -1_000_000,
      dueNowCents: 0,
    });
  });

  it('lists suppliers by urgency and sums what is owed', () => {
    const suppliers = ['Armazém B', 'Armazém A', 'Padaria'].map((name, i) => ({ id: `s${i}`, name, createdAt: '', updatedAt: '' }));
    const book = payablesBook(suppliers, [purchase('s0', 7, 1_000_000, '2026-11-30'), purchase('s2', 7, 500_000, '2026-11-08')], [], now);
    expect(book.map((b) => [b.supplier.name, b.dueState])).toEqual([
      ['Padaria', 'today'],
      ['Armazém B', 'later'],
      ['Armazém A', undefined],
    ]);
    expect(totalPayable(book)).toBe(1_500_000);
  });
});

describe('purchases', () => {
  it('costs lines by the unit or by the kilo', () => {
    expect(purchaseLineTotal({ quantity: 24, unitCostCents: 37_000 })).toBe(888_000);
    expect(purchaseLineTotal({ quantity: 25_000, soldBy: 'weight', unitCostCents: 90_000 })).toBe(2_250_000);
    expect(
      purchaseTotal([
        { quantity: 24, unitCostCents: 37_000 },
        { quantity: 2, unitCostCents: 100 },
      ]),
    ).toBe(888_200);
  });

  it('writes a polite order for the supplier', () => {
    expect(
      supplierOrderText(
        'Loja Exemplo',
        'Armazém Exemplo',
        [
          { name: 'Óleo 1 L', suggested: 13 },
          { name: 'Feijão a granel', suggested: 9_500, soldBy: 'weight' },
        ],
        new Date(2026, 10, 8, 9),
      ),
    ).toBe(
      '*Encomenda — Loja Exemplo*\n08/11/2026\n\nBom dia, Armazém Exemplo! Queria encomendar:\n• Óleo 1 L: 13\n• Feijão a granel: 9,5 kg\n\nObrigado!',
    );
  });
});
