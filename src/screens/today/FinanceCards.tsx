import type { ReactNode } from 'react';
import type { Finance, SoldReceived } from '../../domain/finance';
import { formatMargin, marginBp } from '../../domain/profit';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card, Money } from '../../ui/kit';

/** One line of a statement: label on the left, amount on the right ("−" for money out). */
function Row({
  label,
  cents,
  minus = false,
  strong = false,
  sub = false,
}: {
  label: ReactNode;
  cents: number;
  minus?: boolean;
  strong?: boolean;
  sub?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-bold' : ''} ${sub ? 'pl-3 text-sm text-slate-600' : ''}`}>
      <dt>{label}</dt>
      <dd className={`whitespace-nowrap tabular-nums ${strong && cents < 0 ? 'text-red-700' : ''}`}>
        {minus && cents > 0 ? '− ' : ''}
        {formatKz(cents)}
      </dd>
    </div>
  );
}

/** Sold next to received: a sale on credit is sold but not received yet; a debt paid is received but not sold now. */
export function SoldReceivedCard({ money, returns }: { money: SoldReceived; returns?: { count: number; totalCents: number } }) {
  return (
    <Card>
      <h3 className="mb-2 font-bold">{t.finance.soldReceived}</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-sm font-semibold text-slate-600">{t.finance.sold}</p>
          <Money cents={money.soldCents} className="block text-2xl font-extrabold" />
          <p className="text-sm text-slate-600">{t.today.sales(money.count)}</p>
        </div>
        <div className="rounded-xl bg-brand-50 p-2">
          <p className="text-sm font-semibold text-brand-800">{t.finance.received}</p>
          <Money cents={money.receivedCents} className="block text-2xl font-extrabold text-brand-800" />
          <p className="text-sm text-slate-600">{t.finance.receivedHint}</p>
        </div>
      </div>
      {(money.onCreditCents > 0 || money.pendingCents > 0 || money.customersCents > 0 || (returns?.count ?? 0) > 0) && (
        <dl className="mt-2 space-y-0.5 text-sm text-slate-700">
          {money.onCreditCents > 0 && <Row label={t.finance.onCredit} cents={money.onCreditCents} />}
          {money.pendingCents > 0 && <Row label={t.finance.pending} cents={money.pendingCents} />}
          {money.customersCents > 0 && <Row label={t.finance.customers} cents={money.customersCents} />}
          {returns && returns.count > 0 && (
            <div>
              <dt className="sr-only">{t.finance.resultReturns}</dt>
              <dd>{t.finance.returns(returns.count, formatKz(returns.totalCents))}</dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}

/** Everything that came in and went out in the period, whatever the reason, and the balance. */
export function MoneyFlowCard({ flow }: { flow: Finance['flow'] }) {
  const outs: [string, number][] = [
    [t.finance.outExpenses, flow.expensesCents],
    [t.finance.outGoods, flow.goodsCents],
    [t.finance.outRefunds, flow.refundsCents],
    [t.finance.outWithdrawals, flow.withdrawalsCents],
    [t.finance.outInss, flow.inssCents],
  ];
  return (
    <Card>
      <h3 className="mb-2 font-bold">{t.finance.flow}</h3>
      <dl className="space-y-1">
        <Row label={t.finance.in} cents={flow.inCents} strong />
        {flow.inCashCents > 0 && <Row label={t.finance.inCash} cents={flow.inCashCents} sub />}
        {flow.inOtherCents > 0 && <Row label={t.finance.inOther} cents={flow.inOtherCents} sub />}
        <Row label={t.finance.out} cents={flow.outCents} minus strong />
        {outs
          .filter(([, cents]) => cents > 0)
          .map(([label, cents]) => (
            <Row key={label} label={label} cents={cents} sub />
          ))}
        <div className="border-t border-slate-200 pt-1">
          <Row label={t.finance.balance} cents={flow.balanceCents} strong />
        </div>
      </dl>
      <p className="mt-2 text-sm text-slate-600">{t.finance.flowNote}</p>
    </Card>
  );
}

/** Sales − returns − cost of the goods sold = estimated gross profit; − expenses = estimated result. */
export function ResultCard({ result }: { result: Finance['result'] }) {
  const { profit } = result;
  const margin = marginBp(profit);
  return (
    <Card>
      <h3 className="mb-2 font-bold">{t.finance.result}</h3>
      {result.resultCents === undefined ? (
        <p className="text-slate-600">{t.finance.noCost}</p>
      ) : (
        <dl className="space-y-1">
          <Row label={t.finance.resultSales} cents={result.soldCents} />
          {result.returnsCents > 0 && <Row label={t.finance.resultReturns} cents={result.returnsCents} minus />}
          {profit.unknownRevenueCents !== 0 && <Row label={t.finance.resultNoCost} cents={profit.unknownRevenueCents} minus />}
          <Row label={t.finance.resultCost} cents={profit.costCents} minus />
          <div className="border-t border-slate-200 pt-1">
            <Row label={t.finance.grossProfit} cents={profit.profitCents} strong />
            {margin !== undefined && <p className="text-right text-sm text-slate-600">{t.finance.margin(formatMargin(margin))}</p>}
          </div>
          <Row label={t.finance.resultExpenses} cents={result.expensesCents} minus />
          <div className="border-t border-slate-200 pt-1">
            <Row label={t.finance.resultTotal} cents={result.resultCents} strong />
          </div>
        </dl>
      )}
      {profit.unknownLines > 0 && <p className="mt-2 text-sm font-medium text-amber-800">{t.today.profitMissing(profit.unknownLines)}</p>}
      <p className="mt-2 text-sm text-slate-600">{t.finance.resultNote}</p>
    </Card>
  );
}
