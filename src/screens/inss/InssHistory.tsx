import { useState } from 'react';
import { useApp } from '../../app/context';
import { INSS_RULES, monthLong, type InssStatus } from '../../domain/inss';
import type { InssContribution, InssPlan } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatDateString } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Button, Card, Field } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { saveFailedText } from '../../lib/save-error';

/** Payments listed at first (a year); the rest opens with a tap. */
const RECENT = 12;

/** Months paid so far, how many in a row, what is missing for a pension, and the list of payments. */
export function InssHistory({ plan, status, contributions }: { plan: InssPlan; status: InssStatus; contributions: InssContribution[] }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const [showAll, setShowAll] = useState(false);
  const [voiding, setVoiding] = useState<InssContribution | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmVoid = async () => {
    if (!voiding) return;
    if (reason.trim().length < 3) return setError(t.products.reasonRequired);
    await guard(async () => {
      try {
        await store.inss.void(voiding.id, reason);
        showToast(t.inss.voided);
        setVoiding(null);
        setReason('');
      } catch (e) {
        setError(saveFailedText(e));
      }
    });
  };

  return (
    <Card>
      <h3 className="font-bold">{t.inss.historyTitle}</h3>
      <p className="mt-1 text-lg font-semibold">
        {t.inss.months(status.totalMonths)}
        {status.streak > 1 && <span className="text-brand-800"> · {t.inss.streak(status.streak)}</span>}
      </p>
      {!!plan.monthsBefore && <p className="text-sm text-slate-600">{t.inss.before(plan.monthsBefore)}</p>}
      <div className="mt-2 h-2 rounded-full bg-slate-100" role="img" aria-label={`${status.totalMonths} / ${INSS_RULES.minimumMonths}`}>
        <div
          className="h-2 rounded-full bg-brand-600"
          style={{ width: `${Math.min(100, (status.totalMonths / INSS_RULES.minimumMonths) * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-sm text-slate-700">
        {status.monthsToMinimum > 0 ? t.inss.toMinimum(t.inss.duration(status.monthsToMinimum)) : t.inss.hasMinimum}
      </p>
      {contributions.length === 0 ? (
        <p className="mt-3 text-slate-600">{t.inss.historyEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {(showAll ? contributions : contributions.slice(0, RECENT)).map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <div className={`min-w-0 flex-1 ${c.voidedAt ? 'text-slate-400 line-through' : ''}`}>
                <p className="font-semibold">
                  {monthLong(c.month)} · <span className="whitespace-nowrap tabular-nums">{formatKz(c.amountCents)}</span>
                </p>
                <p className="text-sm text-slate-600 tabular-nums">
                  {t.inss.paidOn(formatDateString(c.paidOn))}
                  {c.receipt && ` · ${t.inss.receipt(c.receipt)}`}
                </p>
              </div>
              {c.voidedAt ? (
                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-800">{t.inss.voidedTag}</span>
              ) : (
                <Button
                  variant="ghost"
                  className="px-2 text-sm"
                  aria-label={`${t.inss.void}: ${monthLong(c.month)}`}
                  onClick={() => {
                    setVoiding(c);
                    setError(null);
                  }}
                >
                  {t.inss.void}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!showAll && contributions.length > RECENT && (
        <Button variant="ghost" className="w-full text-sm" onClick={() => setShowAll(true)}>
          {t.inss.showAll(contributions.length)}
        </Button>
      )}
      {voiding && (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
          <p className="font-bold">{t.inss.voidTitle(monthLong(voiding.month))}</p>
          <div className="flex flex-wrap gap-2">
            {t.inss.voidReasons.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
                className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${reason === r ? 'border-red-700 bg-red-700 text-white' : 'border-slate-300 bg-white'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Field label={t.sale.voidReason} value={reason} onChange={(e) => setReason(e.target.value)} error={error} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setVoiding(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="dangerSolid" className="flex-1" onClick={() => void confirmVoid()}>
              {t.inss.voidConfirm}
            </Button>
          </div>
        </div>
      )}
      <p className="mt-3 text-sm text-slate-600">{t.inss.ownRecord}</p>
    </Card>
  );
}
