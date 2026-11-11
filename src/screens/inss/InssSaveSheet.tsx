import { useState } from 'react';
import { useApp } from '../../app/context';
import { dailyCents } from '../../domain/inss';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Sheet } from '../../ui/kit';

const typed = (cents: number) => formatKz(cents).replace(' Kz', '');

/** Puts money aside for the INSS: an outflow that is not an expense. */
export function InssSaveSheet({ monthlyCents, savedCents, onClose }: { monthlyCents: number; savedCents: number; onClose: () => void }) {
  const { store, showToast } = useApp();
  const daily = dailyCents(monthlyCents);
  const missing = Math.max(0, monthlyCents - savedCents);
  const [amount, setAmount] = useState(typed(missing > 0 ? Math.min(daily, missing) : daily));
  const [fromCash, setFromCash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amountCents = parseKz(amount);
    if (amountCents === null || amountCents <= 0) return setError(t.expenses.invalidAmount);
    setBusy(true);
    try {
      await store.expenses.create({ category: 'inss', amountCents, fromCash });
      showToast(t.inss.saveDone);
      onClose();
    } catch {
      setError(t.errors.saveFailed);
      setBusy(false);
    }
  };

  const chip = (selected: boolean) =>
    `min-h-12 rounded-xl border-2 px-2 text-sm font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;
  const quick = [...new Set([daily, 50_000, 100_000])];
  return (
    <Sheet title={t.inss.save} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t.inss.saveAmount} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" error={error} />
        <div className="flex flex-wrap gap-2">
          {quick.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAmount(typed(c))}
              className="min-h-11 rounded-full border-2 border-slate-300 bg-white px-3 text-sm font-semibold active:bg-slate-100"
            >
              {formatKz(c)}
            </button>
          ))}
          {missing > 0 && (
            <button
              type="button"
              onClick={() => setAmount(typed(missing))}
              className="min-h-11 rounded-full border-2 border-slate-300 bg-white px-3 text-sm font-semibold active:bg-slate-100"
            >
              {t.inss.missingChip(formatKz(missing))}
            </button>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t.expenses.paidWith}</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.expenses.paidWith}>
            <button type="button" aria-pressed={fromCash} onClick={() => setFromCash(true)} className={chip(fromCash)}>
              {t.expenses.fromCash}
            </button>
            <button type="button" aria-pressed={!fromCash} onClick={() => setFromCash(false)} className={chip(!fromCash)}>
              {t.expenses.notFromCash}
            </button>
          </div>
        </div>
        <p className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">{t.inss.saveHint}</p>
        <Button big className="w-full" disabled={busy} onClick={() => void save()}>
          {t.inss.save}
        </Button>
      </div>
    </Sheet>
  );
}
