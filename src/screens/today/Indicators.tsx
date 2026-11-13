import type { ReactNode } from 'react';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Money } from '../../ui/kit';

export type IndicatorKind = 'sales' | 'received' | 'expenses' | 'profit' | 'cash' | 'toReceive' | 'toPay' | 'lowStock';

export interface IndicatorValues {
  /** The day shown ("Hoje", "Ontem", a date): only today has the shop-wide numbers (to receive, to pay, stock). */
  isToday: boolean;
  dayTitle: string;
  salesCents: number;
  salesCount: number;
  /** Against yesterday until the same hour (or the day before): positive = more. */
  diffCents: number;
  /** Today: compared with yesterday until this hour; a past day: with the whole day before. */
  sameTime: boolean;
  /** Voided sales and returns stay in sight: the owner sees them without opening anything. */
  voidedCount: number;
  voidedCents: number;
  returnsCount: number;
  returnsCents: number;
  receivedCents: number;
  onCreditCents: number;
  expensesCents: number;
  withdrawalsCents: number;
  /** Undefined when no product sold had a cost price. */
  profitCents?: number;
  marginText?: string;
  profitUnknownLines: number;
  cashCents: number;
  /** Today only: what customers owe, what the shop owes, low stock. */
  shop?: { owed: number; overdueCustomers: number; payable: number; payableUrgent: number; lowStock: number };
}

/**
 * The numbers of the day the owner asked for, at the top of «Hoje»: sales (with the comparison),
 * money received, expenses, estimated gross profit, cash, and, for today, what customers owe, what
 * the shop owes and how many products are low. Each one opens its detail.
 */
export function Indicators({ v, onOpen }: { v: IndicatorValues; onOpen: (kind: IndicatorKind) => void }) {
  return (
    <section aria-label={t.panel.title} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <button
        type="button"
        onClick={() => onOpen('sales')}
        className="col-span-2 rounded-2xl bg-brand-700 p-4 text-left text-white shadow-sm active:bg-brand-800"
      >
        <span className="block text-sm font-semibold text-brand-100">{v.isToday ? t.panel.sales : t.panel.salesOf(v.dayTitle)}</span>
        <Money cents={v.salesCents} className="block text-4xl font-extrabold" />
        <span data-testid="sales-count" className="mt-1 block text-lg">
          {t.today.sales(v.salesCount)}
        </span>
        <span className="mt-1 block text-sm text-white/90">
          {t.panel.compare(v.diffCents, formatKz(Math.abs(v.diffCents)), v.sameTime)}
        </span>
        {v.voidedCount > 0 && (
          <span className="mt-1 block text-sm font-semibold text-amber-100">
            {t.today.voidedLine(v.voidedCount, formatKz(v.voidedCents))}
          </span>
        )}
        {v.returnsCount > 0 && (
          <span className="block text-sm font-semibold text-amber-100">
            {t.today.returnsLine(v.returnsCount, formatKz(v.returnsCents))}
          </span>
        )}
      </button>
      <Tile label={t.panel.received} cents={v.receivedCents} onClick={() => onOpen('received')}>
        {v.onCreditCents > 0 && t.panel.notesCredit(formatKz(v.onCreditCents))}
      </Tile>
      <Tile label={v.isToday ? t.panel.expenses : t.panel.expensesOf} cents={v.expensesCents} onClick={() => onOpen('expenses')}>
        {v.withdrawalsCents > 0 && t.panel.notesWithdrawals(formatKz(v.withdrawalsCents))}
      </Tile>
      <Tile
        label={t.panel.profit}
        cents={v.profitCents}
        tone={v.profitCents !== undefined && v.profitCents < 0 ? 'bad' : undefined}
        onClick={() => onOpen('profit')}
      >
        {v.profitCents === undefined
          ? // No sale yet: nothing to ask for. Sales without any cost price: ask for the cost prices.
            v.salesCount > 0 && t.panel.profitMissing
          : v.profitUnknownLines > 0
            ? t.panel.profitPartial(v.profitUnknownLines)
            : v.marginText && t.panel.profitMargin(v.marginText)}
      </Tile>
      <Tile label={t.panel.cash} cents={v.cashCents} onClick={() => onOpen('cash')}>
        {t.panel.cashNote}
      </Tile>
      {v.shop && <ShopTiles shop={v.shop} onOpen={onOpen} />}
    </section>
  );
}

/** What customers owe, what the shop owes and how many products are low (today only). */
function ShopTiles({ shop, onOpen }: { shop: NonNullable<IndicatorValues['shop']>; onOpen: (kind: IndicatorKind) => void }) {
  return (
    <>
      <Tile
        label={t.panel.toReceive}
        cents={shop.owed}
        onClick={() => onOpen('toReceive')}
        tone={shop.overdueCustomers > 0 ? 'warn' : undefined}
      >
        {shop.overdueCustomers > 0 && t.panel.overdue(shop.overdueCustomers)}
      </Tile>
      <Tile label={t.panel.toPay} cents={shop.payable} onClick={() => onOpen('toPay')} tone={shop.payableUrgent > 0 ? 'warn' : undefined}>
        {shop.payableUrgent > 0 && t.panel.urgent(shop.payableUrgent)}
      </Tile>
      <button
        type="button"
        onClick={() => onOpen('lowStock')}
        className="col-span-2 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-left shadow-sm active:bg-slate-50 lg:col-span-4"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-600">{t.panel.lowStock}</span>
          <span className="text-xs text-slate-600">{shop.lowStock > 0 ? t.panel.lowNote : t.panel.noneLow}</span>
        </span>
        <span className={`text-2xl font-extrabold tabular-nums ${shop.lowStock > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
          {shop.lowStock}
        </span>
      </button>
    </>
  );
}

function Tile({
  label,
  cents,
  tone,
  onClick,
  children,
}: {
  label: string;
  /** Undefined: nothing to show yet ("—"). */
  cents?: number;
  tone?: 'warn' | 'bad';
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 flex-col justify-between rounded-2xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
    >
      <span className="text-sm leading-tight font-semibold text-slate-600">{label}</span>
      <span className={`text-xl font-extrabold tabular-nums ${tone === 'bad' ? 'text-red-700' : ''}`}>
        {cents === undefined ? '—' : formatKz(cents)}
      </span>
      <span className={`min-h-4 text-xs leading-tight ${tone ? 'font-semibold text-red-700' : 'text-slate-600'}`}>{children}</span>
    </button>
  );
}
