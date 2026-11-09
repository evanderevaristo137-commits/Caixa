import { formatQuantity } from '../../domain/quantity';
import type { CountSummary } from '../../domain/stock-count';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Card } from '../../ui/kit';

const signed = (n: number, text: string) => `${n < 0 ? '−' : '+'}${text}`;

/** The differences found by a stock count, before the stock is changed. */
export function CountReview({
  summary,
  busy,
  onApply,
  onBack,
}: {
  summary: CountSummary;
  busy: boolean;
  onApply: () => void;
  onBack: () => void;
}) {
  const sc = t.stockCount;
  const changes = summary.differences.length > 0;
  return (
    <div className="space-y-3">
      <Card>
        <p className="text-lg font-semibold">{sc.summary(summary.counted, summary.differences.length)}</p>
        {!changes && <p className="mt-1 text-brand-800">{sc.allGood}</p>}
        {summary.missingCents > 0 && <p className="mt-1 font-semibold text-red-800">{sc.missing(formatKz(summary.missingCents))}</p>}
        {summary.surplusCents > 0 && <p className="mt-1 font-semibold text-slate-800">{sc.surplus(formatKz(summary.surplusCents))}</p>}
        {summary.withoutCost > 0 && <p className="mt-1 text-sm text-slate-600">{sc.withoutCost(summary.withoutCost)}</p>}
      </Card>
      {changes && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {summary.differences.map((d) => (
              <li key={d.product.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.product.name}</p>
                  <p className="text-sm text-slate-600 tabular-nums">
                    {sc.line(formatQuantity(d.expected, d.product.soldBy), formatQuantity(d.counted, d.product.soldBy))}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className={`font-bold ${d.delta < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                    {signed(d.delta, formatQuantity(Math.abs(d.delta), d.product.soldBy))}
                  </p>
                  {d.valueCents !== undefined && (
                    <p className="text-sm text-slate-600">{signed(d.valueCents, formatKz(Math.abs(d.valueCents)))}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-sm text-slate-600">{sc.untouched}</p>
      <Button big className="w-full" disabled={busy} onClick={onApply}>
        {busy ? sc.applying : changes ? sc.apply : sc.finish}
      </Button>
      <Button variant="secondary" className="w-full" disabled={busy} onClick={onBack}>
        {sc.back}
      </Button>
    </div>
  );
}
