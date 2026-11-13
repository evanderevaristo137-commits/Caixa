import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { parseKz } from '../../lib/money';
import { Button, Field, Sheet } from '../../ui/kit';
import { saveFailedText } from '../../lib/save-error';

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000];

/** Records money going out: an expense (transport, rent, generator…) or the owner's withdrawal. */
export function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const { store, showToast } = useApp();
  // Setting money aside for the INSS is only offered to those who follow it in the app.
  const withInss = useLiveQuery(() => store.settings.get().then((x) => !!x.inss), [store]);
  const categories = EXPENSE_CATEGORIES.filter((c) => c !== 'inss' || withInss);
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [fromCash, setFromCash] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<{ field: 'category' | 'amount'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!category) return setError({ field: 'category', msg: t.expenses.pickCategory });
    const amountCents = parseKz(amount);
    if (amountCents === null || amountCents <= 0) return setError({ field: 'amount', msg: t.expenses.invalidAmount });
    setBusy(true);
    try {
      await store.expenses.create({ category, amountCents, fromCash, note });
      showToast(t.expenses.saved);
      onClose();
    } catch (e) {
      setError({
        field: 'amount',
        msg: e instanceof DomainError && e.code === 'invalid_amount' ? t.expenses.invalidAmount : saveFailedText(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const chip = (selected: boolean) =>
    `min-h-12 rounded-xl border-2 px-2 text-sm font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

  return (
    <Sheet title={t.expenses.title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t.expenses.category}</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.expenses.category}>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => {
                  setCategory(c);
                  setError(null);
                }}
                className={chip(category === c)}
              >
                {t.expenses.categories[c]}
              </button>
            ))}
          </div>
          {error?.field === 'category' && <p className="mt-1 text-sm font-medium text-red-700">{error.msg}</p>}
          {(category === 'withdrawal' || category === 'inss') && (
            <p className="mt-2 rounded-lg bg-slate-100 p-2 text-sm text-slate-700">
              {category === 'inss' ? t.expenses.inssHint : t.expenses.withdrawalHint}
            </p>
          )}
        </div>
        <Field
          label={t.expenses.amount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          error={error?.field === 'amount' ? error.msg : null}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAmount(String(c / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.'))}
              className="min-h-11 rounded-full border-2 border-slate-300 bg-white px-3 text-sm font-semibold active:bg-slate-100"
            >
              {String(c / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} Kz
            </button>
          ))}
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
        <Field label={t.expenses.note} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        <Button big className="w-full" disabled={busy} onClick={() => void save()}>
          {t.expenses.save}
        </Button>
      </div>
    </Sheet>
  );
}
