import { useState } from 'react';
import { compareText } from '../../domain/ranking';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { daySummaryText } from '../../domain/messages';
import { creditAlerts, totalOutstanding } from '../../domain/credit';
import { lowStockProducts, summariseDayView } from '../../domain/today';
import { formatMargin, marginBp, profitByProduct, summariseProfit } from '../../domain/profit';
import { summariseReturns } from '../../domain/returns';
import { drawer as drawerOf, summariseOutflows } from '../../domain/cash';
import { totalPayable } from '../../domain/payables';
import { tillPurchasesCents } from '../../data/store';
import { whatsAppLink } from '../../domain/whatsapp';
import { isPaymentPending, type PaymentMethod } from '../../domain/types';
import { digitalStatus } from '../../domain/digital-watch';
import { soldAndReceived } from '../../domain/finance';
import { t } from '../../i18n/pt-AO';
import { addDays, dayLabel, formatDate, startOfLocalDay, toLocalDateString } from '../../lib/dates';
import { LinkButton, Sheet, Skeleton } from '../../ui/kit';
import { useLoaded } from '../../ui/use-loaded';
import { SalesList } from './SalesList';
import { ProfitCard } from './ProfitCard';
import { CashCard } from './CashCard';
import { DigitalCard } from './DigitalCard';
import { InssCard } from '../inss/InssCard';
import { Indicators, type IndicatorKind } from './Indicators';
import { ToDoCard } from './ToDoCard';
import { ReportsMenu } from './ReportsMenu';
import { DaySheet } from './DaySheet';
import { StockInsightsSheet } from '../products/StockInsightsSheet';
import { goToSuppliers } from './go-suppliers';
import { SuggestionsCard } from './SuggestionsCard';
import { belowCost } from '../../domain/suggestions';
import { useTeam } from '../../app/team';

/** The cash card is where expenses are recorded and the day is closed: the panel scrolls to it. */
const CASH_ID = 'caixa';

/**
 * «Hoje»: the numbers of the day on top (each opens its detail), what needs attention, the
 * reports, the till (money out, closing the day) and the day's sales.
 */
export default function TodayScreen() {
  const { store } = useApp();
  // An employee who may not see the shop's numbers: no profit, reports, debts to suppliers or INSS.
  const numbers = useTeam().can('numbers');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<'day' | 'profit' | 'stock' | null>(null);
  // One read for the whole top of the screen, so it appears complete at once. Measured on a slow
  // phone: splitting out the customers' accounts (the biggest read) showed the day's numbers sooner
  // but the whole screen later, with numbers popping in.
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
    const dayStartIso = day.toISOString();
    const daySales = sales.filter((s) => s.createdAt >= dayStartIso).sort((a, b) => compareText(b.createdAt, a.createdAt));
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
    return {
      offset,
      isToday,
      title,
      view,
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
      summaryLink: whatsAppLink(
        daySummaryText(settings.storeName, title, view, { profit, drawer, outflows, close: lastClose, returns, pending, money }),
      ),
      daySales,
      storeName: settings.storeName,
      // Today only, the whole shop: what customers owe, what the shop owes suppliers, low stock.
      shop: isToday
        ? {
            lowStock: lowStockProducts(products).length,
            belowCost: belowCost(products),
            owed: totalOutstanding(book),
            alerts: creditAlerts(book),
            payable: totalPayable(payables),
            payableUrgent: payables.filter((p) => p.balanceCents > 0 && (p.dueState === 'overdue' || p.dueState === 'today')).length,
          }
        : null,
    };
  }, [store, offset]);
  // Credit for stock: the last 7 complete days against the 4 weeks before (five weeks of sales):
  // read once the numbers above are on the screen, so they never wait for it.
  const isToday = data?.isToday ?? false;
  const digital = useLoaded(async () => {
    if (!isToday) return undefined;
    const now = new Date();
    const since = addDays(startOfLocalDay(now), -36).toISOString();
    const until = addDays(startOfLocalDay(now), 1).toISOString();
    const [sales, payments, settings] = await Promise.all([
      store.sales.since(since),
      store.credit.paymentsBetween(since, until),
      store.settings.get(),
    ]);
    return digitalStatus(sales, payments, now, settings.digitalMinShareBp);
  }, [store, isToday]);

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
  const { view } = data;
  const { day } = view;
  const margin = marginBp(data.profit);

  const onOpen = (kind: IndicatorKind) => {
    if (kind === 'sales' || kind === 'received') return setOpen('day');
    if (kind === 'profit') return numbers && setOpen('profit');
    if (kind === 'lowStock') return setOpen('stock');
    if (kind === 'toReceive') {
      window.location.hash = '#/credit';
      return;
    }
    if (kind === 'toPay') return goToSuppliers();
    // Expenses and cash: the till card, where money out is recorded and the day is closed.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(CASH_ID)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-3 p-3">
      {header}

      {/* Credit for stock: the alarm stays at the top, where the owner cannot miss it. */}
      {numbers && data.isToday && digital?.alarm && <DigitalCard status={digital} />}

      <Indicators
        onOpen={onOpen}
        v={{
          isToday: data.isToday,
          dayTitle: data.title,
          salesCents: day.totalCents,
          salesCount: day.count,
          diffCents: view.diffCents,
          sameTime: view.comparisonIsSameTime,
          voidedCount: day.voidedCount,
          voidedCents: day.voidedCents,
          returnsCount: data.returns.count,
          returnsCents: data.returns.totalCents,
          receivedCents: data.money.receivedCents,
          onCreditCents: data.money.onCreditCents,
          expensesCents: data.outflows.expensesCents,
          withdrawalsCents: data.outflows.withdrawalsCents,
          profitCents: margin === undefined ? undefined : data.profit.profitCents,
          marginText: margin === undefined ? undefined : formatMargin(margin),
          profitUnknownLines: data.profit.unknownLines,
          cashCents: data.drawer.expectedCents,
          numbers,
          shop: data.shop ? { ...data.shop, overdueCustomers: data.shop.alerts.overdue.length } : undefined,
        }}
      />

      {/* A tablet or a computer: what to do and the till on the left, the day's sales on the right. */}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
        <div className="space-y-3">
          {data.shop && (
            <ToDoCard alerts={data.shop.alerts} storeName={data.storeName} urgentPayables={data.shop.payableUrgent} numbers={numbers} />
          )}

          {numbers && data.shop && <SuggestionsCard below={data.shop.belowCost} />}

          {numbers && <ReportsMenu />}

          <div id={CASH_ID} className="scroll-mt-3">
            <CashCard
              drawer={data.drawer}
              expenses={data.dayExpenses}
              lastClose={data.lastClose}
              creditPaidCents={view.creditPaidCents}
              isToday={data.isToday}
              defaultFloatCents={data.defaultFloatCents}
            />
          </div>

          {numbers && digital && !digital.alarm && digital.minShareBp !== undefined && <DigitalCard status={digital} />}

          {(day.count > 0 || day.voidedCount > 0 || data.returns.count > 0) && (
            <LinkButton href={data.summaryLink}>{t.today.sendSummary}</LinkButton>
          )}
        </div>
        <div className="space-y-3">
          <SalesList sales={data.daySales} isToday={data.isToday} />

          {numbers && data.isToday && <InssCard />}
        </div>
      </div>

      {open === 'day' && (
        <DaySheet
          title={t.panel.daySheet}
          view={view}
          money={data.money}
          returns={data.returns}
          pendingByMethod={data.pendingByMethod}
          summaryLink={data.summaryLink}
          isToday={data.isToday}
          sales={data.daySales}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'profit' && (
        <Sheet title={t.panel.profitSheet} onClose={() => setOpen(null)}>
          <ProfitCard profit={data.profit} top={data.topProfit} expensesCents={data.outflows.expensesCents} />
        </Sheet>
      )}
      {open === 'stock' && <StockInsightsSheet onClose={() => setOpen(null)} />}
    </div>
  );
}
