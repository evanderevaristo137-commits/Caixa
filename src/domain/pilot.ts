import { addDays, calendarDaysBetween, formatDate, startOfLocalDay } from '../lib/dates';
import { formatKz } from '../lib/money';
import type { Cents, Sale } from './types';

/**
 * Pilot summary: how the shop uses the app, in numbers only. The shop sends it by WhatsApp to
 * whoever runs the pilot. It never carries customers' names or phones.
 */

type SaleLike = Pick<Sale, 'createdAt' | 'totalCents' | 'method' | 'voidedAt'>;

export interface PilotInput {
  storeName: string;
  /** This phone's id; only its first 8 characters are shown, to match summaries from the same shop. */
  deviceId: string;
  demo: boolean;
  now: Date;
  /** Earliest record of the shop (first product or sale). */
  firstUseAt?: string;
  /** Sales of the last 30 days (at least). */
  sales: SaleLike[];
  customersOwing: number;
  owedCents: Cents;
  customersOverdue: number;
  products: number;
  productsWithCost: number;
  /** Counts over the last 30 days. */
  closes: number;
  expenses: number;
  purchases: number;
  lastBackupAt?: string;
  /** Credit for stock: digital share of the last 7 complete days, the contract minimum and the alarm. */
  digital?: DigitalLine;
}

export interface DigitalLine {
  shareBp: number;
  minShareBp?: number;
  alarm: boolean;
}

/** "Pagamentos digitais (7 dias completos): 39% · mínimo 40% · alarme: sim" */
export function digitalLineText(d: DigitalLine): string {
  const min = d.minShareBp !== undefined ? ` · mínimo ${Math.round(d.minShareBp / 100)}%` : '';
  return `Pagamentos digitais (7 dias completos): ${Math.round(d.shareBp / 100)}%${min} · alarme: ${d.alarm ? 'SIM' : 'não'}`;
}

interface Window {
  activeDays: number;
  count: number;
  salesCents: Cents;
}

function window(sales: SaleLike[], now: Date, days: number): Window & { electronicCents: Cents; voided: number } {
  const from = addDays(startOfLocalDay(now), -(days - 1)).getTime();
  const inside = sales.filter((s) => new Date(s.createdAt).getTime() >= from);
  const valid = inside.filter((s) => !s.voidedAt);
  return {
    activeDays: new Set(valid.map((s) => startOfLocalDay(new Date(s.createdAt)).getTime())).size,
    count: valid.length,
    salesCents: valid.reduce((a, s) => a + s.totalCents, 0),
    electronicCents: valid.filter((s) => s.method !== 'cash' && s.method !== 'credit').reduce((a, s) => a + s.totalCents, 0),
    voided: inside.length - valid.length,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function pilotText(p: PilotInput): string {
  const w7 = window(p.sales, p.now, 7);
  const w30 = window(p.sales, p.now, 30);
  const out: string[] = [];
  if (p.demo) out.push('*DEMONSTRAÇÃO — dados fictícios, não contar no piloto*', '');
  out.push('*Resumo do piloto — Caixa*');
  out.push(`Loja: ${p.storeName} (código ${p.deviceId.slice(0, 8)})`);
  const since = p.firstUseAt
    ? ` · a usar desde ${formatDate(p.firstUseAt)} (${calendarDaysBetween(new Date(p.firstUseAt), p.now) + 1} dias)`
    : '';
  out.push(`${formatDate(p.now.toISOString())}${since}`, '');
  const line = (label: string, w: Window) =>
    `${label}: ${plural(w.activeDays, 'dia', 'dias')} com vendas · ${plural(w.count, 'venda', 'vendas')} · ${formatKz(w.salesCents)}`;
  out.push(line('Últimos 7 dias', w7));
  out.push(line('Últimos 30 dias', w30));
  if (w30.count > 0) out.push(`Pagamentos electrónicos (30 dias): ${Math.round((w30.electronicCents * 100) / w30.salesCents)}%`);
  if (p.digital) out.push(digitalLineText(p.digital));
  out.push(`Vendas anuladas (30 dias): ${w30.voided}`);
  out.push(`Clientes com dívida: ${p.customersOwing} · em dívida: ${formatKz(p.owedCents)} · em atraso: ${p.customersOverdue}`);
  out.push(`Produtos: ${p.products} (${p.productsWithCost} com preço de custo)`);
  out.push(
    `Também usou (30 dias): ${plural(p.closes, 'fecho do dia', 'fechos do dia')} · ${plural(p.expenses, 'saída', 'saídas')} · ${plural(p.purchases, 'compra', 'compras')}`,
  );
  out.push(`Última cópia de segurança: ${p.lastBackupAt ? formatDate(p.lastBackupAt) : 'nenhuma'}`);
  out.push('', 'Só números da loja: nenhum nome nem telefone de clientes.');
  return out.join('\n');
}
