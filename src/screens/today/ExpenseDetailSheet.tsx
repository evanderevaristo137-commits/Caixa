import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Field, Money, Sheet } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { saveFailedText } from '../../lib/save-error';

/** One money-out record, and voiding it (with a reason and the owner code, when set). */
export function ExpenseDetailSheet({ expenseId, onClose }: { expenseId: string; onClose: () => void }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const expense = useLiveQuery(() => store.db.expenses.get(expenseId), [store, expenseId]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!expense) return null;

  const confirmVoid = async () => {
    if (reason.trim().length < 3) return setError(t.products.reasonRequired);
    await guard(async () => {
      try {
        await store.expenses.void(expense.id, reason);
        showToast(t.expenses.voided);
        setVoiding(false);
      } catch (e) {
        setError(e instanceof DomainError && e.code === 'inss_used' ? t.inss.usedError : saveFailedText(e));
      }
    });
  };

  return (
    <Sheet title={t.expenses.categories[expense.category]} onClose={onClose}>
      <Money
        cents={expense.amountCents}
        className={`block text-3xl font-extrabold ${expense.voidedAt ? 'text-slate-400 line-through' : ''}`}
      />
      <p className="mt-1 text-slate-600">
        {formatDateTime(expense.createdAt)} · {expense.fromCash ? t.expenses.paidFromCash : t.expenses.paidOtherwise}
      </p>
      {expense.note && <p className="mt-2">{expense.note}</p>}
      {expense.voidedAt ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-800">
          {t.expenses.voidedInfo(formatDateTime(expense.voidedAt), expense.voidReason ?? '')}
        </p>
      ) : voiding ? (
        <div className="mt-4 space-y-3 rounded-xl bg-white p-3">
          <p className="font-bold">{t.expenses.voidTitle}</p>
          <div className="flex flex-wrap gap-2">
            {t.expenses.voidReasons.map((r) => (
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
            <Button variant="secondary" onClick={() => setVoiding(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="dangerSolid" className="flex-1" onClick={() => void confirmVoid()}>
              {t.expenses.voidConfirm}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" className="mt-4 w-full" onClick={() => setVoiding(true)}>
          {t.expenses.void}
        </Button>
      )}
    </Sheet>
  );
}
