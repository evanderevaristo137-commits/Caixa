import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { backupMessage, makeBackup } from '../../app/backup-action';
import { lastBackupAt } from '../../data/backup';
import { backupReminderDays } from '../../domain/backup-reminder';
import type { CreditAlerts } from '../../domain/credit';
import { expiringStock } from '../../domain/expiry';
import { inssAlertItem } from '../../domain/inss';
import { t } from '../../i18n/pt-AO';
import { formatDateString, toLocalDateString } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Card, Sheet } from '../../ui/kit';
import { useBusy } from '../../ui/use-busy';
import { InssSheet } from '../inss/InssSheet';
import { useInss } from '../inss/use-inss';
import { ExpiryList } from '../products/ExpiryList';
import { PaymentAlerts } from './PaymentAlerts';
import { PendingPayments } from './PendingPayments';
import { goToSuppliers } from './go-suppliers';

type Open = 'customers' | 'pending' | 'expiry' | 'inss' | null;

interface Row {
  key: string;
  label: string;
  detail?: string;
  amount?: string;
  urgent: boolean;
  onClick: () => void;
}

/**
 * «Para tratar hoje»: everything that asks for the owner's attention, one line each (customers to
 * remind, payments to confirm, suppliers to pay, expiry dates, the digital payments alarm, the INSS,
 * the backup). Each line opens its detail. Nothing to do: no card.
 */
export function ToDoCard({
  alerts,
  storeName,
  urgentPayables,
  numbers = true,
}: {
  alerts: CreditAlerts;
  storeName: string;
  urgentPayables: number;
  /** False for an employee: what the shop owes, the owner's INSS and the backups are the owner's. */
  numbers?: boolean;
}) {
  const { store, mode, showToast } = useApp();
  const inss = useInss();
  const [open, setOpen] = useState<Open>(null);
  const [busy, run] = useBusy();
  const titleId = useId();
  const info = useLiveQuery(async () => {
    const now = new Date();
    const [pending, tracked, batches, last, first] = await Promise.all([
      store.sales.pending(),
      store.products.list().then((list) => list.filter((p) => p.tracksExpiry)),
      store.batches.all(),
      lastBackupAt(store.db),
      store.db.sales.orderBy('createdAt').first(),
    ]);
    return {
      pendingCount: pending.length,
      pendingCents: pending.reduce((a, s) => a + s.totalCents, 0),
      expiring: tracked.length > 0 ? expiringStock(tracked, batches, toLocalDateString(now)) : [],
      // The demo never asks for a backup.
      backupDays: mode === 'store' ? backupReminderDays({ lastBackupAt: last, firstSaleAt: first?.createdAt, now }) : null,
      backupNever: !last,
    };
  }, [store, mode]);

  const today = toLocalDateString(new Date());
  const inssItem = inss ? inssAlertItem(inss.plan, inss.contributions, inss.now) : null;
  const inssDue = !!inssItem && today >= inssItem.from && today <= inssItem.until;
  const customers = alerts.overdue.length + alerts.today.length + alerts.soon.length;
  const customersCents = [...alerts.overdue, ...alerts.today].reduce((a, c) => a + c.dueNowCents, 0);

  const rows: Row[] = [];
  if (customers > 0) {
    rows.push({
      key: 'customers',
      label: t.todo.customers,
      detail: t.todo.customersLine(alerts.overdue.length, alerts.today.length, alerts.soon.length),
      amount: customersCents > 0 ? formatKz(customersCents) : undefined,
      urgent: alerts.overdue.length + alerts.today.length > 0,
      onClick: () => setOpen('customers'),
    });
  }
  if (info && info.pendingCount > 0) {
    rows.push({
      key: 'pending',
      label: t.pending.cardTitle(info.pendingCount),
      amount: formatKz(info.pendingCents),
      urgent: false,
      onClick: () => setOpen('pending'),
    });
  }
  if (numbers && urgentPayables > 0) {
    rows.push({
      key: 'suppliers',
      label: t.todo.suppliers,
      detail: t.today.payablesUrgent(urgentPayables),
      urgent: true,
      onClick: goToSuppliers,
    });
  }
  if (info && info.expiring.length > 0) {
    rows.push({
      key: 'expiry',
      label: t.expiry.card(info.expiring.length),
      urgent: info.expiring.some((l) => l.daysLeft < 0),
      onClick: () => setOpen('expiry'),
    });
  }
  if (numbers && inssDue && inssItem) {
    rows.push({
      key: 'inss',
      label: t.todo.inss(inssItem.label, formatDateString(inssItem.dueDate)),
      urgent: today > inssItem.dueDate,
      onClick: () => setOpen('inss'),
    });
  }

  if (numbers && info?.backupDays !== null && info?.backupDays !== undefined) {
    rows.push({
      key: 'backup',
      label: t.todo.backup,
      detail: info.backupNever ? t.backupReminder.never : t.backupReminder.late(info.backupDays),
      urgent: false,
      onClick: () =>
        void run(async () => {
          const message = backupMessage(await makeBackup(store, mode));
          if (message) showToast(message);
        }),
    });
  }
  // What is late or due today first; otherwise in the order above (a stable sort).
  rows.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  return (
    <>
      {rows.length > 0 && (
        <Card className="border-2 border-amber-300">
          <h2 id={titleId} className="font-bold">
            {t.todo.title}
          </h2>
          <ul aria-labelledby={titleId} className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={r.onClick}
                  disabled={r.key === 'backup' && busy}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left active:bg-slate-50 disabled:opacity-60"
                >
                  <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${r.urgent ? 'bg-red-600' : 'bg-amber-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.label}</span>
                    {r.detail && <span className={`block text-sm ${r.urgent ? 'text-red-800' : 'text-slate-600'}`}>{r.detail}</span>}
                  </span>
                  {r.amount && <span className="font-bold whitespace-nowrap tabular-nums">{r.amount}</span>}
                  <span aria-hidden="true" className="text-xl text-slate-400">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {open === 'customers' && (
        <Sheet title={t.todo.customers} onClose={() => setOpen(null)}>
          <PaymentAlerts alerts={alerts} storeName={storeName} />
        </Sheet>
      )}
      {open === 'pending' && (
        <Sheet title={t.todo.pendingSheet} onClose={() => setOpen(null)}>
          <PendingPayments />
        </Sheet>
      )}
      {open === 'expiry' && info && (
        <Sheet title={t.todo.expirySheet} onClose={() => setOpen(null)}>
          <p className="mb-2 text-sm text-slate-600">{t.expiry.cardHint}</p>
          <ExpiryList lines={info.expiring} />
        </Sheet>
      )}
      {open === 'inss' && <InssSheet onClose={() => setOpen(null)} />}
    </>
  );
}
