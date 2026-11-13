import { useState } from 'react';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { estimatePension, INSS_RULES, monthOf, validatePlan } from '../../domain/inss';
import type { InssModality, InssPlan } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Field } from '../../ui/kit';
import { useConfirm } from '../../ui/confirm';
import { InssEstimate } from './InssEstimate';
import { InssGuide } from './InssGuide';

const WAGE_CHIPS = [1, 2, 3];
const MODALITIES: InssModality[] = ['normal', 'extended'];

const chip = (selected: boolean) =>
  `min-h-12 rounded-xl border-2 px-2 text-sm font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/** The simulator and the owner's plan in one form: the estimate follows what is chosen. */
export function InssPlanForm({ plan, paidMonths, onDone }: { plan?: InssPlan; paidMonths: number; onDone: () => void }) {
  const { store, showToast } = useApp();
  const [dialog, ask] = useConfirm();
  const [wages, setWages] = useState(plan?.wages ?? 1);
  const [custom, setCustom] = useState(plan ? !WAGE_CHIPS.includes(plan.wages) : false);
  const [other, setOther] = useState(plan && !WAGE_CHIPS.includes(plan.wages) ? String(plan.wages) : '');
  const [modality, setModality] = useState<InssModality>(plan?.modality ?? 'normal');
  const [birthYear, setBirthYear] = useState(plan?.birthYear ? String(plan.birthYear) : '');
  const [monthsBefore, setMonthsBefore] = useState(plan?.monthsBefore ? String(plan.monthsBefore) : '');
  const [number, setNumber] = useState(plan?.number ?? '');
  const [error, setError] = useState<{ field: 'wages' | 'birth' | 'months'; msg: string } | null>(null);

  const now = new Date();
  const chosenWages = custom ? (/^\d{1,2}$/.test(other.trim()) ? Number(other) : NaN) : wages;
  const year = /^\d{4}$/.test(birthYear.trim()) ? Number(birthYear) : undefined;
  const before = monthsBefore.trim() === '' ? 0 : /^\d{1,3}$/.test(monthsBefore.trim()) ? Number(monthsBefore) : NaN;
  // The estimate follows what is typed, as soon as it makes sense.
  const draft: InssPlan = {
    wages: chosenWages,
    modality,
    startMonth: plan?.startMonth ?? monthOf(now),
    birthYear: year,
    monthsBefore: Number.isNaN(before) ? 0 : before,
  };
  const valid = validatePlan(draft, now) === null;

  const save = async () => {
    if (birthYear.trim() !== '' && year === undefined) return setError({ field: 'birth', msg: t.inss.invalidBirthYear });
    if (Number.isNaN(before)) return setError({ field: 'months', msg: t.inss.invalidMonths });
    try {
      await store.inss.savePlan({ wages: chosenWages, modality, birthYear: year, monthsBefore: before, number });
      showToast(plan ? t.inss.planSaved : t.inss.started);
      onDone();
    } catch (e) {
      const code = e instanceof DomainError ? e.code : '';
      if (code === 'invalid_birth_year') setError({ field: 'birth', msg: t.inss.invalidBirthYear });
      else if (code === 'invalid_months') setError({ field: 'months', msg: t.inss.invalidMonths });
      else setError({ field: 'wages', msg: code === 'invalid_wages' ? t.inss.invalidWages : t.errors.saveFailed });
    }
  };

  const stop = async () => {
    const ok = await ask({ title: t.inss.stopConfirm, message: t.inss.stopConfirmNote, confirmLabel: t.inss.stopYes });
    if (!ok) return;
    await store.inss.savePlan(null);
    showToast(t.inss.stopped);
    onDone();
  };

  const err = (f: 'wages' | 'birth' | 'months') => (error?.field === f ? error.msg : null);
  return (
    <div className="space-y-4">
      {!plan && t.inss.intro.map((line) => <p key={line}>{line}</p>)}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">{t.inss.wagesTitle}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.inss.wagesTitle}>
          {WAGE_CHIPS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={!custom && wages === n}
              onClick={() => {
                setWages(n);
                setCustom(false);
                setError(null);
              }}
              className={chip(!custom && wages === n)}
            >
              {t.inss.wages(n)}
            </button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={chip(custom)}>
            {t.inss.wagesOther}
          </button>
        </div>
        {custom && (
          <div className="mt-2">
            <Field
              label={t.inss.wagesOtherLabel}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              inputMode="numeric"
              error={err('wages')}
            />
          </div>
        )}
        {!custom && err('wages') && <p className="mt-1 text-sm font-medium text-red-700">{err('wages')}</p>}
        <p className="mt-2 text-sm text-slate-600">{t.inss.wagesHint(formatKz(INSS_RULES.minimumWageCents))}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">{t.inss.modalityTitle}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.inss.modalityTitle}>
          {MODALITIES.map((m) => (
            <button key={m} type="button" aria-pressed={modality === m} onClick={() => setModality(m)} className={chip(modality === m)}>
              {t.inss.modalities[m]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">{t.inss.modalityHints[modality]}</p>
      </div>
      <Field
        label={t.inss.birthYear}
        value={birthYear}
        onChange={(e) => setBirthYear(e.target.value)}
        inputMode="numeric"
        maxLength={4}
        hint={t.inss.birthYearHint}
        error={err('birth')}
      />
      {valid && (
        <div className="rounded-2xl bg-brand-50 p-3">
          <InssEstimate plan={draft} estimate={estimatePension(draft, paidMonths, now)} />
        </div>
      )}
      <details className="rounded-xl bg-white p-3" open={!!plan?.monthsBefore || !!plan?.number || err('months') !== null}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.inss.alreadyEnrolled}</summary>
        <div className="mt-2 space-y-3">
          <Field
            label={t.inss.monthsBefore}
            value={monthsBefore}
            onChange={(e) => setMonthsBefore(e.target.value)}
            inputMode="numeric"
            error={err('months')}
          />
          <Field
            label={t.inss.number}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            autoComplete="off"
            hint={t.inss.numberHint}
          />
        </div>
      </details>
      <Button big className="w-full" onClick={() => void save()}>
        {plan ? t.inss.savePlan : t.inss.start}
      </Button>
      {plan ? (
        <>
          <Button variant="secondary" className="w-full" onClick={onDone}>
            {t.inss.cancelEdit}
          </Button>
          <Button variant="danger" className="w-full" onClick={() => void stop()}>
            {t.inss.stop}
          </Button>
        </>
      ) : (
        <InssGuide />
      )}
      {dialog}
    </div>
  );
}
