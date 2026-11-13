import { methodLabel, t } from '../i18n/pt-AO';
import { kzNumber, toCsv } from '../lib/csv';
import { formatKz } from '../lib/money';
import { NO_CATEGORY, type CategorySales } from './categories';
import type { DebtorsReport } from './debtors';
import type { Finance, SoldReceived } from './finance';
import { formatMargin, marginBp, type ProductProfit } from './profit';
import type { PurchaseReport } from './purchase-report';
import { formatQuantity, GRAMS_PER_KG } from './quantity';
import { comparePt } from './ranking';
import { changeBp, formatChange, shareBp, type Bucket, type PeriodKind, type PeriodSummary, type TopProduct } from './reports';
import { stockValueCents, type RestockLine, type StillProduct } from './stock-insights';
import { DEMO_NOTE } from './store-sheet';
import { isLowStock } from './today';
import { PAYMENT_METHODS, type Cents, type Product } from './types';

/**
 * A report to keep or send (PDF through the phone's print screen, or a spreadsheet for Excel), always
 * with the shop's name on top and the notice that it is neither a fiscal nor an accounting document.
 * The same description makes both, so they always say the same; and each one is built from the same
 * numbers its screen shows.
 */

/** A cell: text, a count, or money (Kz on paper, a number in the spreadsheet). */
export type Cell = string | number | { kz: Cents };

export interface ReportTable {
  title: string;
  header?: string[];
  rows: Cell[][];
  /** Columns of words (aligned left, like the first one); the others hold numbers and money. */
  textColumns?: number[];
}

/** The top of every report: the shop, and when it was made. */
export interface ReportHead {
  storeName: string;
  nif?: string;
  /** Made in the demonstration: says so on top (made-up data). */
  demo: boolean;
  /** When it was made, as people read it ("13/11/2026 15:00"). */
  madeAt: string;
  /** "De 01/11/2026 a 13/11/2026", when the report covers a period. */
  period?: string;
}

export interface ReportDoc extends ReportHead {
  title: string;
  tables: ReportTable[];
  notes: string[];
}

export const cellText = (c: Cell): string => (typeof c === 'object' ? formatKz(c.kz) : String(c));
const pct = (bp: number) => `${Math.round(bp / 100)}%`;

/** The spreadsheet: the shop, the report and the period on top; then each table; then the notes. */
export function reportCsv(doc: ReportDoc): string {
  const rows: (string | number)[][] = [];
  if (doc.demo) rows.push([DEMO_NOTE]);
  rows.push([doc.storeName]);
  if (doc.nif) rows.push([`NIF ${doc.nif}`]);
  rows.push([doc.title]);
  if (doc.period) rows.push([doc.period]);
  rows.push([t.reportDoc.madeAt(doc.madeAt)], []);
  for (const table of doc.tables) {
    rows.push([table.title]);
    if (table.header) rows.push(table.header);
    for (const r of table.rows) rows.push(r.map((c) => (typeof c === 'object' ? kzNumber(c.kz) : c)));
    rows.push([]);
  }
  for (const note of doc.notes) rows.push([note]);
  return toCsv(rows);
}

/** «Vendido e recebido»: the same lines as its card on the screen. */
function soldReceivedTable(money: SoldReceived, returns: { count: number; totalCents: Cents }): ReportTable {
  const tf = t.finance;
  return {
    title: tf.soldReceived,
    rows: [
      [`${tf.sold} (${t.today.sales(money.count)})`, { kz: money.soldCents }],
      [tf.received, { kz: money.receivedCents }],
      ...(money.onCreditCents ? [[tf.onCredit, { kz: money.onCreditCents }]] : []),
      ...(money.pendingCents ? [[tf.pending, { kz: money.pendingCents }]] : []),
      ...(money.customersCents ? [[tf.customers, { kz: money.customersCents }]] : []),
      ...(returns.count ? [[t.reportDoc.returnsCount(returns.count), { kz: -returns.totalCents }]] : []),
    ],
  };
}

/** «Contas da loja» for a period: the same lines as the screen (lines at zero are left out, as there). */
export function financeDoc(f: Finance, returns: { count: number }, head: ReportHead): ReportDoc {
  const tf = t.finance;
  const { flow, result } = f;
  const { profit } = result;
  const sub = (label: string, cents: Cents): Cell[][] => (cents > 0 ? [[`  ${label}`, { kz: cents }]] : []);
  const cash: Cell[][] = [
    [tf.in, { kz: flow.inCents }],
    ...sub(tf.inCash, flow.inCashCents),
    ...sub(tf.inOther, flow.inOtherCents),
    [tf.out, { kz: flow.outCents }],
    ...sub(tf.outExpenses, flow.expensesCents),
    ...sub(tf.outGoods, flow.goodsCents),
    ...sub(tf.outRefunds, flow.refundsCents),
    ...sub(tf.outWithdrawals, flow.withdrawalsCents),
    ...sub(tf.outInss, flow.inssCents),
    [tf.balance, { kz: flow.balanceCents }],
  ];
  const margin = marginBp(profit);
  const estimate: Cell[][] =
    result.resultCents === undefined
      ? [[tf.noCost]]
      : [
          [tf.resultSales, { kz: result.soldCents }],
          ...(result.returnsCents > 0 ? [[tf.resultReturns, { kz: -result.returnsCents }]] : []),
          ...(profit.unknownRevenueCents !== 0 ? [[tf.resultNoCost, { kz: -profit.unknownRevenueCents }]] : []),
          [tf.resultCost, { kz: -profit.costCents }],
          [margin === undefined ? tf.grossProfit : `${tf.grossProfit} (${tf.margin(formatMargin(margin))})`, { kz: profit.profitCents }],
          [tf.resultExpenses, { kz: -result.expensesCents }],
          [tf.resultTotal, { kz: result.resultCents }],
        ];
  return {
    ...head,
    title: tf.title,
    tables: [
      soldReceivedTable(f.sold, { count: returns.count, totalCents: result.returnsCents }),
      { title: tf.flow, rows: cash },
      { title: tf.result, rows: estimate },
    ],
    notes: [
      tf.flowNote,
      ...(result.resultCents !== undefined && profit.unknownLines > 0 ? [t.today.profitMissing(profit.unknownLines)] : []),
      tf.resultNote,
      t.reportDoc.notFiscal,
    ],
  };
}

/** What «Semana e mês» shows for a period (see ReportsSheet). */
export interface SalesReportData {
  kind: PeriodKind;
  current: PeriodSummary;
  previous: PeriodSummary;
  money: SoldReceived;
  cols: Bucket[];
  top: TopProduct[];
  topProfit: ProductProfit[];
  byCategory: CategorySales[];
}

/** «Vendas dos últimos 7 dias» (or 30 days, or 12 months): the same numbers as «Semana e mês». */
export function salesDoc(d: SalesReportData, head: ReportHead): ReportDoc {
  const tr = t.reports;
  const td = t.reportDoc;
  const { current: c, previous: p } = d;
  const change = changeBp(c.salesCents, p.salesCents);
  const margin = marginBp(c.profit);
  const byMonth = d.kind === '12m';
  const summary: Cell[][] = [
    [tr.sold, { kz: c.salesCents }],
    [td.previousSold[d.kind], { kz: p.salesCents }],
    ...(change === undefined ? [] : [[td.change, formatChange(change)]]),
    [td.count, c.count],
    [td.avgTicket, { kz: c.avgTicketCents }],
    [td.electronic, pct(shareBp(c.electronicCents, c.salesCents))],
    margin === undefined ? [tr.profit, tr.noProfit] : [`${tr.profit} (${tr.margin(formatMargin(margin))})`, { kz: c.profit.profitCents }],
    [tr.expenses, { kz: c.outflows.expensesCents }],
    ...(margin === undefined ? [] : [[td.result, { kz: c.profit.profitCents - c.outflows.expensesCents }]]),
  ];
  const tables: ReportTable[] = [
    { title: td.summary, rows: summary },
    {
      title: byMonth ? tr.byMonth : tr.byDay,
      header: [byMonth ? td.month : td.day, tr.sold, td.count, ...(margin === undefined ? [] : [tr.profit])],
      rows: d.cols.map((b) => [
        b.title,
        { kz: b.salesCents },
        b.count,
        ...(margin === undefined ? [] : [b.profitCents === undefined ? '' : { kz: b.profitCents }]),
      ]),
    },
    {
      title: tr.methods,
      header: [td.method, td.amount, td.share],
      rows: PAYMENT_METHODS.filter((m) => c.byMethod[m] > 0)
        .sort((a, b) => c.byMethod[b] - c.byMethod[a])
        .map((m) => [methodLabel[m], { kz: c.byMethod[m] }, pct(shareBp(c.byMethod[m], c.salesCents))]),
    },
    {
      title: tr.top,
      header: [td.product, td.quantity, tr.sold],
      rows: d.top.map((x) => [x.name, formatQuantity(x.quantity, x.soldBy), { kz: x.revenueCents }]),
    },
  ];
  if (d.topProfit.length > 0) {
    tables.push({
      title: tr.topProfit,
      header: [td.product, td.quantity, tr.profit],
      rows: d.topProfit.map((x) => [x.name, formatQuantity(x.quantity, x.soldBy), { kz: x.profitCents }]),
    });
  }
  // As on the screen: only once the shop has given categories to the products it sells.
  if (d.byCategory.some((r) => r.category !== NO_CATEGORY)) {
    tables.push({
      title: t.categories.title,
      header: [td.category, tr.sold, td.share, tr.profit],
      rows: d.byCategory.map((r) => [
        r.category === NO_CATEGORY ? t.categories.none : r.category,
        { kz: r.salesCents },
        pct(shareBp(r.salesCents, c.salesCents)),
        r.costedSalesCents > 0 ? { kz: r.profitCents } : '',
      ]),
    });
  }
  tables.push(soldReceivedTable(d.money, c.returns));
  return {
    ...head,
    title: td.salesTitle[d.kind],
    tables,
    notes: [...(margin === undefined ? [] : [td.profitNote]), t.reportDoc.notFiscal],
  };
}

/** «Devedores»: what is owed, by age, and each customer, the most overdue first (names only: no phones). */
export function debtorsDoc(report: DebtorsReport, head: ReportHead): ReportDoc {
  const td = t.debtors;
  const buckets = ['current', 'd1_7', 'd8_30', 'd31'] as const;
  return {
    ...head,
    title: td.title,
    tables: [
      {
        title: t.reportDoc.summary,
        rows: [
          [td.total, { kz: report.totals.balanceCents }],
          [td.overdue, { kz: report.totals.overdueCents }],
          ...buckets.map((b): Cell[] => [`  ${td.buckets[b]}`, { kz: report.totals[b] }]),
        ],
      },
      {
        title: t.reportDoc.customers,
        header: [t.reportDoc.customer, td.total, td.overdue, t.reportDoc.daysLate],
        rows: report.rows.map((r) => [r.customer.name, { kz: r.balanceCents }, { kz: r.overdueCents }, r.daysOverdue ?? '']),
      },
    ],
    notes: [t.reportDoc.notFiscal],
  };
}

/** What `qty` of the product is worth at a price per unit (or per kg), to the cêntimo. */
const worth = (cents: Cents, p: Pick<Product, 'soldBy'>, qty: number): Cents =>
  p.soldBy === 'weight' ? Math.round((cents * qty) / GRAMS_PER_KG) : cents * qty;

/**
 * «Stock da loja»: what the stock is worth (at cost and at the sale price), what to buy, what stands
 * still, and every product. Only the stock above zero has a value; products without a cost price are
 * counted apart (never guessed).
 */
export function stockDoc(input: { products: Product[]; buy: RestockLine[]; still: StillProduct[] }, head: ReportHead): ReportDoc {
  const td = t.reportDoc;
  const products = input.products
    .filter((p) => !p.archivedAt)
    .sort((a, b) => comparePt(a.category ?? '', b.category ?? '') || comparePt(a.name, b.name));
  let atCost = 0;
  let atPrice = 0;
  let noCost = 0;
  for (const p of products) {
    if (p.stock <= 0) continue;
    const value = stockValueCents(p, p.stock);
    if (value === undefined) noCost += 1;
    else atCost += value;
    atPrice += worth(p.priceCents, p, p.stock);
  }
  const tables: ReportTable[] = [
    {
      title: td.summary,
      rows: [
        [td.products, products.length],
        [td.lowStock, products.filter(isLowStock).length],
        [td.stockCost, { kz: atCost }],
        ...(noCost ? [[td.stockNoCost, noCost]] : []),
        [td.stockPrice, { kz: atPrice }],
      ],
    },
  ];
  if (input.buy.length > 0) {
    tables.push({
      title: td.buyTitle,
      header: [td.product, td.stock, td.buy],
      rows: input.buy.map((l) => [l.name, formatQuantity(Math.max(0, l.stock), l.soldBy), formatQuantity(l.suggested, l.soldBy)]),
    });
  }
  if (input.still.length > 0) {
    tables.push({
      title: td.stillTitle,
      header: [td.product, td.stock, td.valueCost],
      rows: input.still.map(({ product: p, valueCents }) => [
        p.name,
        formatQuantity(p.stock, p.soldBy),
        valueCents === undefined ? '' : { kz: valueCents },
      ]),
    });
  }
  tables.push({
    title: td.everyProduct,
    header: [td.product, td.category, td.stock, td.min, td.cost, td.price, td.valueCost],
    textColumns: [1],
    rows: products.map((p) => {
      const value = p.stock > 0 ? stockValueCents(p, p.stock) : undefined;
      return [
        p.name,
        p.category ?? '',
        formatQuantity(p.stock, p.soldBy),
        formatQuantity(p.minStock, p.soldBy),
        p.costCents === undefined ? '' : { kz: p.costCents },
        { kz: p.priceCents },
        value === undefined ? '' : { kz: value },
      ];
    }),
  });
  return { ...head, title: td.stockTitle, tables, notes: [td.stockNote, t.reportDoc.notFiscal] };
}

/** «Relatório de compras» for a period: totals, by supplier, and every product bought (most money first). */
export function purchasesDoc(report: PurchaseReport, supplierName: (id?: string) => string, head: ReportHead): ReportDoc {
  const td = t.reportDoc;
  return {
    ...head,
    title: t.buying.reportTitle,
    tables: [
      {
        title: td.summary,
        rows: [
          [td.purchases, report.count],
          [td.purchasesTotal, { kz: report.totalCents }],
          [td.paidNow, { kz: report.paidNowCents }],
          [td.onCredit, { kz: report.onCreditCents }],
        ],
      },
      {
        title: t.buying.bySupplier,
        header: [td.supplier, td.purchases, td.amount],
        rows: report.bySupplier.map((s) => [supplierName(s.supplierId), s.count, { kz: s.totalCents }]),
      },
      {
        title: td.productsBought,
        header: [td.product, td.quantity, td.amount],
        rows: report.byProduct.map((p) => [p.name, formatQuantity(p.quantity, p.soldBy), { kz: p.totalCents }]),
      },
    ],
    notes: [t.reportDoc.notFiscal],
  };
}
