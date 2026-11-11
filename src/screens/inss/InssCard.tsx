import { useState } from 'react';
import { monthlyCents, statusLine } from '../../domain/inss';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card } from '../../ui/kit';
import { InssSheet, TONES } from './InssSheet';
import { useInss } from './use-inss';

/**
 * Entry to "A minha reforma (INSS)", on Hoje and in Mais. With a plan: what is set aside and what is
 * due. Without one: a quiet invitation (contributing is the owner's choice).
 */
export function InssCard() {
  const data = useInss();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const { plan, status } = data;
  const monthly = plan ? monthlyCents(plan) : 0;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {plan && status ? (
          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{t.inss.title}</span>
              {status.streak > 1 && <span className="shrink-0 text-sm font-semibold text-brand-800">{t.inss.streak(status.streak)}</span>}
            </div>
            <p className="mt-1 text-slate-700 tabular-nums">{t.inss.todaySaved(formatKz(data.savedCents), formatKz(monthly))}</p>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (data.savedCents / monthly) * 100)}%` }} />
            </div>
            <p className={`mt-2 text-sm font-semibold ${TONES[statusLine(status).tone]}`}>{statusLine(status).text}</p>
          </Card>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4">
            <span className="block font-bold text-brand-800">{t.inss.title}</span>
            <span className="text-sm text-slate-700">{t.inss.invite}</span>
          </div>
        )}
      </button>
      {open && <InssSheet onClose={() => setOpen(false)} />}
    </>
  );
}
