import { describe, expect, it } from 'vitest';
import { buildStoreSheet, storeSheetText } from './store-sheet';

const sale = (y: number, m: number, d: number, totalCents: number, method: 'cash' | 'kwik' | 'credit' = 'cash', costShare?: number) => ({
  createdAt: new Date(y, m, d, 10).toISOString(),
  totalCents,
  method,
  items: [
    {
      productId: 'p',
      name: 'p',
      unitPriceCents: 0,
      quantity: 1,
      lineTotalCents: totalCents,
      unitCostCents: costShare === undefined ? undefined : Math.round(totalCents * costShare),
    },
  ],
});

describe('store sheet', () => {
  const now = new Date(2026, 10, 8, 18);

  it('sums up to 12 months, month by month, from the first sale', () => {
    const sheet = buildStoreSheet({
      storeName: 'Loja Exemplo',
      nif: '5000000000',
      demo: false,
      sales: [
        sale(2026, 9, 25, 100_000, 'cash', 0.8),
        sale(2026, 9, 26, 50_000, 'kwik', 0.8),
        sale(2026, 10, 2, 200_000, 'credit', 0.75),
        sale(2026, 10, 8, 50_000, 'cash', 0.8),
        { ...sale(2026, 10, 8, 900_000), voidedAt: 'x' },
      ],
      payments: [{ createdAt: new Date(2026, 10, 5).toISOString(), amountCents: 100_000 }],
      owedCents: 100_000,
      overdueCustomers: 1,
      now,
    });
    expect(sheet).toMatchObject({
      periodDays: 15,
      activeDays: 4,
      totalSalesCents: 400_000,
      count: 4,
      avgDailyCents: 26_667,
      electronicShareBp: 1250,
      creditSoldCents: 200_000,
      creditPaidCents: 100_000,
    });
    expect(sheet.profit).toEqual({ profitCents: 90_000, marginBp: 2250, partial: false });
    expect(sheet.months.map((m) => [m.label, m.salesCents, m.count])).toEqual([
      ['out. 2026', 150_000, 2],
      ['nov. 2026', 250_000, 2],
    ]);
    expect(sheet.growthBp).toBeUndefined();

    const text = storeSheetText(sheet);
    expect(text).toContain('*Ficha da loja — Loja Exemplo*\nNIF: 5000000000');
    expect(text).toContain('Dados de 25/10/2026 a 08/11/2026 (15 dias, 4 com vendas)');
    expect(text).toContain('Vendas: 4.000 Kz em 4 vendas (média de 266,67 Kz por dia)');
    expect(text).toContain('Pagamentos electrónicos: 13% das vendas');
    expect(text).toContain('Lucro estimado: 900 Kz (margem de 23%)');
    expect(text).toContain('Clientes a crédito: vendido 2.000 Kz, recebido 1.000 Kz');
    expect(text).toContain('Em dívida hoje: 1.000 Kz · 1 cliente em atraso');
    expect(text).toContain('• out. 2026: 1.500 Kz (2 vendas)');
    expect(text).toContain('Não é um documento fiscal nem contabilístico.');
    expect(text).not.toContain('DEMONSTRAÇÃO');
  });

  it('compares the last 3 complete months with the 3 before, and marks the demo', () => {
    const sales = [4, 5, 6].map((m) => sale(2026, m, 10, 100_000)).concat([7, 8, 9].map((m) => sale(2026, m, 10, 125_000)));
    const sheet = buildStoreSheet({ storeName: 'Loja', demo: true, sales, payments: [], owedCents: 0, overdueCustomers: 0, now });
    // Complete months: mai–out; the last 3 (ago, set, out) = 3.750 Kz against mai, jun, jul = 3.000 Kz.
    expect(sheet.growthBp).toBe(2500);
    const text = storeSheetText(sheet);
    expect(text.startsWith('*DEMONSTRAÇÃO — dados fictícios, não correspondem a uma loja real.*')).toBe(true);
    expect(text).toContain('Últimos 3 meses contra os 3 anteriores: +25%');
    expect(sheet.profit).toBeUndefined();
  });

  it('shows the INSS contributions the shop recorded, marked as its own record', () => {
    const input = {
      storeName: 'Loja',
      demo: false,
      sales: [sale(2026, 10, 10, 100_000)],
      payments: [],
      owedCents: 0,
      overdueCustomers: 0,
      now,
    };
    expect(storeSheetText(buildStoreSheet({ ...input, inss: { months: 14, streak: 13 } }))).toContain(
      'INSS (registado pela loja): 14 meses pagos, 13 seguidos\n',
    );
    expect(storeSheetText(buildStoreSheet({ ...input, inss: { months: 1, streak: 1 } }))).toContain(
      'INSS (registado pela loja): 1 mês pago\n',
    );
    expect(storeSheetText(buildStoreSheet(input))).not.toContain('INSS');
  });

  it('takes returns off the estimated profit', () => {
    const base = {
      storeName: 'Loja Exemplo',
      demo: false,
      sales: [sale(2026, 10, 2, 100_000, 'cash', 0.8)],
      payments: [],
      owedCents: 0,
      overdueCustomers: 0,
      now,
    };
    const back = {
      createdAt: new Date(2026, 10, 3).toISOString(),
      totalCents: 50_000,
      restock: false,
      items: [{ productId: 'p', name: 'p', quantity: 1, refundCents: 50_000, costCents: 40_000 }],
    };
    expect(buildStoreSheet(base).profit?.profitCents).toBe(20_000);
    // Money given back, goods lost: the profit drops by the 500 Kz given back.
    const sheet = buildStoreSheet({ ...base, returns: [back] });
    expect(sheet.profit?.profitCents).toBe(20_000 - 50_000);
    expect(sheet.months.at(-1)!.profitCents).toBe(-30_000);
  });

  it('says when there are no sales yet', () => {
    const sheet = buildStoreSheet({ storeName: 'Loja', demo: false, sales: [], payments: [], owedCents: 0, overdueCustomers: 0, now });
    expect(storeSheetText(sheet)).toContain('Ainda não há vendas registadas.');
  });
});
