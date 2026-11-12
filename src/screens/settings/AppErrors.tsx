import { useState } from 'react';
import { errorsSince, readErrors } from '../../lib/error-log';
import { addDays } from '../../lib/dates';
import { formatDateTime } from '../../lib/dates';
import { t } from '../../i18n/pt-AO';
import { Button } from '../../ui/kit';

/** How many errors the app had in the last 7 days, and the list (kept only on this phone). */
export function AppErrors() {
  const [errors] = useState(readErrors);
  const [open, setOpen] = useState(false);
  const recent = errorsSince(errors, addDays(new Date(), -7));
  return (
    <div className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">
      <p className="font-semibold">{recent === 0 ? t.appErrors.none : t.appErrors.some(recent)}</p>
      <p>{t.appErrors.hint}</p>
      {errors.length > 0 && (
        <>
          <Button variant="ghost" className="mt-1 w-full" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t.appErrors.hide : t.appErrors.show}
          </Button>
          {open && (
            <ul className="mt-1 space-y-1">
              {errors.map((e, i) => (
                <li key={i} className="break-words">
                  <span className="font-semibold tabular-nums">{formatDateTime(e.at)}</span> · {t.appErrors.where[e.where]} · {e.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
