import { useState } from 'react';
import { useApp } from '../../app/context';
import { formatQuantity } from '../../domain/quantity';
import { stockLosses } from '../../domain/stock-insights';
import { t } from '../../i18n/pt-AO';
import { addDays, startOfLocalDay } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Skeleton } from '../../ui/kit';
import { useLoaded } from '../../ui/use-loaded';

type Period = '30d' | '90d' | '12m';
const PERIODS: Period[] = ['30d', '90d', '12m'];

const chip = (on: boolean) =>
  `min-h-11 shrink-0 rounded-full border-2 px-3 text-sm font-semibold whitespace-nowrap ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/** Stock that left without being sold, in the last 30 days, 90 days or 12 months, most money first. */
export function StockLossesView() {
  const { store } = useApp();
  const [period, setPeriod] = useState<Period>('30d');
  const data = useLoaded(async () => {
    const now = new Date();
    const today = startOfLocalDay(now);
    const from = period === '12m' ? new Date(now.getFullYear(), now.getMonth() - 11, 1) : addDays(today, period === '30d' ? -29 : -89);
    const fromIso = from.toISOString();
    const toIso = addDays(today, 1).toISOString();
    const [movements, returns, products] = await Promise.all([
      store.products.movementsBetween(fromIso, toIso),
      store.returns.between(fromIso, toIso),
      store.products.all(),
    ]);
    return { period, losses: stockLosses(movements, returns, products) };
  }, [store, period]);

  const shown = data?.period === period ? data.losses : undefined;
  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="group" aria-label={t.finance.period}>
        {PERIODS.map((p) => (
          <button key={p} type="button" aria-pressed={period === p} className={chip(period === p)} onClick={() => setPeriod(p)}>
            {t.stockInsights.periods[p]}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600">{t.stockInsights.lossesHint}</p>
      {!shown ? (
        <Skeleton rows={3} />
      ) : shown.lines.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.stockInsights.lossesNone}</p>
      ) : (
        <>
          <div role="status" className="rounded-xl bg-red-50 p-3 text-red-900">
            <p className="font-bold">{t.stockInsights.lossesTotal(formatKz(shown.valueCents))}</p>
            {shown.unknownLines > 0 && <p className="text-sm">{t.stockInsights.lossesUnknown(shown.unknownLines)}</p>}
            {shown.foundValueCents > 0 && <p className="text-sm">{t.stockInsights.found(formatKz(shown.foundValueCents))}</p>}
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {shown.lines.map((l) => (
              <li key={l.productId} className="py-2">
                <div className="flex justify-between gap-3">
                  <span className="truncate font-semibold">{l.name}</span>
                  <span className="font-bold whitespace-nowrap">
                    {formatQuantity(l.quantity, l.soldBy)}
                    {l.valueCents !== undefined && ` · ${formatKz(l.valueCents)}`}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {l.reasons.map((r) => `${r.reason}: ${formatQuantity(r.quantity, l.soldBy)}`).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
