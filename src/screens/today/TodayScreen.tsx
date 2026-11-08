import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { daySummaryText, shoppingListText } from '../../domain/messages';
import { creditAlerts, totalOutstanding } from '../../domain/credit';
import { formatQuantity } from '../../domain/quantity';
import { lowStockProducts, restockList, summariseDayView } from '../../domain/today';
import { profitByProduct, summariseProfit } from '../../domain/profit';
import { drawer as drawerOf, summariseOutflows } from '../../domain/cash';
import { totalPayable } from '../../domain/payables';
import { tillPurchasesCents } from '../../data/store';
import { whatsAppLink } from '../../domain/whatsapp';
import { PAYMENT_METHODS } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { addDays, dayLabel, formatDate, startOfLocalDay, toLocalDateString } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Card, LinkButton, Money, Skeleton } from '../../ui/kit';
import { BackupReminder } from './BackupReminder';
import { SalesList } from './SalesList';
import { PaymentAlerts } from './PaymentAlerts';
import { ProfitCard } from './ProfitCard';
import { CashCard } from './CashCard';
import { ReportsSheet } from './ReportsSheet';

export default function TodayScreen() {
  const { store } = useApp();
  const [offset, setOffset] = useState(0);
  const [reports, setReports] = useState(false);
  const data = useLiveQuery(async () => {
    const now = new Date();
    const day = addDays(startOfLocalDay(now), offset);
    const from = addDays(day, -1).toISOString();
    const to = addDays(day, 1).toISOString();
    const isToday = offset === 0;
    const [sales, payments, products, book, settings, dayExpenses, lastClose, dayPurchases, daySupplierPayments, payables] =
      await Promise.all([
        store.sales.between(from, to),
        store.credit.paymentsBetween(from, to),
        isToday ? store.products.list() : Promise.resolve([]),
        isToday ? store.credit.book(now) : Promise.resolve([]),
        store.settings.get(),
        store.expenses.between(day.toISOString(), to),
        store.cash.lastClose(toLocalDateString(day)),
        store.purchases.between(day.toISOString(), to),
        store.supplierPayments.between(day.toISOString(), to),
        isToday ? store.payables.book(now) : Promise.resolve([]),
      ]);
    const dayStartIso = day.toISOString();
    const daySales = sales.filter((s) => s.createdAt >= dayStartIso).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const shoppingList = whatsAppLink(shoppingListText(settings.storeName, restockList(products), now));
    const view = summariseDayView(sales, payments, day, now);
    const profit = summariseProfit(daySales);
    const outflows = summariseOutflows(dayExpenses);
    const drawer = drawerOf({
      floatCents: lastClose?.floatCents ?? settings.cashFloatCents ?? 0,
      cashSalesCents: view.cash.salesCents,
      cashCreditPaymentsCents: view.cash.creditPaymentsCents,
      cashOutCents: outflows.cashOutCents,
      cashPurchasesCents: tillPurchasesCents(dayPurchases, daySupplierPayments),
    });
    const title = offset >= -1 ? `${dayLabel(day, now)}, ${formatDate(day.toISOString())}` : formatDate(day.toISOString());
    const summaryLink = whatsAppLink(daySummaryText(settings.storeName, title, view, { profit, drawer, outflows, close: lastClose }));
    return {
      offset,
      isToday,
      view,
      profit,
      outflows,
      drawer,
      lastClose,
      dayExpenses: dayExpenses.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      defaultFloatCents: settings.cashFloatCents ?? 0,
      topProfit: profitByProduct(daySales).slice(0, 3),
      summaryLink,
      daySales,
      lowStock: lowStockProducts(products),
      owed: totalOutstanding(book),
      payable: totalPayable(payables),
      payableUrgent: payables.filter((p) => p.balanceCents > 0 && (p.dueState === 'overdue' || p.dueState === 'today')).length,
      alerts: creditAlerts(book),
      storeName: settings.storeName,
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

      {isToday && <PaymentAlerts alerts={data.alerts} storeName={data.storeName} />}

      <Card className="bg-brand-700 text-white">
        <p className="text-sm font-semibold text-brand-100">{t.today.sold}</p>
        <Money cents={day.totalCents} className="block text-4xl font-extrabold" />
        <p className="mt-1 text-lg">{t.today.sales(day.count)}</p>
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
      </Card>

      <button
        type="button"
        onClick={() => setReports(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand-700 bg-white px-4 font-semibold text-brand-800 active:bg-brand-50"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
        {t.reports.open}
      </button>

      {(day.count > 0 || data.outflows.expensesCents > 0) && (
        <ProfitCard profit={data.profit} top={data.topProfit} expensesCents={data.outflows.expensesCents} />
      )}

      <CashCard
        drawer={data.drawer}
        expenses={data.dayExpenses}
        lastClose={data.lastClose}
        creditPaidCents={view.creditPaidCents}
        isToday={isToday}
        defaultFloatCents={data.defaultFloatCents}
      />

      <Card>
        <h2 className="mb-2 font-bold">{t.today.byMethod}</h2>
        {day.count === 0 ? (
          <p className="text-slate-600">{isToday ? t.today.noSales : t.today.noSalesDay}</p>
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

      {(day.count > 0 || day.voidedCount > 0) && <LinkButton href={data.summaryLink}>{t.today.sendSummary}</LinkButton>}

      {isToday && (
        <>
          <a href="#/credit" className="block">
            <Card className="flex items-center justify-between">
              <span className="font-bold">{t.today.creditTotal}</span>
              <Money cents={data.owed} className="text-xl font-extrabold text-amber-800" />
            </Card>
          </a>
          {data.payable > 0 && (
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem('productsView', 'suppliers');
                } catch {
                  // Without storage the products tab simply opens on its first view.
                }
                window.location.hash = '#/products';
              }}
              className="block w-full text-left"
            >
              <Card className="flex items-center justify-between gap-2">
                <span>
                  <span className="block font-bold">{t.today.payablesTitle}</span>
                  {data.payableUrgent > 0 && (
                    <span className="text-sm font-semibold text-red-700">{t.today.payablesUrgent(data.payableUrgent)}</span>
                  )}
                </span>
                <Money cents={data.payable} className="text-xl font-extrabold text-amber-800" />
              </Card>
            </button>
          )}
          <Card>
            <h2 className="mb-2 font-bold">{t.today.lowStock}</h2>
            {data.lowStock.length === 0 ? (
              <p className="text-slate-600">{t.today.noLowStock}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span className="truncate pr-2">{p.name}</span>
                    <span className={`font-bold whitespace-nowrap ${p.stock <= 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      {formatQuantity(p.stock, p.soldBy)} / {formatQuantity(p.minStock, p.soldBy)}
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
      {reports && <ReportsSheet onClose={() => setReports(false)} />}
    </div>
  );
}
