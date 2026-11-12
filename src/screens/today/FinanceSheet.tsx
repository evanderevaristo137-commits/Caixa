import { useState } from 'react';
import { useApp } from '../../app/context';
import { FINANCE_PERIODS, financeRange, financeSummary, type FinancePeriod } from '../../domain/finance';
import { t } from '../../i18n/pt-AO';
import { addDays, formatDate, toLocalDateString } from '../../lib/dates';
import { Field, Sheet, Skeleton } from '../../ui/kit';
import { useLoaded } from '../../ui/use-loaded';
import { MoneyFlowCard, ResultCard, SoldReceivedCard } from './FinanceCards';

const chip = (on: boolean) =>
  `min-h-11 shrink-0 rounded-full border-2 px-3 text-sm font-semibold whitespace-nowrap ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/**
 * «Contas da loja» for a period the owner chooses: sold next to received, the money that came in and
 * went out, and the estimated result. Read once per period (not live): a month is thousands of records.
 */
export function FinanceSheet({ onClose }: { onClose: () => void }) {
  const { store } = useApp();
  const [period, setPeriod] = useState<FinancePeriod>('today');
  const today = toLocalDateString(new Date());
  const [first, setFirst] = useState(toLocalDateString(addDays(new Date(), -6)));
  const [last, setLast] = useState(today);
  const range = financeRange(period, new Date(), { first, last });
  const fromIso = range?.from.toISOString();
  const toIso = range?.to.toISOString();

  const data = useLoaded(async () => {
    if (!range || !fromIso || !toIso) return null;
    const [sales, payments, expenses, purchases, supplierPayments, returns] = await Promise.all([
      store.sales.between(fromIso, toIso),
      store.credit.paymentsBetween(fromIso, toIso),
      store.expenses.between(fromIso, toIso),
      store.purchases.between(fromIso, toIso),
      store.supplierPayments.between(fromIso, toIso),
      store.returns.between(fromIso, toIso),
    ]);
    const finance = financeSummary({ sales, payments, expenses, purchases, supplierPayments, returns }, range.from, range.to);
    const empty = sales.length + payments.length + expenses.length + purchases.length + supplierPayments.length + returns.length === 0;
    return { key: `${fromIso}|${toIso}`, finance, empty, returns: { count: returns.length, totalCents: finance.result.returnsCents } };
  }, [store, fromIso, toIso]);

  const shown = range && data && data.key === `${fromIso}|${toIso}` ? data : undefined;
  return (
    <Sheet title={t.finance.title} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t.finance.period}>
          {FINANCE_PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={period === p} className={chip(period === p)} onClick={() => setPeriod(p)}>
              {t.finance.periods[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t.finance.first} type="date" max={today} value={first} onChange={(e) => setFirst(e.target.value)} />
            <Field label={t.finance.last} type="date" max={today} value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
        )}
        {!range ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-950">
            {t.finance.badDates}
          </p>
        ) : (
          <>
            <p className="text-center font-semibold text-slate-700">
              {t.finance.range(formatDate(range.from.toISOString()), formatDate(addDays(range.to, -1).toISOString()))}
            </p>
            {!shown ? (
              <Skeleton rows={3} />
            ) : shown.empty ? (
              <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.finance.empty}</p>
            ) : (
              <>
                <SoldReceivedCard money={shown.finance.sold} returns={shown.returns} />
                <MoneyFlowCard flow={shown.finance.flow} />
                <ResultCard result={shown.finance.result} />
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
