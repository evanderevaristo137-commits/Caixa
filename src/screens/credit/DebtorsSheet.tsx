import { useState } from 'react';
import { useApp } from '../../app/context';
import { AGING, debtorsReport } from '../../domain/debtors';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Money, Sheet, Skeleton } from '../../ui/kit';
import { useLoaded } from '../../ui/use-loaded';
import { CustomerSheet } from './CustomerSheet';
import { useTeam } from '../../app/team';
import { debtorsDoc } from '../../domain/report-doc';
import { ReportButton } from '../../ui/ReportPrint';

const BUCKET_CLASS = { current: 'bg-slate-50', d1_7: 'bg-amber-50', d8_30: 'bg-orange-50', d31: 'bg-red-50 text-red-900' } as const;
const VERDICT_CLASS = { good: 'text-brand-800', fair: 'text-amber-800', poor: 'text-red-700' } as const;

/** «Devedores»: everything owed, by how late it is, and each customer who owes, most overdue first. */
export function DebtorsSheet({ onClose }: { onClose: () => void }) {
  const { store } = useApp();
  // Everyone who takes payments sees who owes; taking the list out of the phone is for the owner or a manager.
  const canSend = useTeam().can('numbers');
  const [openId, setOpenId] = useState<string | null>(null);
  // Read again when a customer sheet closes (a payment may have been recorded there).
  const report = useLoaded(async () => {
    const [customers, sales, payments] = await Promise.all([store.customers.list(), store.sales.onCredit(), store.credit.payments()]);
    return debtorsReport(customers, sales, payments, new Date());
  }, [store, openId]);

  return (
    <Sheet title={t.debtors.title} onClose={onClose}>
      {!report ? (
        <Skeleton rows={4} />
      ) : report.rows.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.debtors.none}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white p-3">
              <p className="text-sm font-semibold text-slate-600">{t.debtors.total}</p>
              <Money cents={report.totals.balanceCents} className="block text-2xl font-extrabold" />
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-sm font-semibold text-red-800">{t.debtors.overdue}</p>
              <Money cents={report.totals.overdueCents} className="block text-2xl font-extrabold text-red-800" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-600">{t.debtors.bucketsHint}</p>
            <dl className="grid grid-cols-2 gap-2">
              {AGING.map((k) => (
                <div key={k} className={`rounded-xl p-2 ${BUCKET_CLASS[k]}`}>
                  <dt className="text-sm font-semibold">{t.debtors.buckets[k]}</dt>
                  <dd className="text-lg font-bold">{formatKz(report.totals[k])}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {report.rows.map((r) => (
              <li key={r.customer.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(r.customer.id)}
                  className="flex w-full items-center gap-3 py-2 text-left active:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.customer.name}</span>
                    <span className={`block text-sm ${r.overdueCents > 0 ? 'font-semibold text-red-800' : 'text-slate-600'}`}>
                      {r.overdueCents > 0 ? `${t.debtors.overduePart(formatKz(r.overdueCents))} · ` : ''}
                      {t.debtors.row(r.daysOverdue)}
                    </span>
                    {r.punctuality.verdict && (
                      <span className={`block text-sm font-semibold ${VERDICT_CLASS[r.punctuality.verdict]}`}>
                        {t.punctuality.verdict[r.punctuality.verdict]}
                      </span>
                    )}
                  </span>
                  <Money cents={r.balanceCents} className="text-lg font-bold" />
                </button>
              </li>
            ))}
          </ul>
          {canSend && <ReportButton build={(head) => debtorsDoc(report, head)} />}
        </div>
      )}
      {openId && <CustomerSheet customerId={openId} onClose={() => setOpenId(null)} />}
    </Sheet>
  );
}
