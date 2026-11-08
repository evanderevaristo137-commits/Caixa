import { describe, expect, it } from 'vitest';
import { statementLines, statementText } from './statement';

const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const item = (name: string, quantity: number) => ({ productId: name, name, unitPriceCents: 100, quantity, lineTotalCents: 100 * quantity });
const sale = (number: number, day: number, totalCents: number, dueDate: string, items = [item('Arroz 1 kg', 2)], extra = {}) => ({
  number,
  customerId: 'c1',
  method: 'credit' as const,
  totalCents,
  createdAt: at(day),
  dueDate,
  items,
  ...extra,
});
const pay = (day: number, amountCents: number) => ({ customerId: 'c1', amountCents, createdAt: at(day, 12), method: 'cash' as const });

describe('customer statement', () => {
  it('shows only what explains the current debt, with a running balance', () => {
    const sales = [
      sale(1, 1, 300_000, '2026-11-08'),
      sale(2, 3, 470_000, '2026-11-10', [item('Arroz 1 kg', 2), item('Óleo 1 L', 1), item('Sal', 1), item('Fósforos', 3)]),
      sale(3, 4, 999_000, '2026-11-20', undefined, { voidedAt: at(4, 11) }),
      sale(4, 6, 320_000, '2026-11-21'),
    ];
    // The first purchase was fully paid on day 2: it is left out.
    const payments = [pay(2, 300_000), pay(5, 200_000)];
    const lines = statementLines('c1', sales, payments);
    expect(lines.map((l) => [l.kind, l.balanceCents])).toEqual([
      ['purchase', 470_000],
      ['payment', 270_000],
      ['purchase', 590_000],
    ]);
    expect(lines[0]!.text).toBe('03/11 — Compra n.º 2: 4.700 Kz (2 × Arroz 1 kg, 1 × Óleo 1 L, 1 × Sal e mais 1) · pagar até 10/11/2026');
    expect(lines[1]!.text).toBe('05/11 — Pagamento: 2.000 Kz (Numerário)');
  });

  it('is a polite, non-fiscal message with the total and the next payment', () => {
    const text = statementText(
      { id: 'c1', name: 'Joana Exemplo' },
      'Loja Exemplo',
      [sale(2, 3, 470_000, '2026-11-07')],
      [pay(5, 200_000)],
      new Date(2026, 10, 8, 9),
    );
    expect(text).toBe(
      [
        '*Extracto de conta — Loja Exemplo*',
        'Joana Exemplo · 08/11/2026',
        '',
        '• 03/11 — Compra n.º 2: 4.700 Kz (2 × Arroz 1 kg) · pagar até 07/11/2026',
        '   Saldo: 4.700 Kz',
        '• 05/11 — Pagamento: 2.000 Kz (Numerário)',
        '   Saldo: 2.700 Kz',
        '',
        '*Total em dívida: 2.700 Kz*',
        'Próximo pagamento: 2.700 Kz até 07/11/2026 (em atraso)',
        '',
        'Documento não fiscal — não serve de factura.',
        'Obrigado pela confiança!',
      ].join('\n'),
    );
  });

  it('says when the account is settled, or in the customer favour', () => {
    const now = new Date(2026, 10, 8);
    expect(statementText({ id: 'c1', name: 'Ana' }, 'Loja', [sale(1, 1, 100_000, '2026-11-08')], [pay(2, 100_000)], now)).toContain(
      '*A conta está em dia.*',
    );
    expect(statementText({ id: 'c1', name: 'Ana' }, 'Loja', [sale(1, 1, 100_000, '2026-11-08')], [pay(2, 150_000)], now)).toContain(
      'Saldo a seu favor: 500 Kz',
    );
  });
});
