import { useEffect, useRef, useState } from 'react';
import { estimatePension, monthlyCents, dailyCents, statusLine } from '../../domain/inss';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Card, Money, Sheet, Skeleton } from '../../ui/kit';
import { InssEstimate } from './InssEstimate';
import { InssGuide } from './InssGuide';
import { InssHistory } from './InssHistory';
import { InssPaySheet } from './InssPaySheet';
import { InssPlanForm } from './InssPlanForm';
import { InssSaveSheet } from './InssSaveSheet';
import { useInss } from './use-inss';

export const TONES = { ok: 'text-brand-800', due: 'text-amber-800', late: 'text-red-700' } as const;

/**
 * The owner's retirement through the INSS: how much to pay and what it gives, money set aside,
 * payments recorded and how to enrol. The app keeps the record; the money is always paid to the INSS.
 */
export function InssSheet({ onClose }: { onClose: () => void }) {
  const data = useInss();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<'none' | 'save' | 'pay'>('none');
  const plan = data?.plan;
  const status = data?.status;
  const monthly = plan ? monthlyCents(plan) : 0;
  const showForm = !plan || !status || editing;
  // Going from the form to the summary (or back) starts at the top, not where the other one was scrolled to.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [showForm]);

  return (
    <Sheet title={t.inss.title} onClose={onClose}>
      <div ref={top} />
      {!data ? (
        <Skeleton rows={3} />
      ) : !plan || !status || editing ? (
        <InssPlanForm plan={plan} paidMonths={status?.paidMonths ?? 0} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-3">
          <Card>
            <h3 className="font-bold">{t.inss.savedTitle}</h3>
            <Money cents={data.savedCents} className="block text-3xl font-extrabold" />
            <p className="text-sm text-slate-600">{t.inss.savedOf(formatKz(monthly))}</p>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (data.savedCents / monthly) * 100)}%` }} />
            </div>
            <p className="mt-2 text-slate-700">
              {data.savedCents >= monthly
                ? t.inss.savedEnough
                : `${t.inss.savedMissing(formatKz(monthly - data.savedCents))} ${t.inss.daily(formatKz(dailyCents(monthly)))}`}
            </p>
            <p className={`mt-2 font-semibold ${TONES[statusLine(status).tone]}`}>{statusLine(status).text}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="px-2 text-sm leading-tight" onClick={() => setOpen('save')}>
                {t.inss.save}
              </Button>
              <Button variant="secondary" className="px-2 text-sm leading-tight" onClick={() => setOpen('pay')}>
                {t.inss.pay}
              </Button>
            </div>
          </Card>
          <Card className="bg-brand-50">
            <InssEstimate plan={plan} estimate={estimatePension(plan, status.paidMonths, data.now)} />
          </Card>
          <InssHistory plan={plan} status={status} contributions={data.contributions} />
          <InssGuide />
          <Button variant="ghost" className="w-full" onClick={() => setEditing(true)}>
            {t.inss.editPlan}
          </Button>
        </div>
      )}
      {plan && open === 'save' && <InssSaveSheet monthlyCents={monthly} savedCents={data.savedCents} onClose={() => setOpen('none')} />}
      {plan && status && open === 'pay' && (
        <InssPaySheet
          monthlyCents={monthly}
          savedCents={data.savedCents}
          nextMonth={status.nextMonth}
          contributions={data.contributions}
          onClose={() => setOpen('none')}
        />
      )}
    </Sheet>
  );
}
