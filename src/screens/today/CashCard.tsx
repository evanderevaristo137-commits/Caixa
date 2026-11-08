import { useState } from 'react';
import type { Drawer } from '../../domain/cash';
import type { CashClose, Expense } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatTime } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Button, Card, Money } from '../../ui/kit';
import { CloseDaySheet } from './CloseDaySheet';
import { ExpenseDetailSheet } from './ExpenseDetailSheet';
import { ExpenseSheet } from './ExpenseSheet';

/** The cash that should be in the till, the money that went out, and the end-of-day count. */
export function CashCard({
  drawer,
  expenses,
  lastClose,
  creditPaidCents,
  isToday,
  defaultFloatCents,
}: {
  drawer: Drawer;
  expenses: Expense[];
  lastClose?: CashClose;
  creditPaidCents: number;
  isToday: boolean;
  defaultFloatCents: number;
}) {
  const [sheet, setSheet] = useState<'none' | 'expense' | 'close'>('none');
  const [openExpense, setOpenExpense] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="font-bold">{t.cash.title}</h2>
      <Money cents={drawer.expectedCents} className="block text-3xl font-extrabold" />
      <dl className="mt-1 space-y-0.5 text-sm text-slate-600">
        {drawer.floatCents > 0 && <Line label={t.cash.float} cents={drawer.floatCents} />}
        <Line label={t.cash.sales} cents={drawer.cashSalesCents} />
        {drawer.cashCreditPaymentsCents > 0 && <Line label={t.cash.creditPaid} cents={drawer.cashCreditPaymentsCents} />}
        {drawer.cashOutCents > 0 && <Line label={t.cash.out} cents={-drawer.cashOutCents} />}
      </dl>
      {creditPaidCents > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          {t.today.creditPaid}: <Money cents={creditPaidCents} />
        </p>
      )}

      {lastClose && <CloseStatus close={lastClose} />}

      {isToday && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setSheet('expense')}>
            {t.cash.addOut}
          </Button>
          <Button onClick={() => setSheet('close')}>{t.cash.closeDay}</Button>
        </div>
      )}

      {expenses.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-sm font-bold text-slate-700">{t.expenses.listTitle}</h3>
          <ul className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpenExpense(e.id)}
                  className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left active:bg-slate-50"
                >
                  <span className="w-12 text-sm font-semibold text-slate-600 tabular-nums">{formatTime(e.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${e.voidedAt ? 'text-slate-400 line-through' : ''}`}>
                      {t.expenses.categories[e.category]}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                    <span className="text-sm text-slate-600">
                      {e.fromCash ? t.expenses.paidFromCash : t.expenses.paidOtherwise}
                      {e.voidedAt && (
                        <span className="ml-1 rounded bg-red-100 px-1.5 font-semibold text-red-800">{t.expenses.voidedTag}</span>
                      )}
                    </span>
                  </span>
                  <span className={`font-bold tabular-nums ${e.voidedAt ? 'text-slate-400 line-through' : 'text-red-700'}`}>
                    − {formatKz(e.amountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {sheet === 'expense' && <ExpenseSheet onClose={() => setSheet('none')} />}
      {sheet === 'close' && (
        <CloseDaySheet defaultFloatCents={lastClose?.floatCents ?? defaultFloatCents} onClose={() => setSheet('none')} />
      )}
      {openExpense && <ExpenseDetailSheet expenseId={openExpense} onClose={() => setOpenExpense(null)} />}
    </Card>
  );
}

function Line({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {cents < 0 ? '− ' : ''}
        {formatKz(Math.abs(cents))}
      </dd>
    </div>
  );
}

function CloseStatus({ close }: { close: CashClose }) {
  const d = close.differenceCents;
  const tone = d === 0 ? 'bg-brand-50 text-brand-800' : d > 0 ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800';
  const result = d === 0 ? t.cash.exact : d > 0 ? t.cash.over(formatKz(d)) : t.cash.short(formatKz(-d));
  return (
    <p className={`mt-3 rounded-lg p-2 text-sm font-semibold ${tone}`}>
      {t.cash.closedAt(formatTime(close.createdAt), formatKz(close.countedCents))} {result}
    </p>
  );
}
