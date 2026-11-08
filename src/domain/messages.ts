import { formatDate, formatDateString, formatDateTime } from '../lib/dates';
import type { DueState } from './credit';
import { formatKz } from '../lib/money';
import { methodLabel, t } from '../i18n/pt-AO';
import { greeting } from './whatsapp';
import type { DayView } from './today';
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
    lines.push(`${item.quantity} x ${item.name} — ${formatKz(item.lineTotalCents)}`);
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
export function shoppingListText(storeName: string, lines: { name: string; stock: number; suggested: number }[], now: Date): string {
  const out = [`*Lista de compras — ${storeName}*`, formatDate(now.toISOString()), ''];
  for (const l of lines) out.push(`• ${l.name}: ${l.suggested} (há ${Math.max(0, l.stock)})`);
  return out.join('\n');
}

/** End-of-day summary for the owner (e.g. sent by an employee). */
export function daySummaryText(storeName: string, dayTitle: string, view: DayView): string {
  const { day } = view;
  const lines = [`*Resumo — ${storeName}*`, dayTitle, ''];
  lines.push(`Vendido: *${formatKz(day.totalCents)}* (${day.count === 1 ? '1 venda' : `${day.count} vendas`})`);
  lines.push(`${view.comparisonIsSameTime ? 'Ontem até esta hora' : 'Dia anterior'}: ${formatKz(view.comparison.totalCents)}`);
  lines.push(`Dinheiro na caixa (numerário): ${formatKz(view.cash.totalCents)}`);
  const methods = PAYMENT_METHODS.filter((m) => day.byMethod[m] > 0);
  if (methods.length > 0) {
    lines.push('');
    for (const m of methods) lines.push(`• ${methodLabel[m]}: ${formatKz(day.byMethod[m])}`);
  }
  if (view.creditPaidCents > 0) lines.push(`Recebido de clientes: ${formatKz(view.creditPaidCents)}`);
  if (day.voidedCount > 0) lines.push(`Vendas anuladas: ${day.voidedCount} (${formatKz(day.voidedCents)})`);
  return lines.join('\n');
}
