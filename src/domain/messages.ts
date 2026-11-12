import { formatDate, formatDateString, formatDateTime } from '../lib/dates';
import type { DueState } from './credit';
import { formatKz } from '../lib/money';
import { methodLabel, t } from '../i18n/pt-AO';
import { greeting } from './whatsapp';
import { formatQuantity } from './quantity';
import type { DayView } from './today';
import { formatMargin, marginBp, type ProfitSummary } from './profit';
import type { Drawer, OutflowSummary } from './cash';
import type { CashClose } from './types';
import { PAYMENT_METHODS, type Cents, type Sale, type Settings } from './types';

/** Plain-text, non-fiscal receipt for sharing on WhatsApp. */
export function receiptText(
  sale: Sale,
  settings: Pick<Settings, 'storeName' | 'phone' | 'nif'>,
  customerName?: string,
  /** Fiado only: what the customer owes in total after this purchase. */
  balanceAfterCents?: Cents,
): string {
  const lines: string[] = [];
  lines.push(`*${settings.storeName}*`);
  if (settings.phone) lines.push(`Tel.: ${settings.phone}`);
  if (settings.nif) lines.push(`NIF: ${settings.nif}`);
  lines.push('');
  lines.push(`Talão n.º ${sale.number} — ${formatDateTime(sale.createdAt)}`);
  lines.push('');
  for (const item of sale.items) {
    lines.push(`${formatQuantity(item.quantity, item.soldBy)} x ${item.name} — ${formatKz(item.lineTotalCents)}`);
  }
  lines.push('');
  lines.push(`*TOTAL: ${formatKz(sale.totalCents)}*`);
  lines.push(`Pagamento: ${methodLabel[sale.method]}`);
  if (sale.transactionRef) lines.push(`Ref. do pagamento: ${sale.transactionRef}`);
  if (sale.method === 'credit' && customerName) lines.push(`Cliente: ${customerName}`);
  if (sale.method === 'credit' && sale.dueDate) lines.push(`Pagar até: ${formatDateString(sale.dueDate)}`);
  if (sale.method === 'credit' && balanceAfterCents !== undefined && balanceAfterCents > 0) {
    lines.push(`Total em dívida: ${formatKz(balanceAfterCents)}`);
  }
  if (sale.method === 'cash' && sale.cashReceivedCents !== undefined && sale.cashReceivedCents >= sale.totalCents) {
    lines.push(`Recebido: ${formatKz(sale.cashReceivedCents)} — Troco: ${formatKz(sale.cashReceivedCents - sale.totalCents)}`);
  }
  lines.push('');
  lines.push(t.nonFiscal);
  lines.push('Obrigado pela preferência!');
  return lines.join('\n');
}

/** What a reminder needs to know about the customer's account (see `creditStatus`). */
export interface ReminderInput {
  customerName: string;
  storeName: string;
  now: Date;
  /** Amount the reminder is about: what is due by the next due date. */
  amountCents: Cents;
  dueDate?: string;
  state?: DueState;
  /** Everything the customer owes; mentioned when it is more than `amountCents`. */
  balanceCents?: Cents;
}

/** Polite payment reminder, ready to send by WhatsApp. The wording follows the due date. */
export function reminderText(r: ReminderInput): string {
  const firstName = r.customerName.trim().split(/\s+/)[0] ?? r.customerName;
  const amount = formatKz(r.amountCents);
  const due = r.dueDate ? formatDateString(r.dueDate) : '';
  let body: string;
  if (r.state === 'overdue' && r.dueDate) {
    body = `Lembramos, com todo o respeito, que o pagamento de ${amount} venceu a ${due}. Quando lhe for possível, passe pela loja para acertar.`;
  } else if (r.state === 'today') {
    body = `Lembramos, com todo o respeito, que o pagamento de ${amount} vence hoje. Quando puder, passe pela loja.`;
  } else if (r.dueDate) {
    body = `Lembramos, com todo o respeito, que o pagamento de ${amount} vence a ${due}.`;
  } else {
    body = `Lembramos, com todo o respeito, que tem um valor em aberto de ${amount}. Quando lhe for possível, passe pela loja para acertar.`;
  }
  const total =
    r.balanceCents !== undefined && r.balanceCents > r.amountCents
      ? ` No total, a sua conta tem ${formatKz(r.balanceCents)} em aberto.`
      : '';
  return `${greeting(r.now)}, ${firstName}! Fala a ${r.storeName}. Esperamos que esteja tudo bem consigo e com a família. ${body}${total} Muito obrigado pela confiança!`;
}

/** Shopping list to send to a supplier (or to oneself) by WhatsApp. */
export function shoppingListText(
  storeName: string,
  lines: { name: string; stock: number; suggested: number; soldBy?: 'weight' }[],
  now: Date,
): string {
  const out = [`*Lista de compras — ${storeName}*`, formatDate(now.toISOString()), ''];
  for (const l of lines)
    out.push(`• ${l.name}: ${formatQuantity(l.suggested, l.soldBy)} (há ${formatQuantity(Math.max(0, l.stock), l.soldBy)})`);
  return out.join('\n');
}

/** End-of-day summary for the owner (e.g. sent by an employee). */
export interface DaySummaryExtras {
  profit?: ProfitSummary;
  /** Cash the till should have (with the float and the money that went out). */
  drawer?: Drawer;
  outflows?: OutflowSummary;
  close?: CashClose;
  /** Goods given back that day. */
  returns?: { count: number; totalCents: Cents };
}

export function daySummaryText(storeName: string, dayTitle: string, view: DayView, extras: DaySummaryExtras = {}): string {
  const { day } = view;
  const { profit, drawer, outflows, close, returns } = extras;
  const lines = [`*Resumo — ${storeName}*`, dayTitle, ''];
  lines.push(`Vendido: *${formatKz(day.totalCents)}* (${day.count === 1 ? '1 venda' : `${day.count} vendas`})`);
  const margin = profit ? marginBp(profit) : undefined;
  if (profit && margin !== undefined) {
    const partial = profit.unknownLines > 0 ? ' — só dos produtos com preço de custo' : '';
    lines.push(`Lucro estimado: ${formatKz(profit.profitCents)} (margem de ${formatMargin(margin)})${partial}`);
  }
  lines.push(`${view.comparisonIsSameTime ? 'Ontem até esta hora' : 'Dia anterior'}: ${formatKz(view.comparison.totalCents)}`);
  if (outflows && outflows.expensesCents > 0) lines.push(`Despesas: ${formatKz(outflows.expensesCents)}`);
  if (outflows && outflows.withdrawalsCents > 0) lines.push(`Retiradas do dono: ${formatKz(outflows.withdrawalsCents)}`);
  if (outflows && outflows.inssCents > 0) lines.push(`Guardado para o INSS: ${formatKz(outflows.inssCents)}`);
  lines.push(`Dinheiro que devia estar na caixa: ${formatKz(drawer?.expectedCents ?? view.cash.totalCents)}`);
  if (close) {
    const d = close.differenceCents;
    const result = d === 0 ? 'bate certo' : d > 0 ? `sobram ${formatKz(d)}` : `faltam ${formatKz(-d)}`;
    lines.push(`Fecho: contou ${formatKz(close.countedCents)} — ${result}`);
  }
  const methods = PAYMENT_METHODS.filter((m) => day.byMethod[m] > 0);
  if (methods.length > 0) {
    lines.push('');
    for (const m of methods) lines.push(`• ${methodLabel[m]}: ${formatKz(day.byMethod[m])}`);
  }
  if (view.creditPaidCents > 0) lines.push(`Recebido de clientes: ${formatKz(view.creditPaidCents)}`);
  if (day.voidedCount > 0) lines.push(`Vendas anuladas: ${day.voidedCount} (${formatKz(day.voidedCents)})`);
  if (returns && returns.count > 0) lines.push(`Devoluções: ${returns.count} (−${formatKz(returns.totalCents)})`);
  return lines.join('\n');
}
