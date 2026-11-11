import { describe, expect, it } from 'vitest';
import { pilotText, type PilotInput } from './pilot';

const now = new Date(2026, 10, 8, 18);
const sale = (daysAgo: number, totalCents: number, method: 'cash' | 'kwik' | 'credit' = 'cash', voidedAt?: string) => ({
  createdAt: new Date(2026, 10, 8 - daysAgo, 10).toISOString(),
  totalCents,
  method,
  voidedAt,
});
const base: PilotInput = {
  storeName: 'Loja Exemplo',
  deviceId: '3f2a9c1b-0000-4000-8000-000000000000',
  demo: false,
  now,
  firstUseAt: new Date(2026, 9, 25, 9).toISOString(),
  sales: [
    sale(0, 100_000),
    sale(0, 50_000, 'kwik'),
    sale(3, 200_000, 'credit'),
    sale(10, 150_000),
    sale(10, 10_000, 'cash', 'x'),
    sale(40, 999_000),
  ],
  customersOwing: 2,
  owedCents: 250_000,
  customersOverdue: 1,
  products: 33,
  productsWithCost: 30,
  closes: 12,
  expenses: 1,
  purchases: 3,
  lastBackupAt: new Date(2026, 10, 5).toISOString(),
};

describe('pilot summary', () => {
  it('has only the shop numbers, never customer names or phones', () => {
    expect(pilotText(base)).toBe(
      [
        '*Resumo do piloto — Caixa*',
        'Loja: Loja Exemplo (código 3f2a9c1b)',
        '08/11/2026 · a usar desde 25/10/2026 (15 dias)',
        '',
        'Últimos 7 dias: 2 dias com vendas · 3 vendas · 3.500 Kz',
        'Últimos 30 dias: 3 dias com vendas · 4 vendas · 5.000 Kz',
        'Pagamentos electrónicos (30 dias): 10%',
        'Vendas anuladas (30 dias): 1',
        'Clientes com dívida: 2 · em dívida: 2.500 Kz · em atraso: 1',
        'Produtos: 33 (30 com preço de custo)',
        'Também usou (30 dias): 12 fechos do dia · 1 saída · 3 compras',
        'Reforma (INSS): não usa',
        'Última cópia de segurança: 05/11/2026',
        '',
        'Só números da loja: nenhum nome nem telefone de clientes.',
      ].join('\n'),
    );
  });

  it('tells whether the digital payments alarm is on', () => {
    const text = pilotText({ ...base, digital: { shareBp: 2100, minShareBp: 4000, alarm: true } });
    expect(text).toContain(
      'Pagamentos electrónicos (30 dias): 10%\nPagamentos digitais (7 dias completos): 21% · mínimo 40% · alarme: SIM\n',
    );
    expect(pilotText({ ...base, digital: { shareBp: 4500, alarm: false } })).toContain(
      'Pagamentos digitais (7 dias completos): 45% · alarme: não',
    );
  });

  it('says whether the owner follows the INSS in the app, with a count only', () => {
    expect(pilotText({ ...base, inssMonths: 3 })).toContain('Reforma (INSS): acompanha na app · 3 pagamentos registados\n');
    expect(pilotText({ ...base, inssMonths: 1 })).toContain('Reforma (INSS): acompanha na app · 1 pagamento registado\n');
  });

  it('marks the demo so it is not counted, and copes with a new shop', () => {
    const text = pilotText({ ...base, demo: true, sales: [], firstUseAt: undefined, lastBackupAt: undefined });
    expect(text.startsWith('*DEMONSTRAÇÃO — dados fictícios, não contar no piloto*')).toBe(true);
    expect(text).toContain('Últimos 7 dias: 0 dias com vendas · 0 vendas · 0 Kz');
    expect(text).not.toContain('Pagamentos electrónicos');
    expect(text).toContain('Última cópia de segurança: nenhuma');
  });
});
