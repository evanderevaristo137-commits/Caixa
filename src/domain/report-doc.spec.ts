import { describe, expect, it } from 'vitest';
import { salesByCategory } from './categories';
import { debtorsReport } from './debtors';
import { financeSummary, soldAndReceived } from './finance';
import { profitByProduct } from './profit';
import { purchaseReport } from './purchase-report';
import {
  cellText,
  debtorsDoc,
  financeDoc,
  purchasesDoc,
  reportCsv,
  salesDoc,
  stockDoc,
  type ReportDoc,
  type ReportHead,
} from './report-doc';
import { buckets, fillBuckets, periodRange, periodSummary, topProducts } from './reports';
import { restockList, stillProducts } from './stock-insights';
import { DEMO_NOTE } from './store-sheet';
import type { Customer, PaymentMethod, Product } from './types';

const now = new Date(2026, 10, 12, 15, 0); // Thursday 12 November 2026, 15:00
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const head: ReportHead = { storeName: 'Loja Exemplo', nif: '5000000000', demo: false, madeAt: '12/11/2026 15:00' };

const line = (productId: string, name: string, lineTotalCents: number, unitCostCents?: number) => ({
  productId,
  name,
  unitPriceCents: lineTotalCents,
  quantity: 1,
  lineTotalCents,
  ...(unitCostCents !== undefined ? { unitCostCents } : {}),
});
const sale = (day: number, method: PaymentMethod, lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) => ({
  createdAt: at(day),
  method,
  totalCents: lines.reduce((a, l) => a + l.lineTotalCents, 0),
  items: lines,
  ...extra,
});

/** Every row of a table, as it reads on paper. */
const table = (doc: ReportDoc, title: string) => {
  const found = doc.tables.find((x) => x.title === title);
  if (!found) throw new Error(`no table «${title}»`);
  return found.rows.map((r) => r.map(cellText));
};
const csvLines = (doc: ReportDoc) =>
  reportCsv(doc)
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');

describe('the spreadsheet of a report', () => {
  const doc: ReportDoc = {
    ...head,
    period: 'De 06/11/2026 a 12/11/2026',
    title: 'Contas da loja',
    tables: [
      {
        title: 'Resumo',
        header: ['O quê', 'Valor'],
        rows: [
          ['Vendas; a dinheiro', { kz: 1_234_550 }],
          ['Vendas', 3],
        ],
      },
    ],
    notes: ['Não é um documento fiscal.'],
  };

  it('has the shop, the report, the period and the date on top, money as numbers with a decimal comma, and the notes', () => {
    const csv = reportCsv(doc);
    expect(csv.startsWith('\uFEFF')).toBe(true); // Excel reads the accents
    expect(csvLines(doc)).toEqual([
      'Loja Exemplo',
      'NIF 5000000000',
      'Contas da loja',
      'De 06/11/2026 a 12/11/2026',
      'Feito em 12/11/2026 15:00',
      '',
      'Resumo',
      'O quê;Valor',
      '"Vendas; a dinheiro";12345,50',
      'Vendas;3',
      '',
      'Não é um documento fiscal.',
    ]);
  });

  it('says so first when made in the demonstration', () => {
    expect(csvLines({ ...doc, demo: true })[0]).toBe(DEMO_NOTE);
  });

  it('on paper, money is written in Kz', () => {
    expect(cellText({ kz: 1_234_550 })).toBe('12.345,50 Kz');
    expect(cellText({ kz: -50_000 })).toBe('-500 Kz');
    expect(cellText(3)).toBe('3');
  });
});

describe('«Contas da loja»', () => {
  const range = { from: new Date(2026, 10, 12), to: new Date(2026, 10, 13) };
  const input = {
    sales: [
      sale(12, 'cash', [line('rice', 'Arroz 1 kg', 100_000, 80_000)]),
      sale(12, 'credit', [line('rice', 'Arroz 1 kg', 50_000, 40_000)]),
    ],
    payments: [{ createdAt: at(12), amountCents: 20_000, method: 'cash' as const }],
    expenses: [{ createdAt: at(12), category: 'rent' as const, amountCents: 10_000, fromCash: true }],
    purchases: [],
    supplierPayments: [],
    returns: [],
  };

  it('has the same three parts as the screen, and the notice that it is not a fiscal document', () => {
    const doc = financeDoc(financeSummary(input, range.from, range.to), { count: 0 }, { ...head, period: '12/11/2026' });
    expect(doc.title).toBe('Contas da loja');
    expect(doc.tables.map((x) => x.title)).toEqual(['Vendido e recebido', 'Entradas e saídas de dinheiro', 'Resultado estimado']);
    expect(table(doc, 'Vendido e recebido')).toEqual([
      ['Vendido (2 vendas)', '1.500 Kz'],
      ['Recebido', '1.200 Kz'],
      ['Vendido a crédito (ainda por receber)', '500 Kz'],
      ['Dívidas pagas por clientes', '200 Kz'],
    ]);
    const result = table(doc, 'Resultado estimado');
    expect(result).toContainEqual(['Lucro bruto estimado (Margem de 20%)', '300 Kz']);
    expect(result.at(-1)).toEqual(['Resultado estimado', '200 Kz']);
    expect(doc.notes.at(-1)).toMatch(/não é um documento fiscal nem contabilístico/);
  });

  it('without cost prices, says how to see the profit instead of inventing it', () => {
    const noCost = { ...input, sales: [sale(12, 'cash', [line('rice', 'Arroz 1 kg', 100_000)])] };
    const doc = financeDoc(financeSummary(noCost, range.from, range.to), { count: 0 }, head);
    expect(table(doc, 'Resultado estimado')).toEqual([['Ponha o preço de custo nos produtos para a app estimar o lucro.']]);
  });
});

describe('«Vendas dos últimos 7 dias»', () => {
  const build = (sales: ReturnType<typeof sale>[], categoryOf = new Map<string, string>()) => {
    const { from, to, prevFrom } = periodRange('7d', now);
    const inPeriod = sales.filter((s) => s.createdAt >= from.toISOString());
    return salesDoc(
      {
        kind: '7d',
        current: periodSummary(sales, [], [], from, to),
        previous: periodSummary(sales, [], [], prevFrom, from),
        money: soldAndReceived(inPeriod, []),
        cols: fillBuckets(buckets('7d', now), sales),
        top: topProducts(inPeriod, 5),
        topProfit: profitByProduct(inPeriod).slice(0, 5),
        byCategory: salesByCategory(inPeriod, categoryOf),
      },
      { ...head, period: 'De 06/11/2026 a 12/11/2026' },
    );
  };

  it('has the totals against the 7 days before, a line per day, how they paid and the best sellers', () => {
    const doc = build([
      sale(2, 'cash', [line('rice', 'Arroz 1 kg', 100_000, 80_000)]), // the 7 days before
      sale(11, 'cash', [line('rice', 'Arroz 1 kg', 100_000, 80_000)]),
      sale(12, 'kwik', [line('oil', 'Óleo 1 L', 50_000, 40_000), line('rice', 'Arroz 1 kg', 100_000, 80_000)]),
      sale(12, 'cash', [line('oil', 'Óleo 1 L', 999_000)], { voidedAt: at(12, 11) }), // voided: never counts
    ]);
    expect(doc.title).toBe('Vendas dos últimos 7 dias');
    const summary = table(doc, 'Resumo');
    expect(summary.slice(0, 5)).toEqual([
      ['Vendido', '2.500 Kz'],
      ['Vendido nos 7 dias antes', '1.000 Kz'],
      ['Variação', '+150%'],
      ['N.º de vendas', '2'],
      ['Venda média', '1.250 Kz'],
    ]);
    expect(summary).toContainEqual(['Lucro estimado (Margem de 20%)', '500 Kz']);
    const days = table(doc, 'Vendas por dia');
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual(['qui., 12/11', '1.500 Kz', '1', '300 Kz']);
    expect(table(doc, 'Como pagaram')).toEqual([
      ['QR KWiK', '1.500 Kz', '60%'],
      ['Numerário', '1.000 Kz', '40%'],
    ]);
    expect(table(doc, 'Mais vendidos')[0]).toEqual(['Arroz 1 kg', '2', '2.000 Kz']);
    // No categories in this shop yet: no table for them (as on the screen).
    expect(doc.tables.some((x) => x.title === 'Vendas por categoria')).toBe(false);
  });

  it('without cost prices: no profit column and no profit note, only the hint', () => {
    const doc = build([sale(12, 'cash', [line('rice', 'Arroz 1 kg', 100_000)])]);
    expect(table(doc, 'Resumo')).toContainEqual(['Lucro estimado', 'Ponha o preço de custo nos produtos para ver o lucro.']);
    expect(doc.tables.find((x) => x.title === 'Vendas por dia')?.header).toEqual(['Dia', 'Vendido', 'N.º de vendas']);
    expect(doc.notes).toHaveLength(1);
  });

  it('with categories, adds the sales by category', () => {
    const doc = build([sale(12, 'cash', [line('rice', 'Arroz 1 kg', 100_000, 80_000)])], new Map([['rice', 'Mercearia']]));
    expect(table(doc, 'Vendas por categoria')).toEqual([['Mercearia', '1.000 Kz', '100%', '200 Kz']]);
  });
});

describe('«Devedores»', () => {
  const customer = (id: string, name: string): Customer => ({ id, name, phone: '955502264', createdAt: at(1), updatedAt: at(1) });

  it('lists who owes, the most overdue first, with names but never the phone numbers', () => {
    const report = debtorsReport(
      [customer('a', 'Cliente A'), customer('b', 'Cliente B')],
      [
        { id: 's1', customerId: 'a', method: 'credit', totalCents: 30_000, createdAt: at(1), dueDate: '2026-11-05' },
        { id: 's2', customerId: 'b', method: 'credit', totalCents: 10_000, createdAt: at(11), dueDate: '2026-11-20' },
      ],
      [],
      now,
    );
    const doc = debtorsDoc(report, head);
    expect(table(doc, 'Resumo').slice(0, 2)).toEqual([
      ['Em dívida', '400 Kz'],
      ['Em atraso', '300 Kz'],
    ]);
    expect(table(doc, 'Clientes')).toEqual([
      ['Cliente A', '300 Kz', '300 Kz', '7'],
      ['Cliente B', '100 Kz', '0 Kz', ''],
    ]);
    expect(reportCsv(doc)).not.toContain('955502264');
  });
});

describe('«Stock da loja»', () => {
  const product = (id: string, extra: Partial<Product>): Product => ({
    id,
    name: id,
    priceCents: 10_000,
    stock: 0,
    minStock: 0,
    createdAt: new Date(2026, 7, 1).toISOString(), // in the shop for months
    updatedAt: at(1),
    ...extra,
  });
  const products = [
    product('Sabão', { category: 'Limpeza', stock: 10, costCents: 6_000 }),
    product('Arroz', { category: 'Mercearia', stock: 4, minStock: 5, costCents: 80_000, priceCents: 100_000 }),
    // Weighed: stock in grams, prices per kg.
    product('Feijão', { category: 'Mercearia', soldBy: 'weight', stock: 2_500, costCents: 100_000, priceCents: 150_000 }),
    product('Bolachas', { stock: 3 }), // no cost price: counted apart, never guessed
    product('Velas', { stock: -2, costCents: 5_000 }), // negative stock: no value
    product('Antigo', { stock: 50, costCents: 1_000, archivedAt: at(2) }),
  ];

  it('values the stock above zero at cost (products without a cost apart) and at the sale price', () => {
    const doc = stockDoc({ products, buy: [], still: [] }, head);
    expect(doc.title).toBe('Stock da loja');
    expect(table(doc, 'Resumo')).toEqual([
      ['Produtos', '5'],
      ['Produtos com stock baixo', '2'],
      // 10 × 60 + 4 × 800 + 2,5 kg × 1.000
      ['Valor do stock ao preço de custo', '6.300 Kz'],
      ['Produtos com stock sem preço de custo (não entram no valor acima)', '1'],
      // 10 × 100 + 4 × 1.000 + 2,5 kg × 1.500 + 3 × 100
      ['Valor do stock ao preço de venda', '9.050 Kz'],
    ]);
  });

  it('lists every product by category and name, never the archived ones', () => {
    const rows = table(stockDoc({ products, buy: [], still: [] }, head), 'Stock de cada produto');
    expect(rows.map((r) => r[0])).toEqual(['Bolachas', 'Velas', 'Sabão', 'Arroz', 'Feijão']);
    expect(rows[4]).toEqual(['Feijão', 'Mercearia', '2,5 kg', '0 kg', '1.000 Kz', '1.500 Kz', '2.500 Kz']);
    expect(rows[1]).toEqual(['Velas', '', '-2', '0', '50 Kz', '100 Kz', '']);
  });

  it('adds what to buy and what stands still, from the same lists as «Análise do stock»', () => {
    const doc = stockDoc({ products, buy: restockList(products), still: stillProducts(products, new Map(), now) }, head);
    expect(table(doc, 'Comprar (pela velocidade de venda)')).toContainEqual(['Arroz', '4', '6']);
    // The money standing still first.
    expect(table(doc, 'Parados (sem vendas nos últimos 30 dias)').slice(0, 2)).toEqual([
      ['Arroz', '4', '3.200 Kz'],
      ['Feijão', '2,5 kg', '2.500 Kz'],
    ]);
  });
});

describe('«Relatório de compras»', () => {
  it('has the totals, each supplier by name and every product bought', () => {
    const purchase = (supplierId: string | undefined, totalCents: number, paid: 'cash' | 'credit') => ({
      createdAt: at(10),
      supplierId,
      totalCents,
      payment: paid,
      items: [{ productId: 'rice', name: 'Arroz 1 kg', quantity: 10, unitCostCents: totalCents / 10, lineTotalCents: totalCents }],
    });
    const report = purchaseReport(
      [purchase('s1', 100_000, 'cash'), purchase(undefined, 50_000, 'credit')] as Parameters<typeof purchaseReport>[0],
      new Date(2026, 10, 1),
      new Date(2026, 10, 13),
    );
    const doc = purchasesDoc(report, (id) => (id === 's1' ? 'Fornecedor Exemplo' : 'Sem fornecedor'), head);
    expect(doc.title).toBe('Relatório de compras');
    expect(table(doc, 'Por fornecedor')).toEqual([
      ['Fornecedor Exemplo', '1', '1.000 Kz'],
      ['Sem fornecedor', '1', '500 Kz'],
    ]);
    expect(table(doc, 'Produtos comprados')).toEqual([['Arroz 1 kg', '20', '1.500 Kz']]);
  });
});
