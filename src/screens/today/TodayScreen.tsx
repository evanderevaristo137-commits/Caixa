import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { shoppingListText } from '../../domain/messages';
import { lowStockProducts, restockList, summariseDayView } from '../../domain/today';
import { whatsAppLink } from '../../domain/whatsapp';
import { PAYMENT_METHODS } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { addDays, dayLabel, startOfLocalDay } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Card, LinkButton, Money, Skeleton } from '../../ui/kit';
import { BackupReminder } from './BackupReminder';
import { SalesList } from './SalesList';

export default function TodayScreen() {
  const { store } = useApp();
  const [offset, setOffset] = useState(0);
  const data = useLiveQuery(async () => {
    const now = new Date();
    const day = addDays(startOfLocalDay(now), offset);
    const from = addDays(day, -1).toISOString();
    const to = addDays(day, 1).toISOString();
    const isToday = offset === 0;
    const [sales, payments, products, owed, settings] = await Promise.all([
      store.sales.between(from, to),
      store.credit.paymentsBetween(from, to),
      isToday ? store.products.list() : Promise.resolve([]),
      isToday ? store.credit.totalOwed(now) : Promise.resolve(0),
      store.settings.get(),
    ]);
    const dayStartIso = day.toISOString();
    const daySales = sales.filter((s) => s.createdAt >= dayStartIso).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const shoppingList = whatsAppLink(shoppingListText(settings.storeName, restockList(products), now));
    return {
      offset,
      isToday,
      view: summariseDayView(sales, payments, day, now),
      daySales,
      lowStock: lowStockProducts(products),
      owed,
      shoppingList,
    };
  }, [store, offset]);

  // The header follows the tap immediately; the numbers appear once that day's data is loaded.
  const now = new Date();
  const header = (
    <div className="flex items-center justify-between">
      <button
        type="button"
        aria-label={t.today.prevDay}
        onClick={() => setOffset((o) => o - 1)}
        className="min-h-12 min-w-12 rounded-xl bg-white text-2xl font-bold shadow-sm active:bg-slate-100"
      >
        ‹
      </button>
      <h1 className="text-xl font-extrabold">{dayLabel(addDays(startOfLocalDay(now), offset), now)}</h1>
      <button
        type="button"
        aria-label={t.today.nextDay}
        disabled={offset === 0}
        onClick={() => setOffset((o) => Math.min(0, o + 1))}
        className="min-h-12 min-w-12 rounded-xl bg-white text-2xl font-bold shadow-sm active:bg-slate-100 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );

  if (!data || data.offset !== offset) {
    return (
      <div className="space-y-3 p-3">
        {header}
        <Skeleton rows={3} />
      </div>
    );
  }
  const { view, isToday } = data;
  const { day } = view;
  const max = Math.max(1, ...PAYMENT_METHODS.map((m) => day.byMethod[m]));

  return (
    <div className="space-y-3 p-3">
      {isToday && <BackupReminder />}
      {header}

      <Card className="bg-brand-700 text-white">
        <p className="text-sm font-semibold text-brand-100">{t.today.sold}</p>
        <Money cents={day.totalCents} className="block text-4xl font-extrabold" />
        <p className="mt-1 text-lg">{t.today.sales(day.count)}</p>
        <div className="mt-2 rounded-lg bg-white/15 px-3 py-2 text-base">
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
      </Card>

      <Card>
        <h2 className="font-bold">{t.today.cashTitle}</h2>
        <Money cents={view.cash.totalCents} className="block text-3xl font-extrabold" />
        <p className="mt-1 text-sm text-slate-600">
          {t.today.cashSales}: <Money cents={view.cash.salesCents} /> · {t.today.cashCredit}:{' '}
          <Money cents={view.cash.creditPaymentsCents} />
        </p>
        {view.creditPaidCents > 0 && (
          <p className="text-sm text-slate-600">
            {t.today.creditPaid}: <Money cents={view.creditPaidCents} />
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">{t.today.byMethod}</h2>
        {day.count === 0 ? (
          <p className="text-slate-500">{isToday ? t.today.noSales : t.today.noSalesDay}</p>
        ) : (
          <ul className="space-y-2">
            {PAYMENT_METHODS.filter((m) => day.byMethod[m] > 0).map((m) => (
              <li key={m}>
                <div className="flex justify-between text-base">
                  <span>{methodLabel[m]}</span>
                  <Money cents={day.byMethod[m]} className="font-semibold" />
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${m === 'credit' ? 'bg-amber-500' : 'bg-brand-600'}`}
                    style={{ width: `${(day.byMethod[m] / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isToday && (
        <>
          <a href="#/credit" className="block">
            <Card className="flex items-center justify-between">
              <span className="font-bold">{t.today.creditTotal}</span>
              <Money cents={data.owed} className="text-xl font-extrabold text-amber-800" />
            </Card>
          </a>
          <Card>
            <h2 className="mb-2 font-bold">{t.today.lowStock}</h2>
            {data.lowStock.length === 0 ? (
              <p className="text-slate-500">{t.today.noLowStock}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span className="truncate pr-2">{p.name}</span>
                    <span className={`font-bold whitespace-nowrap ${p.stock <= 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      {p.stock} / {p.minStock}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.lowStock.length > 0 && (
              <LinkButton href={data.shoppingList} className="mt-3">
                {t.today.shoppingList}
              </LinkButton>
            )}
          </Card>
        </>
      )}

      <SalesList sales={data.daySales} />
    </div>
  );
}
