import { useState, type ReactNode } from 'react';
import { compareText } from '../../domain/ranking';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { daySummaryText, shoppingListText } from '../../domain/messages';
import { creditAlerts, totalOutstanding } from '../../domain/credit';
import { formatQuantity } from '../../domain/quantity';
import { lowStockProducts, summariseDayView } from '../../domain/today';
import { restockList, salesSpeed } from '../../domain/stock-insights';
import { profitByProduct, summariseProfit } from '../../domain/profit';
import { summariseReturns } from '../../domain/returns';
import { drawer as drawerOf, summariseOutflows } from '../../domain/cash';
import { totalPayable } from '../../domain/payables';
import { tillPurchasesCents } from '../../data/store';
import { whatsAppLink } from '../../domain/whatsapp';
import { isPaymentPending, PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { addDays, dayLabel, formatDate, startOfLocalDay, toLocalDateString } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Card, LinkButton, Money, Skeleton } from '../../ui/kit';
import { BackupReminder } from './BackupReminder';
import { SalesList } from './SalesList';
import { PaymentAlerts } from './PaymentAlerts';
import { ProfitCard } from './ProfitCard';
import { CashCard } from './CashCard';
import { DigitalCard } from './DigitalCard';
import { digitalStatus } from '../../domain/digital-watch';
import { ReportsSheet } from './ReportsSheet';
import { SalesHistorySheet } from './SalesHistorySheet';
import { InssCard } from '../inss/InssCard';
import { PendingPaymentsCard } from './PendingPaymentsCard';
import { DayCard } from './DayCard';
import { FinanceSheet } from './FinanceSheet';
import { soldAndReceived } from '../../domain/finance';

export default function TodayScreen() {
  const { store } = useApp();
  const [offset, setOffset] = useState(0);
  const [reports, setReports] = useState(false);
  const [history, setHistory] = useState(false);
  const [finance, setFinance] = useState(false);
  const data = useLiveQuery(async () => {
    const now = new Date();
    const day = addDays(startOfLocalDay(now), offset);
    const from = addDays(day, -1).toISOString();
    const to = addDays(day, 1).toISOString();
    const isToday = offset === 0;
    const [sales, payments, products, book, settings, dayExpenses, lastClose, dayPurchases, daySupplierPayments, payables, dayReturns] =
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
        store.returns.between(day.toISOString(), to),
      ]);
    // Credit for stock: digital receipts of the last 7 complete days against the 4 weeks before.
    const watchFrom = addDays(day, -36).toISOString();
    const [watchSales, watchPayments] = isToday
      ? await Promise.all([store.sales.since(watchFrom), store.credit.paymentsBetween(watchFrom, to)])
      : [[], []];
    const digital = isToday ? digitalStatus(watchSales, watchPayments, now, settings.digitalMinShareBp) : undefined;
    const dayStartIso = day.toISOString();
    const daySales = sales.filter((s) => s.createdAt >= dayStartIso).sort((a, b) => compareText(b.createdAt, a.createdAt));
    const speeds = isToday ? salesSpeed(watchSales, products, now) : undefined;
    const shoppingList = whatsAppLink(shoppingListText(settings.storeName, restockList(products, speeds), now));
    const view = summariseDayView(sales, payments, day, now);
    // Sold next to received: a sale on credit is sold, not received; a debt paid is received, not sold today.
    const money = soldAndReceived(
      daySales,
      payments.filter((p) => p.createdAt >= dayStartIso),
    );
    const returns = summariseReturns(dayReturns);
    const profit = summariseProfit(daySales, dayReturns);
    // Electronic payments of the day whose money has not arrived yet, by method.
    const pendingByMethod = new Map<PaymentMethod, number>();
    for (const s of daySales) if (isPaymentPending(s)) pendingByMethod.set(s.method, (pendingByMethod.get(s.method) ?? 0) + s.totalCents);
    const pending = {
      count: daySales.filter(isPaymentPending).length,
      totalCents: [...pendingByMethod.values()].reduce((a, v) => a + v, 0),
    };
    const outflows = summariseOutflows(dayExpenses);
    const drawer = drawerOf({
      floatCents: lastClose?.floatCents ?? settings.cashFloatCents ?? 0,
      cashSalesCents: view.cash.salesCents,
      cashCreditPaymentsCents: view.cash.creditPaymentsCents,
      cashOutCents: outflows.cashOutCents,
      cashPurchasesCents: tillPurchasesCents(dayPurchases, daySupplierPayments),
      cashRefundsCents: returns.cashCents,
    });
    const title = offset >= -1 ? `${dayLabel(day, now)}, ${formatDate(day.toISOString())}` : formatDate(day.toISOString());
    const summaryLink = whatsAppLink(
      daySummaryText(settings.storeName, title, view, { profit, drawer, outflows, close: lastClose, returns, pending, money }),
    );
    return {
      offset,
      isToday,
      view,
      digital,
      profit,
      outflows,
      drawer,
      returns,
      money,
      pendingByMethod,
      lastClose,
      dayExpenses: dayExpenses.sort((a, b) => compareText(b.createdAt, a.createdAt)),
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
      {isToday && <PendingPaymentsCard />}
      {data.digital?.alarm && <DigitalCard status={data.digital} />}

      <DayCard view={view} money={data.money} returns={data.returns} />

      <ActionButton icon="M4 20V10M10 20V4M16 20v-7M22 20H2" onClick={() => setReports(true)}>
        {t.reports.open}
      </ActionButton>
      <ActionButton icon="M3 7h18v12H3zM3 11h18M16 15h2" onClick={() => setFinance(true)}>
        {t.finance.open}
      </ActionButton>
      <ActionButton icon="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35" onClick={() => setHistory(true)}>
        {t.history.open}
      </ActionButton>

      {(day.count > 0 || data.outflows.expensesCents > 0) && (
        <ProfitCard profit={data.profit} top={data.topProfit} expensesCents={data.outflows.expensesCents} />
      )}

      {data.digital && !data.digital.alarm && data.digital.minShareBp !== undefined && <DigitalCard status={data.digital} />}

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
                {!!data.pendingByMethod.get(m) && (
                  <p className="text-right text-sm font-semibold text-amber-800">
                    {t.pending.byMethod(formatKz(data.pendingByMethod.get(m)!))}
                  </p>
                )}
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

      {(day.count > 0 || day.voidedCount > 0 || data.returns.count > 0) && (
        <LinkButton href={data.summaryLink}>{t.today.sendSummary}</LinkButton>
      )}

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
          <InssCard />
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
      {history && <SalesHistorySheet onClose={() => setHistory(false)} />}
      {finance && <FinanceSheet onClose={() => setFinance(false)} />}
    </div>
  );
}

/** A wide button of «Hoje» that opens a sheet, with a small line icon. */
function ActionButton({ icon, onClick, children }: { icon: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand-700 bg-white px-4 font-semibold text-brand-800 active:bg-brand-50"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icon} />
      </svg>
      {children}
    </button>
  );
}
