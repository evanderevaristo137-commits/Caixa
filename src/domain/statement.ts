import { methodLabel, t } from '../i18n/pt-AO';
import { compareText } from './ranking';
import { formatDate, formatDateString } from '../lib/dates';
import { formatKz } from '../lib/money';
import { creditStatus, dueDateOf } from './credit';
import { formatQuantity } from './quantity';
import type { CreditPayment, Customer, Sale } from './types';

type SaleLike = Pick<Sale, 'number' | 'customerId' | 'method' | 'totalCents' | 'createdAt' | 'voidedAt' | 'dueDate' | 'items'>;
type PaymentLike = Pick<CreditPayment, 'customerId' | 'amountCents' | 'createdAt' | 'method'>;

export interface StatementLine {
  at: string;
  kind: 'purchase' | 'payment';
  text: string;
  /** Running balance after this line. */
  balanceCents: number;
}

const shortDate = (iso: string) => formatDate(iso).slice(0, 5);

function itemsSummary(items: SaleLike['items']): string {
  const shown = items.slice(0, 3).map((i) => `${formatQuantity(i.quantity, i.soldBy)} × ${i.name}`);
  return items.length > 3 ? `${shown.join(', ')} e mais ${items.length - 3}` : shown.join(', ');
}

/**
 * The movements that explain what the customer owes now: everything after the last moment the
 * account was settled (older, already-paid history is left out to keep the message short).
 */
export function statementLines(customerId: string, sales: SaleLike[], payments: PaymentLike[]): StatementLine[] {
  const events = [
    ...sales
      .filter((s) => s.method === 'credit' && s.customerId === customerId && !s.voidedAt)
      .map((s) => ({
        at: s.createdAt,
        kind: 'purchase' as const,
        delta: s.totalCents,
        text: `${shortDate(s.createdAt)} — Compra n.º ${s.number}: ${formatKz(s.totalCents)} (${itemsSummary(s.items)}) · pagar até ${formatDateString(dueDateOf(s))}`,
      })),
    ...payments
      .filter((p) => p.customerId === customerId)
      .map((p) => ({
        at: p.createdAt,
        kind: 'payment' as const,
        delta: -p.amountCents,
        text: `${shortDate(p.createdAt)} — Pagamento: ${formatKz(p.amountCents)} (${methodLabel[p.method]})`,
      })),
  ].sort((a, b) => compareText(a.at, b.at) || (a.kind === 'purchase' ? -1 : 1));

  let balance = 0;
  let start = 0;
  const lines = events.map((e, i) => {
    balance += e.delta;
    if (balance <= 0) start = i + 1;
    return { at: e.at, kind: e.kind, text: e.text, balanceCents: balance };
  });
  return lines.slice(start);
}

const DUE_WORDS = { overdue: 'em atraso', today: 'vence hoje', soon: 'vence em breve', later: '' } as const;

/** Account statement for the customer, ready for WhatsApp. Never a fiscal document. */
export function statementText(
  customer: Pick<Customer, 'id' | 'name'>,
  storeName: string,
  sales: SaleLike[],
  payments: PaymentLike[],
  now: Date,
): string {
  const status = creditStatus(customer.id, sales, payments, now);
  const out = [`*Extracto de conta — ${storeName}*`, `${customer.name} · ${formatDate(now.toISOString())}`, ''];
  if (status.balanceCents <= 0) {
    out.push('*A conta está em dia.*');
    if (status.balanceCents < 0) out.push(`Saldo a seu favor: ${formatKz(-status.balanceCents)}`);
  } else {
    for (const l of statementLines(customer.id, sales, payments)) {
      out.push(`• ${l.text}`);
      out.push(`   Saldo: ${formatKz(l.balanceCents)}`);
    }
    out.push('', `*Total em dívida: ${formatKz(status.balanceCents)}*`);
    if (status.nextDueDate && status.dueState) {
      const word = DUE_WORDS[status.dueState];
      out.push(
        `Próximo pagamento: ${formatKz(status.reminderAmountCents || status.balanceCents)} até ${formatDateString(status.nextDueDate)}${word ? ` (${word})` : ''}`,
      );
    }
  }
  out.push('', t.nonFiscal, 'Obrigado pela confiança!');
  return out.join('\n');
}
