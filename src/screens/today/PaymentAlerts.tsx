import { useApp } from '../../app/context';
import type { CreditAlerts, CustomerWithCredit } from '../../domain/credit';
import { t } from '../../i18n/pt-AO';
import { Card, Money } from '../../ui/kit';
import { dueBadge, reminderLink } from '../credit/due';

const MAX_ROWS = 5;

/** "Pagamentos de clientes": who is late, who pays today, who pays soon — with a one-tap reminder. */
export function PaymentAlerts({ alerts, storeName }: { alerts: CreditAlerts; storeName: string }) {
  const { store } = useApp();
  const now = new Date();
  const rows = [...alerts.overdue, ...alerts.today, ...alerts.soon];
  if (rows.length === 0) return null;
  const sum = (list: CustomerWithCredit[], due: boolean) => list.reduce((a, c) => a + (due ? c.dueNowCents : c.reminderAmountCents), 0);
  const groups = [
    { label: t.today.alertsOverdue, list: alerts.overdue, cents: sum(alerts.overdue, true), tone: 'text-red-800' },
    { label: t.today.alertsToday, list: alerts.today, cents: sum(alerts.today, true), tone: 'text-red-800' },
    { label: t.today.alertsSoon, list: alerts.soon, cents: sum(alerts.soon, false), tone: 'text-amber-900' },
  ].filter((g) => g.list.length > 0);

  return (
    <Card className="border-2 border-red-200">
      <h2 className="mb-2 text-lg font-bold">{t.today.alertsTitle}</h2>
      <ul className="mb-2 space-y-1">
        {groups.map((g) => (
          <li key={g.label} className={`flex justify-between font-semibold ${g.tone}`}>
            <span>
              {g.label}: {g.list.length}
            </span>
            <Money cents={g.cents} />
          </li>
        ))}
      </ul>
      <ul className="divide-y divide-slate-100">
        {rows.slice(0, MAX_ROWS).map((c) => {
          const badge = dueBadge(c);
          const link = reminderLink(c, c.customer, storeName, now);
          return (
            <li key={c.customer.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.customer.name}</p>
                {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.text}</span>}
              </div>
              <Money cents={c.dueNowCents || c.reminderAmountCents} className="font-bold" />
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void store.customers.markReminded(c.customer.id)}
                  aria-label={`${t.credit.remindShort} ${c.customer.name}`}
                  className="flex min-h-11 items-center rounded-lg bg-[#15803d] px-3 text-sm font-semibold text-white active:bg-[#166534]"
                >
                  {t.credit.remindShort}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <a href="#/credit" className="mt-2 block min-h-11 rounded-lg py-2 text-center font-semibold text-brand-700 active:bg-brand-50">
        {t.today.alertsSeeAll}
      </a>
    </Card>
  );
}
