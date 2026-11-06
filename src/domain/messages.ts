import { formatDate, formatDateTime } from '../lib/dates';
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
  if (sale.method === 'credit' && customerName) lines.push(`Cliente: ${customerName}`);
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

/** Polite fiado reminder, ready to send. */
export function reminderText(customerName: string, balanceCents: Cents, since: string | undefined, storeName: string, now: Date): string {
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName;
  const sinceText = since ? ` desde ${formatDate(since)}` : '';
  return (
    `${greeting(now)}, ${firstName}! Fala a ${storeName}. ` +
    `Esperamos que esteja tudo bem consigo e com a família. ` +
    `Lembramos, com todo o respeito, que tem um valor em aberto de ${formatKz(balanceCents)}${sinceText}. ` +
    `Quando lhe for possível, pode passar pela loja para acertar. Muito obrigado pela confiança!`
  );
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
  if (view.creditPaidCents > 0) lines.push(`Fiado recebido: ${formatKz(view.creditPaidCents)}`);
  if (day.voidedCount > 0) lines.push(`Vendas anuladas: ${day.voidedCount} (${formatKz(day.voidedCents)})`);
  return lines.join('\n');
}
