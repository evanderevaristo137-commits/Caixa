import { formatMargin, marginBp, type ProductProfit, type ProfitSummary } from '../../domain/profit';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card, Money } from '../../ui/kit';

/** Estimated profit of the day's sales; without cost prices it explains how to get it. */
export function ProfitCard({ profit, top, expensesCents = 0 }: { profit: ProfitSummary; top: ProductProfit[]; expensesCents?: number }) {
  const margin = marginBp(profit);
  const expensesLine = expensesCents > 0 && (
    <div className="flex justify-between gap-2">
      <dt>{t.today.expensesLine}</dt>
      <dd className="font-semibold text-red-700 tabular-nums">− {formatKz(expensesCents)}</dd>
    </div>
  );
  if (margin === undefined) {
    return (
      <Card className="space-y-2">
        <h2 className="font-bold">{t.today.profitTitle}</h2>
        <p className="text-slate-600">{t.today.profitSetup}</p>
        {expensesLine && <dl className="text-sm">{expensesLine}</dl>}
        <a
          href="#/products"
          className="flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-4 font-semibold active:bg-slate-100"
        >
          {t.today.profitSetupAction}
        </a>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="font-bold">{t.today.profitTitle}</h2>
      <Money
        cents={profit.profitCents}
        className={`block text-3xl font-extrabold ${profit.profitCents < 0 ? 'text-red-700' : 'text-brand-700'}`}
      />
      <p className="mt-1 text-sm text-slate-600">{t.today.profitMargin(formatMargin(margin), formatKz(profit.costCents))}</p>
      {profit.unknownLines > 0 && <p className="mt-1 text-sm font-medium text-amber-800">{t.today.profitMissing(profit.unknownLines)}</p>}
      {expensesLine && (
        <dl className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-sm">
          {expensesLine}
          <div className="flex justify-between gap-2 font-bold">
            <dt>{t.today.resultLine}</dt>
            <dd className={`tabular-nums ${profit.profitCents - expensesCents < 0 ? 'text-red-700' : ''}`}>
              {formatKz(profit.profitCents - expensesCents)}
            </dd>
          </div>
        </dl>
      )}
      {top.length > 0 && (
        <>
          <h3 className="mt-3 mb-1 text-sm font-bold text-slate-700">{t.today.topProfit}</h3>
          <ul className="space-y-1">
            {top.map((r) => (
              <li key={r.productId} className="flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className={`font-semibold whitespace-nowrap tabular-nums ${r.profitCents < 0 ? 'text-red-700' : 'text-brand-700'}`}>
                  {r.profitCents > 0 ? '+' : ''}
                  {formatKz(r.profitCents)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
