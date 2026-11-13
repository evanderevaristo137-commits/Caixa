import { NO_CATEGORY, type CategorySales } from '../../domain/categories';
import { shareBp } from '../../domain/reports';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card } from '../../ui/kit';

const pct = (bp: number) => `${Math.round(bp / 100)}%`;

/**
 * Sales of the period by category, with the estimated profit where the cost price is known. A
 * category whose products have subcategories opens (one tap) to show them.
 */
export function CategoryReport({ rows, totalCents }: { rows: CategorySales[]; totalCents: number }) {
  // Only useful once the shop has given categories to the products it sells.
  if (!rows.some((r) => r.category !== NO_CATEGORY)) return null;
  const max = Math.max(1, ...rows.map((r) => r.salesCents));
  const withProfit = rows.some((r) => r.costedSalesCents > 0);
  return (
    <Card>
      <h3 className="mb-2 font-bold">{t.categories.title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => {
          const line = <Line row={r} max={max} totalCents={totalCents} />;
          return (
            <li key={r.category}>
              {r.subs.length === 0 ? (
                line
              ) : (
                <details>
                  <summary className="cursor-pointer">
                    <div className="min-w-0 flex-1">{line}</div>
                  </summary>
                  <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3" aria-label={t.categories.subsOf(r.category)}>
                    {r.subs.map((s) => (
                      <li key={s.sub} className="flex justify-between gap-2 text-sm">
                        <span className="min-w-0 break-words">{s.sub === NO_CATEGORY ? t.categories.noSub : s.sub}</span>
                        <span className="shrink-0 text-right tabular-nums">
                          {formatKz(s.salesCents)} · {pct(shareBp(s.salesCents, r.salesCents))}
                          {s.costedSalesCents > 0 && (
                            <span className="block text-xs text-slate-600">{t.categories.profit(formatKz(s.profitCents))}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {withProfit && <p className="mt-2 text-sm text-slate-600">{t.categories.hintReports}</p>}
    </Card>
  );
}

function Line({ row: r, max, totalCents }: { row: CategorySales; max: number; totalCents: number }) {
  return (
    <>
      <div className="flex justify-between gap-2">
        <span className="min-w-0 break-words">{r.category === NO_CATEGORY ? t.categories.none : r.category}</span>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatKz(r.salesCents)} · {pct(shareBp(r.salesCents, totalCents))}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(r.salesCents / max) * 100}%` }} />
      </div>
      {r.costedSalesCents > 0 && (
        <p className="mt-0.5 text-right text-xs text-slate-600 tabular-nums">{t.categories.profit(formatKz(r.profitCents))}</p>
      )}
    </>
  );
}
