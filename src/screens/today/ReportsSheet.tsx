import { useState, type ReactNode } from 'react';
import { useApp } from '../../app/context';
import { useLoaded } from '../../ui/use-loaded';
import { formatMargin, marginBp, profitByProduct, type ProductProfit } from '../../domain/profit';
import { formatQuantity } from '../../domain/quantity';
import {
  buckets,
  changeBp,
  fillBuckets,
  formatChange,
  periodRange,
  periodSummary,
  shareBp,
  topProducts,
  type Bucket,
  type PeriodKind,
  type PeriodSummary,
  type TopProduct,
} from '../../domain/reports';
import { PAYMENT_METHODS } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { ColumnChart } from '../../ui/ColumnChart';
import { Button, Card, Sheet, Skeleton } from '../../ui/kit';
import { StoreSheetView } from './StoreSheetView';
import { CategoryReport } from './CategoryReport';
import { salesByCategory, type CategorySales } from '../../domain/categories';
import { soldAndReceived, type SoldReceived } from '../../domain/finance';
import { SoldReceivedCard } from './FinanceCards';

const KINDS: PeriodKind[] = ['7d', '30d', '12m'];
const pct = (bp: number) => `${Math.round(bp / 100)}%`;

/** Last 7 days, 30 days or 12 months: totals against the period before, the chart and the best sellers. */
export function ReportsSheet({ onClose }: { onClose: () => void }) {
  const { store } = useApp();
  const [kind, setKind] = useState<PeriodKind>('7d');
  const [sheet, setSheet] = useState(false);
  const data = useLoaded(async (): Promise<ReportData> => {
    const now = new Date();
    const { from, to, prevFrom } = periodRange(kind, now);
    const [sales, payments, expenses, categoryOf, returns] = await Promise.all([
      store.sales.between(prevFrom.toISOString(), to.toISOString()),
      store.credit.paymentsBetween(from.toISOString(), to.toISOString()),
      store.expenses.between(from.toISOString(), to.toISOString()),
      store.products.categoryMap(),
      store.returns.between(prevFrom.toISOString(), to.toISOString()),
    ]);
    const fromIso = from.toISOString();
    const inPeriod = sales.filter((s) => s.createdAt >= fromIso);
    return {
      kind,
      current: periodSummary(sales, payments, expenses, from, to, returns),
      previous: periodSummary(sales, [], [], prevFrom, from, returns),
      money: soldAndReceived(inPeriod, payments),
      cols: fillBuckets(buckets(kind, now), sales, returns),
      top: topProducts(inPeriod, 5),
      topProfit: profitByProduct(inPeriod).slice(0, 5),
      byCategory: salesByCategory(inPeriod, categoryOf),
    };
  }, [store, kind]);

  const stale = data && data.kind !== kind;
  return (
    <Sheet title={t.reports.title} onClose={onClose}>
      <div role="tablist" aria-label={t.reports.title} className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700'}`}
          >
            {t.reports.periods[k]}
          </button>
        ))}
      </div>
      {!data ? (
        <Skeleton rows={3} />
      ) : (
        <div className={`space-y-3 transition-opacity ${stale ? 'opacity-50' : ''}`}>
          <Body data={data} />
          <Button variant="secondary" className="w-full" onClick={() => setSheet(true)}>
            {t.reports.sheet}
          </Button>
          <p className="text-center text-sm text-slate-600">{t.reports.sheetHint}</p>
        </div>
      )}
      {sheet && <StoreSheetView onClose={() => setSheet(false)} />}
    </Sheet>
  );
}

interface ReportData {
  kind: PeriodKind;
  current: PeriodSummary;
  previous: PeriodSummary;
  money: SoldReceived;
  cols: Bucket[];
  top: TopProduct[];
  topProfit: ProductProfit[];
  byCategory: CategorySales[];
}

function Body({ data }: { data: ReportData }) {
  const { current, previous, kind } = data;
  if (current.count === 0) return <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.reports.empty}</p>;
  const change = changeBp(current.salesCents, previous.salesCents);
  const margin = marginBp(current.profit);
  const maxMethod = Math.max(1, ...PAYMENT_METHODS.map((m) => current.byMethod[m]));
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={t.reports.sold} value={formatKz(current.salesCents)}>
          {change === undefined ? (
            <span className="text-slate-600">{t.reports.noPrevious}</span>
          ) : (
            <span className={change >= 0 ? 'text-brand-800' : 'text-red-700'}>
              {change >= 0 ? '▲ ' : '▼ '}
              {t.reports.vs(formatChange(change), t.reports.previous[kind]!)}
            </span>
          )}
        </Tile>
        <Tile label={t.reports.salesCount} value={String(current.count)}>
          {t.reports.avgTicket(formatKz(current.avgTicketCents))}
        </Tile>
        <Tile label={t.reports.profit} value={margin === undefined ? '—' : formatKz(current.profit.profitCents)}>
          {margin === undefined ? t.reports.noProfit : t.reports.margin(formatMargin(margin))}
        </Tile>
        <Tile label={t.reports.expenses} value={formatKz(current.outflows.expensesCents)}>
          {margin !== undefined && t.reports.result(formatKz(current.profit.profitCents - current.outflows.expensesCents))}
        </Tile>
      </div>

      <Card>
        <h3 className="mb-1 font-bold">{kind === '12m' ? t.reports.byMonth : t.reports.byDay}</h3>
        <ColumnChart
          label={kind === '12m' ? t.reports.byMonth : t.reports.byDay}
          tableLabel={t.reports.table}
          columns={data.cols.map((c) => ({
            key: c.start.toISOString(),
            label: c.label,
            title: c.title,
            valueCents: c.salesCents,
            isCurrent: c.isCurrent,
            detail: `${t.reports.salesDetail(c.count)}${c.profitCents !== undefined ? ` · ${t.reports.profit.toLowerCase()} ${formatKz(c.profitCents)}` : ''}`,
          }))}
        />
      </Card>

      <Card>
        <h3 className="mb-2 font-bold">{t.reports.methods}</h3>
        <ul className="space-y-2">
          {PAYMENT_METHODS.filter((m) => current.byMethod[m] > 0)
            .sort((a, b) => current.byMethod[b] - current.byMethod[a])
            .map((m) => (
              <li key={m}>
                <div className="flex justify-between gap-2">
                  <span>{methodLabel[m]}</span>
                  <span className="font-semibold tabular-nums">
                    {formatKz(current.byMethod[m])} · {pct(shareBp(current.byMethod[m], current.salesCents))}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(current.byMethod[m] / maxMethod) * 100}%` }} />
                </div>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-sm text-slate-600">{t.reports.electronic(pct(shareBp(current.electronicCents, current.salesCents)))}</p>
      </Card>

      <Card>
        <h3 className="mb-1 font-bold">{t.reports.top}</h3>
        <Ranked
          rows={data.top.map((p) => ({
            key: p.productId,
            name: p.name,
            note: formatQuantity(p.quantity, p.soldBy),
            cents: p.revenueCents,
          }))}
        />
        {data.topProfit.length > 0 && (
          <>
            <h3 className="mt-3 mb-1 font-bold">{t.reports.topProfit}</h3>
            <Ranked
              rows={data.topProfit.map((p) => ({
                key: p.productId,
                name: p.name,
                note: formatQuantity(p.quantity, p.soldBy),
                cents: p.profitCents,
              }))}
            />
          </>
        )}
      </Card>

      <CategoryReport rows={data.byCategory} totalCents={current.salesCents} />

      <SoldReceivedCard money={data.money} returns={current.returns} />
    </>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {children && <p className="mt-0.5 text-xs leading-snug">{children}</p>}
    </div>
  );
}

function Ranked({ rows }: { rows: { key: string; name: string; note: string; cents: number }[] }) {
  return (
    <ol className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-center gap-2 py-1.5">
          <span className="w-5 text-sm font-bold text-slate-500 tabular-nums">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">{r.name}</span>
          <span className="text-sm text-slate-600 tabular-nums">{r.note}</span>
          <span className="w-24 text-right font-semibold tabular-nums">{formatKz(r.cents)}</span>
        </li>
      ))}
    </ol>
  );
}
