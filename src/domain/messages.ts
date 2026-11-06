import { formatDate, formatDateTime } from '../lib/dates';
import { formatKz } from '../lib/money';
import { methodLabel, t } from '../i18n/pt-AO';
import { greeting } from './whatsapp';
import type { Cents, Sale, Settings } from './types';

/** Plain-text, non-fiscal receipt for sharing on WhatsApp. */
export function receiptText(
  sale: Sale,
  settings: Pick<Settings, 'storeName' | 'phone' | 'nif'>,
  customerName?: string,
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
  if (sale.method === 'cash' && sale.cashReceivedCents !== undefined && sale.cashReceivedCents >= sale.totalCents) {
    lines.push(`Recebido: ${formatKz(sale.cashReceivedCents)} — Troco: ${formatKz(sale.cashReceivedCents - sale.totalCents)}`);
  }
  lines.push('');
  lines.push(t.nonFiscal);
  lines.push('Obrigado pela preferência!');
  return lines.join('\n');
}

/** Polite fiado reminder, ready to send. */
export function reminderText(
  customerName: string,
  balanceCents: Cents,
  since: string | undefined,
  storeName: string,
  now: Date,
): string {
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName;
  const sinceText = since ? ` desde ${formatDate(since)}` : '';
  return (
    `${greeting(now)}, ${firstName}! Fala a ${storeName}. ` +
    `Esperamos que esteja tudo bem consigo e com a família. ` +
    `Lembramos, com todo o respeito, que tem um valor em aberto de ${formatKz(balanceCents)}${sinceText}. ` +
    `Quando lhe for possível, pode passar pela loja para acertar. Muito obrigado pela confiança!`
  );
}
