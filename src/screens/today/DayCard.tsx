import type { SoldReceived } from '../../domain/finance';
import type { DayView } from '../../domain/today';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card, Money } from '../../ui/kit';

/**
 * The day at a glance: sold, received next to it (a sale on credit is sold but not received; a debt
 * paid is received but not sold today), the comparison with yesterday, voided sales and returns.
 */
export function DayCard({ view, money, returns }: { view: DayView; money: SoldReceived; returns: { count: number; totalCents: number } }) {
  const { day } = view;
  const parts = [
    money.onCreditCents > 0 && t.today.partCredit(formatKz(money.onCreditCents)),
    money.pendingCents > 0 && t.today.partPending(formatKz(money.pendingCents)),
    money.customersCents > 0 && t.today.partCustomers(formatKz(money.customersCents)),
  ].filter((p): p is string => !!p);
  return (
    <Card className="bg-brand-700 text-white">
      <p className="text-sm font-semibold text-brand-100">{t.today.sold}</p>
      <Money cents={day.totalCents} className="block text-4xl font-extrabold" />
      <p className="mt-1 text-lg">{t.today.sales(day.count)}</p>
      <p className="mt-1 text-base font-semibold">
        {t.today.receivedLine}: <Money cents={money.receivedCents} className="font-bold" />
      </p>
      {parts.length > 0 && <p className="text-sm text-white/90">{parts.join(' · ')}</p>}
      <div className="mt-2 rounded-lg bg-black/20 px-3 py-2 text-base">
        <p>
          {view.comparisonIsSameTime ? t.today.vsYesterday : t.today.comparedPrevDay}:{' '}
          <Money cents={view.comparison.totalCents} className="font-semibold" />
        </p>
        <p className="font-bold">
          {view.diffCents === 0 ? (
            t.today.same
          ) : (
            <>
              {view.diffCents > 0 ? '▲ ' : '▼ '}
              <Money cents={Math.abs(view.diffCents)} /> {view.diffCents > 0 ? t.today.more : t.today.less}
            </>
          )}
        </p>
        {view.comparisonIsSameTime && (
          <p className="mt-1 text-sm text-white/90">
            {t.today.yesterdayFull}: <Money cents={view.previousFull.totalCents} /> · {t.today.sales(view.previousFull.count)}
          </p>
        )}
      </div>
      {day.voidedCount > 0 && (
        <p className="mt-2 text-sm font-semibold text-amber-200">{t.today.voidedLine(day.voidedCount, formatKz(day.voidedCents))}</p>
      )}
      {returns.count > 0 && (
        <p className="mt-1 text-sm font-semibold text-amber-200">{t.today.returnsLine(returns.count, formatKz(returns.totalCents))}</p>
      )}
    </Card>
  );
}
