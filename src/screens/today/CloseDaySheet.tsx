import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { closeResult } from '../../domain/cash';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Money, Sheet } from '../../ui/kit';

const kzText = (cents: number) => formatKz(cents).replace(' Kz', '');

/** End of the day: count the cash, compare with what the till should have, and record it. */
export function CloseDaySheet({ defaultFloatCents, onClose }: { defaultFloatCents: number; onClose: () => void }) {
  const { store, showToast } = useApp();
  const [float, setFloat] = useState(defaultFloatCents ? kzText(defaultFloatCents) : '');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<{ field: 'float' | 'counted'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const floatCents = float.trim() === '' ? 0 : parseKz(float);
  const drawer = useLiveQuery(() => store.cash.drawer(new Date(), floatCents ?? 0), [store, floatCents]);
  const countedCents = counted.trim() === '' ? null : parseKz(counted);
  const result = drawer && countedCents !== null ? closeResult(drawer.expectedCents, countedCents) : null;

  const confirm = async () => {
    if (floatCents === null) return setError({ field: 'float', msg: t.cash.floatInvalid });
    if (countedCents === null) return setError({ field: 'counted', msg: t.cash.countInvalid });
    setBusy(true);
    try {
      await store.cash.close({ floatCents, countedCents, note });
      showToast(t.cash.closed);
      onClose();
    } catch {
      setError({ field: 'counted', msg: t.errors.saveFailed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={t.cash.closeDay} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-white p-3">
          <p className="text-sm font-semibold text-slate-600">{t.cash.shouldHave}</p>
          <Money cents={drawer?.expectedCents ?? 0} className="block text-3xl font-extrabold" />
          {drawer && (
            <dl className="mt-2 space-y-0.5 text-sm text-slate-700">
              {drawer.floatCents > 0 && <Row label={t.cash.float} cents={drawer.floatCents} />}
              <Row label={t.cash.sales} cents={drawer.cashSalesCents} />
              {drawer.cashCreditPaymentsCents > 0 && <Row label={t.cash.creditPaid} cents={drawer.cashCreditPaymentsCents} />}
              {drawer.cashOutCents > 0 && <Row label={t.cash.out} cents={-drawer.cashOutCents} />}
              {drawer.cashPurchasesCents > 0 && <Row label={t.cash.purchases} cents={-drawer.cashPurchasesCents} />}
            </dl>
          )}
        </div>
        <Field
          label={t.cash.floatLabel}
          value={float}
          onChange={(e) => setFloat(e.target.value)}
          inputMode="decimal"
          error={error?.field === 'float' ? error.msg : null}
        />
        <Field
          label={t.cash.counted}
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          inputMode="decimal"
          error={error?.field === 'counted' ? error.msg : null}
        />
        {result && (
          <p
            role="status"
            className={`rounded-xl p-3 text-lg font-bold ${result.state === 'exact' ? 'bg-brand-50 text-brand-800' : result.state === 'over' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}
          >
            {result.state === 'exact'
              ? t.cash.exact
              : result.state === 'over'
                ? t.cash.over(formatKz(result.differenceCents))
                : t.cash.short(formatKz(-result.differenceCents))}
          </p>
        )}
        <Field label={t.cash.note} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        <p className="text-sm text-slate-600">{t.cash.closeAgainHint}</p>
        <Button big className="w-full" disabled={busy} onClick={() => void confirm()}>
          {t.cash.confirmClose}
        </Button>
      </div>
    </Sheet>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">
        {cents < 0 ? '− ' : ''}
        {formatKz(Math.abs(cents))}
      </dd>
    </div>
  );
}
