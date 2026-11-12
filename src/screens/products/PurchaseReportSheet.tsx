import { useState } from 'react';
import { useApp } from '../../app/context';
import { purchaseReport } from '../../domain/purchase-report';
import { formatQuantity } from '../../domain/quantity';
import { t } from '../../i18n/pt-AO';
import { addDays, startOfLocalDay } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Card, Sheet, Skeleton } from '../../ui/kit';
import { useLoaded } from '../../ui/use-loaded';

type Period = '30d' | '90d' | '12m';
const PERIODS: Period[] = ['30d', '90d', '12m'];
/** The products that cost the most; the rest are in the purchases list and the Excel export. */
const TOP = 10;

const chip = (on: boolean) =>
  `min-h-11 shrink-0 rounded-full border-2 px-3 text-sm font-semibold whitespace-nowrap ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/** «Relatório de compras»: what was bought in a period, from whom, and the products that cost the most. */
export function PurchaseReportSheet({ onClose }: { onClose: () => void }) {
  const { store } = useApp();
  const [period, setPeriod] = useState<Period>('30d');
  const data = useLoaded(async () => {
    const now = new Date();
    const today = startOfLocalDay(now);
    const from = period === '12m' ? new Date(now.getFullYear(), now.getMonth() - 11, 1) : addDays(today, period === '30d' ? -29 : -89);
    const to = addDays(today, 1);
    const [purchases, suppliers] = await Promise.all([
      store.purchases.between(from.toISOString(), to.toISOString()),
      store.suppliers.list(),
    ]);
    return { period, report: purchaseReport(purchases, from, to), names: new Map(suppliers.map((s) => [s.id, s.name])) };
  }, [store, period]);
  const shown = data?.period === period ? data : undefined;

  return (
    <Sheet title={t.buying.reportTitle} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2" role="group" aria-label={t.finance.period}>
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={period === p} className={chip(period === p)} onClick={() => setPeriod(p)}>
              {t.stockInsights.periods[p]}
            </button>
          ))}
        </div>
        {!shown ? (
          <Skeleton rows={3} />
        ) : shown.report.count === 0 ? (
          <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.buying.reportNone}</p>
        ) : (
          <>
            <div role="status" className="rounded-xl bg-white p-3">
              <p className="text-lg font-bold">{t.buying.reportTotal(shown.report.count, formatKz(shown.report.totalCents))}</p>
              <p className="text-sm text-slate-600">
                {t.buying.reportPaid(formatKz(shown.report.paidNowCents), formatKz(shown.report.onCreditCents))}
              </p>
            </div>
            <Card>
              <h3 className="mb-1 font-bold">{t.buying.bySupplier}</h3>
              <ul className="divide-y divide-slate-100">
                {shown.report.bySupplier.map((s) => (
                  <li key={s.supplierId ?? 'none'} className="flex justify-between gap-2 py-1.5">
                    <span className="truncate">
                      {s.supplierId ? (shown.names.get(s.supplierId) ?? '—') : t.buying.noSupplier}
                      <span className="text-sm text-slate-600"> · {s.count}</span>
                    </span>
                    <span className="font-semibold whitespace-nowrap tabular-nums">{formatKz(s.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="mb-1 font-bold">{t.buying.byProduct}</h3>
              <ol className="divide-y divide-slate-100">
                {shown.report.byProduct.slice(0, TOP).map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-2 py-1.5">
                    <span className="w-5 text-sm font-bold text-slate-500 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-sm text-slate-600 tabular-nums">{formatQuantity(p.quantity, p.soldBy)}</span>
                    <span className="w-24 text-right font-semibold tabular-nums">{formatKz(p.totalCents)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </>
        )}
      </div>
    </Sheet>
  );
}
