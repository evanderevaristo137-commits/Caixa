import { baseCents, dailyCents, monthlyCents, pensionCents, type PensionEstimate } from '../../domain/inss';
import type { InssPlan } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';

const YEARS = [15, 20, 25, 35];

/** What the owner pays and the pension it gives: the personal estimate (with a year of birth) and a table by years paid. */
export function InssEstimate({ plan, estimate }: { plan: Pick<InssPlan, 'wages' | 'modality'>; estimate: PensionEstimate | null }) {
  const monthly = monthlyCents(plan);
  const base = baseCents(plan);
  const pension = estimate ? formatKz(estimate.pensionCents) : '';
  return (
    <div className="space-y-2">
      <p className="text-lg font-bold text-brand-800">{t.inss.youPay(formatKz(monthly), formatKz(dailyCents(monthly)))}</p>
      {!estimate ? (
        <p className="text-slate-700">{t.inss.askBirthYear}</p>
      ) : estimate.monthsToPay === 0 ? (
        <p className="text-slate-800">{t.inss.ready(pension)}</p>
      ) : (
        <>
          <p className="text-slate-800">
            {estimate.late ? t.inss.late(estimate.retireAge, pension) : t.inss.youGet(estimate.retireAge, pension)}
          </p>
          <p className="text-sm text-slate-700">
            {t.inss.payback(formatKz(estimate.totalToPayCents), t.inss.duration(estimate.paybackMonths))}
          </p>
        </>
      )}
      <details className="rounded-xl bg-white p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.inss.tableTitle}</summary>
        <table className="mt-1 w-full text-left">
          <tbody className="divide-y divide-slate-100">
            {YEARS.map((years) => (
              <tr key={years}>
                <th scope="row" className="py-2 font-normal">
                  {t.inss.tableYears(years)}
                </th>
                <td className="py-2 text-right font-semibold tabular-nums">{t.inss.perMonth(formatKz(pensionCents(base, years * 12)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="text-sm text-slate-600">{t.inss.estimateNote}</p>
    </div>
  );
}
