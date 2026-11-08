import { calendarDaysBetween, formatDate, startOfLocalDay } from '../lib/dates';
import { formatKz } from '../lib/money';
import { formatMargin, marginBp, summariseProfit } from './profit';
import { changeBp, formatChange, MONTHS, periodSummary, shareBp } from './reports';
import type { Cents, CreditPayment, Sale } from './types';

/**
 * "Ficha da loja": the shop's history on one page (up to 12 months), for the owner to show a bank
 * or a partner if they want. Only facts recorded in the app; never a fiscal or accounting document.
 */

type SaleLike = Pick<Sale, 'createdAt' | 'totalCents' | 'method' | 'voidedAt' | 'items' | 'customerId'>;
type PaymentLike = Pick<CreditPayment, 'createdAt' | 'amountCents'>;

export interface StoreSheetMonth {
  label: string;
  salesCents: Cents;
  count: number;
  electronicShareBp: number;
  /** Estimated profit, when some lines had a cost price. */
  profitCents?: Cents;
  activeDays: number;
}

export interface StoreSheet {
  storeName: string;
  nif?: string;
  demo: boolean;
  generatedAt: string;
  /** First sale inside the window (undefined: no sales yet). */
  firstSaleAt?: string;
  periodDays: number;
  activeDays: number;
  totalSalesCents: Cents;
  count: number;
  avgDailyCents: Cents;
  electronicShareBp: number;
  profit?: { profitCents: Cents; marginBp: number; partial: boolean };
  creditSoldCents: Cents;
  creditPaidCents: Cents;
  owedCents: Cents;
  overdueCustomers: number;
  months: StoreSheetMonth[];
  /** Last 3 complete months against the 3 before them (needs 6 complete months). */
  growthBp?: number;
}

export function buildStoreSheet(input: {
  storeName: string;
  nif?: string;
  demo: boolean;
  sales: SaleLike[];
  payments: PaymentLike[];
  owedCents: Cents;
  overdueCustomers: number;
  now: Date;
}): StoreSheet {
  const { now } = input;
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const end = new Date(startOfLocalDay(now).getTime() + 86_400_000 * 2); // anything up to now
  const valid = input.sales.filter((s) => !s.voidedAt && new Date(s.createdAt) >= windowStart);
  const first = valid.reduce<string | undefined>((min, s) => (!min || s.createdAt < min ? s.createdAt : min), undefined);
  const from = first ? startOfLocalDay(new Date(first)) : startOfLocalDay(now);
  const summary = periodSummary(valid, input.payments, [], from, end);
  const profit = summariseProfit(valid);
  const margin = marginBp(profit);

  const months: StoreSheetMonth[] = [];
  for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m <= now; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const s = periodSummary(valid, [], [], m, next);
    months.push({
      label: `${MONTHS[m.getMonth()]} ${m.getFullYear()}`,
      salesCents: s.salesCents,
      count: s.count,
      electronicShareBp: shareBp(s.electronicCents, s.salesCents),
      profitCents: s.profit.revenueCents > 0 ? s.profit.profitCents : undefined,
      activeDays: s.daysWithSales,
    });
  }
  const complete = months.slice(0, -1); // the current month is not over yet
  const growthBp =
    complete.length >= 6
      ? changeBp(
          complete.slice(-3).reduce((a, m) => a + m.salesCents, 0),
          complete.slice(-6, -3).reduce((a, m) => a + m.salesCents, 0),
        )
      : undefined;

  const periodDays = first ? calendarDaysBetween(from, now) + 1 : 0;
  return {
    storeName: input.storeName,
    nif: input.nif,
    demo: input.demo,
    generatedAt: now.toISOString(),
    firstSaleAt: first,
    periodDays,
    activeDays: summary.daysWithSales,
    totalSalesCents: summary.salesCents,
    count: summary.count,
    avgDailyCents: periodDays ? Math.round(summary.salesCents / periodDays) : 0,
    electronicShareBp: shareBp(summary.electronicCents, summary.salesCents),
    profit: margin === undefined ? undefined : { profitCents: profit.profitCents, marginBp: margin, partial: profit.unknownLines > 0 },
    creditSoldCents: summary.creditSoldCents,
    creditPaidCents: summary.creditPaidCents,
    owedCents: input.owedCents,
    overdueCustomers: input.overdueCustomers,
    months,
    growthBp,
  };
}

export const SHEET_NOTE = 'Dados registados pela loja na app Caixa, no telemóvel. Não é um documento fiscal nem contabilístico.';
export const DEMO_NOTE = 'DEMONSTRAÇÃO — dados fictícios, não correspondem a uma loja real.';

/** The sheet as a WhatsApp message (the owner chooses who receives it). */
export function storeSheetText(d: StoreSheet): string {
  const out: string[] = [];
  if (d.demo) out.push(`*${DEMO_NOTE}*`, '');
  out.push(`*Ficha da loja — ${d.storeName}*`);
  if (d.nif) out.push(`NIF: ${d.nif}`);
  if (!d.firstSaleAt) {
    out.push('', 'Ainda não há vendas registadas.', '', SHEET_NOTE);
    return out.join('\n');
  }
  out.push(`Dados de ${formatDate(d.firstSaleAt)} a ${formatDate(d.generatedAt)} (${d.periodDays} dias, ${d.activeDays} com vendas)`, '');
  out.push(`Vendas: ${formatKz(d.totalSalesCents)} em ${d.count} vendas (média de ${formatKz(d.avgDailyCents)} por dia)`);
  out.push(`Pagamentos electrónicos: ${Math.round(d.electronicShareBp / 100)}% das vendas`);
  if (d.profit) {
    out.push(
      `Lucro estimado: ${formatKz(d.profit.profitCents)} (margem de ${formatMargin(d.profit.marginBp)})${d.profit.partial ? ' — só dos produtos com preço de custo' : ''}`,
    );
  }
  if (d.growthBp !== undefined) out.push(`Últimos 3 meses contra os 3 anteriores: ${formatChange(d.growthBp)}`);
  if (d.creditSoldCents > 0 || d.creditPaidCents > 0) {
    out.push(`Clientes a crédito: vendido ${formatKz(d.creditSoldCents)}, recebido ${formatKz(d.creditPaidCents)}`);
  }
  out.push(
    `Em dívida hoje: ${formatKz(d.owedCents)}${d.overdueCustomers ? ` · ${d.overdueCustomers === 1 ? '1 cliente' : `${d.overdueCustomers} clientes`} em atraso` : ''}`,
  );
  out.push('', 'Por mês:');
  for (const m of d.months) out.push(`• ${m.label}: ${formatKz(m.salesCents)} (${m.count === 1 ? '1 venda' : `${m.count} vendas`})`);
  out.push('', SHEET_NOTE);
  return out.join('\n');
}
