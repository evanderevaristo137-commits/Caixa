import { useState } from 'react';
import { dueDateFromTerm } from '../../domain/credit';
import { t } from '../../i18n/pt-AO';
import { formatDateStringLong, isValidDateString, toLocalDateString } from '../../lib/dates';

const TERMS = [7, 15, 30, 'month_end'] as const;

/** "Pagar até quando?": quick terms, or any other date (never in the past). */
export function TermPicker({ value, onChange }: { value: string; onChange: (dueDate: string) => void }) {
  const now = new Date();
  const today = toLocalDateString(now);
  const matching = TERMS.find((term) => dueDateFromTerm(term, now) === value);
  const [other, setOther] = useState(matching === undefined);

  const chip = (selected: boolean) =>
    `min-h-12 rounded-xl border-2 px-2 text-base font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

  return (
    <div>
      <p className="mb-2 font-semibold">{t.sell.termTitle}</p>
      <div className="grid grid-cols-3 gap-2">
        {TERMS.map((term) => (
          <button
            key={term}
            type="button"
            aria-pressed={!other && matching === term}
            onClick={() => {
              setOther(false);
              onChange(dueDateFromTerm(term, now));
            }}
            className={chip(!other && matching === term)}
          >
            {term === 'month_end' ? t.sell.termMonthEnd : t.sell.terms[term]}
          </button>
        ))}
        <button type="button" aria-pressed={other} onClick={() => setOther(true)} className={`${chip(other)} col-span-2`}>
          {t.sell.termOther}
        </button>
      </div>
      {other && (
        <input
          type="date"
          min={today}
          value={value}
          aria-label={t.sell.termOther}
          onChange={(e) => isValidDateString(e.target.value) && e.target.value >= today && onChange(e.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        />
      )}
      <p className="mt-2 rounded-lg bg-amber-50 p-2 text-center font-semibold text-amber-900">
        {t.sell.payBy(formatDateStringLong(value))}
      </p>
    </div>
  );
}
