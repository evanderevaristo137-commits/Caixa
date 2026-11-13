import { useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { addMonths, monthLong, monthOf } from '../../domain/inss';
import type { InssContribution } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { toLocalDateString } from '../../lib/dates';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Sheet } from '../../ui/kit';
import { saveFailedText } from '../../lib/save-error';

/** How many months back a payment can be recorded for. */
const MONTHS_BACK = 24;

/** Records a contribution paid to the INSS: the month, the amount, the receipt and where the money came from. */
export function InssPaySheet({
  monthlyCents,
  savedCents,
  nextMonth,
  contributions,
  onClose,
}: {
  monthlyCents: number;
  savedCents: number;
  nextMonth: string;
  contributions: Pick<InssContribution, 'month' | 'voidedAt'>[];
  onClose: () => void;
}) {
  const { store, showToast } = useApp();
  const today = toLocalDateString(new Date());
  // The months not yet recorded, most recent first.
  const months = useMemo(() => {
    const paid = new Set(contributions.filter((c) => !c.voidedAt).map((c) => c.month));
    const current = monthOf(new Date());
    return Array.from({ length: MONTHS_BACK }, (_, i) => addMonths(current, -i)).filter((m) => !paid.has(m));
  }, [contributions]);
  const [month, setMonth] = useState(months.includes(nextMonth) ? nextMonth : (months[0] ?? ''));
  const [amount, setAmount] = useState(formatKz(monthlyCents).replace(' Kz', ''));
  const [receipt, setReceipt] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [useSaved, setUseSaved] = useState(savedCents > 0);
  const [fromCash, setFromCash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountCents = parseKz(amount) ?? 0;
  const fromSavedCents = useSaved ? Math.min(savedCents, amountCents) : 0;
  const rest = amountCents - fromSavedCents;

  const save = async () => {
    if (amountCents <= 0) return setError(t.inss.payErrors.invalid_amount!);
    setBusy(true);
    try {
      await store.inss.pay({ month, amountCents, receipt, paidOn, fromSavedCents, fromCashCents: fromCash ? rest : 0 });
      showToast(t.inss.payDone);
      onClose();
    } catch (e) {
      setError((e instanceof DomainError && t.inss.payErrors[e.code]) || saveFailedText(e));
      setBusy(false);
    }
  };

  const check = 'flex min-h-12 items-center gap-3 rounded-xl bg-white px-3 py-2';
  return (
    <Sheet title={t.inss.payTitle} onClose={onClose}>
      {months.length === 0 ? (
        <p className="rounded-xl bg-white p-3 text-slate-700">{t.inss.payNothing}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">{t.inss.payIntro}</p>
          <div>
            <label htmlFor="inss-month" className="mb-1 block text-sm font-semibold text-slate-700">
              {t.inss.payMonth}
            </label>
            <select
              id="inss-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLong(m)}
                </option>
              ))}
            </select>
          </div>
          <Field label={t.inss.payAmount} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" error={error} />
          <Field label={t.inss.payReceipt} value={receipt} onChange={(e) => setReceipt(e.target.value)} autoComplete="off" />
          <Field label={t.inss.payDate} type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          {amountCents > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t.inss.paySource}</p>
              {savedCents > 0 && (
                <label className={check}>
                  <input
                    type="checkbox"
                    className="h-6 w-6 accent-brand-700"
                    checked={useSaved}
                    onChange={(e) => setUseSaved(e.target.checked)}
                  />
                  <span>{t.inss.useSaved(formatKz(Math.min(savedCents, amountCents)))}</span>
                </label>
              )}
              {rest > 0 && (
                <label className={check}>
                  <input
                    type="checkbox"
                    className="h-6 w-6 accent-brand-700"
                    checked={fromCash}
                    onChange={(e) => setFromCash(e.target.checked)}
                  />
                  <span>{t.inss.fromCash(formatKz(rest))}</span>
                </label>
              )}
              <p className="text-sm text-slate-600">{t.inss.fromElsewhere}</p>
            </div>
          )}
          <Button big className="w-full" disabled={busy} onClick={() => void save()}>
            {t.inss.paySave}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
