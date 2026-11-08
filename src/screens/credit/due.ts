import type { CreditStatus } from '../../domain/credit';
import { reminderText } from '../../domain/messages';
import type { Customer } from '../../domain/types';
import { toWhatsAppNumber, whatsAppLink } from '../../domain/whatsapp';
import { t } from '../../i18n/pt-AO';
import { formatDateString } from '../../lib/dates';

type DueInfo = Pick<CreditStatus, 'dueState' | 'daysOverdue' | 'daysUntilDue' | 'nextDueDate'>;

/** Badge text and colour for a customer's next payment: red when late or due today, amber when soon. */
export function dueBadge(s: DueInfo): { text: string; className: string } | null {
  switch (s.dueState) {
    case 'overdue':
      return { text: t.credit.dueOverdue(s.daysOverdue ?? 0), className: 'bg-red-100 text-red-800' };
    case 'today':
      return { text: t.credit.dueToday, className: 'bg-red-100 text-red-800' };
    case 'soon':
      return { text: t.credit.dueSoon(s.daysUntilDue ?? 0), className: 'bg-amber-100 text-amber-900' };
    case 'later':
      return { text: t.credit.dueLater(formatDateString(s.nextDueDate!)), className: 'bg-slate-100 text-slate-700' };
    default:
      return null;
  }
}

/** WhatsApp link with the reminder for this customer, or null when there is no valid phone or nothing owed. */
export function reminderLink(
  status: Pick<CreditStatus, 'balanceCents' | 'reminderAmountCents' | 'nextDueDate' | 'dueState'>,
  customer: Customer,
  storeName: string,
  now: Date,
): string | null {
  if (status.balanceCents <= 0 || !toWhatsAppNumber(customer.phone)) return null;
  const text = reminderText({
    customerName: customer.name,
    storeName,
    now,
    amountCents: status.reminderAmountCents || status.balanceCents,
    dueDate: status.nextDueDate,
    state: status.dueState,
    balanceCents: status.balanceCents,
  });
  return whatsAppLink(text, customer.phone);
}
