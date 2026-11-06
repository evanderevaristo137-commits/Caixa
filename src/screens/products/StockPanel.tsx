import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import type { Product, StockMovementType } from '../../domain/types';
import { reasonsList, t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Field } from '../../ui/kit';

const ERRORS: Record<string, string> = {
  not_whole: t.products.invalidNumber,
  not_positive: t.products.invalidNumber,
  reason_required: t.products.reasonRequired,
  no_change: t.products.noChange,
};

const MV_LABEL: Record<StockMovementType, string> = {
  sale: t.products.mvSale,
  entry: t.products.mvEntry,
  adjustment: t.products.mvAdjust,
  void: t.products.mvVoid,
};

/** Stock entries, adjustments (with reason) and the movement history of one product. */
export function StockPanel({ product }: { product: Product }) {
  const { store, showToast } = useApp();
  const movements = useLiveQuery(() => store.products.movements(product.id), [store, product.id]);
  const [mode, setMode] = useState<'none' | 'entry' | 'adjust'>('none');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
    if (Number.isNaN(n)) return setError(t.products.invalidNumber);
    try {
      if (mode === 'entry') await store.products.addEntry(product.id, n);
      else await store.products.adjust(product.id, n, reason);
      setMode('none');
      setQty('');
      setReason('');
      setError(null);
      showToast(t.settings.saved);
    } catch (e) {
      setError(e instanceof DomainError ? (ERRORS[e.code] ?? e.code) : String(e));
    }
  };

  return (
    <div className="mt-6">
      <p className="mb-2 text-center text-2xl font-extrabold">{t.products.inStock(product.stock)}</p>
      {mode === 'none' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setMode('entry')}>+ {t.products.entry}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setQty(String(Math.max(0, product.stock)));
              setMode('adjust');
            }}
          >
            {t.products.adjust}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl bg-white p-3">
          <Field
            label={mode === 'entry' ? t.products.entryQty : t.products.adjustQty}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            error={error}
            autoFocus
          />
          {mode === 'adjust' && (
            <>
              <div className="flex flex-wrap gap-2">
                {reasonsList.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    aria-pressed={reason === r}
                    className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${reason === r ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Field label={t.products.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
            </>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setMode('none');
                setError(null);
              }}
            >
              {t.common.cancel}
            </Button>
            <Button className="flex-1" onClick={() => void submit()}>
              {t.common.confirm}
            </Button>
          </div>
        </div>
      )}

      <h3 className="mt-5 mb-2 font-bold">{t.products.movements}</h3>
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white">
        {(movements ?? []).slice(0, 50).map((m) => (
          <li key={m.id} className="flex justify-between gap-2 p-3 text-sm">
            <span className="min-w-0">
              <span className="font-semibold">{MV_LABEL[m.type]}</span>
              {m.reason ? ` · ${m.reason}` : ''}
              <span className="block text-slate-500">{formatDateTime(m.createdAt)}</span>
            </span>
            <span className={`font-bold tabular-nums ${m.delta < 0 ? 'text-red-700' : 'text-brand-700'}`}>
              {m.delta > 0 ? `+${m.delta}` : m.delta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
