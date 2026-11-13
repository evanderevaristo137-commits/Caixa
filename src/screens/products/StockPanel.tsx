import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import type { Product, StockMovementType } from '../../domain/types';
import { reasonsList, t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Field } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { adjustmentDelta } from '../../domain/stock';
import { formatKg, formatQuantity, parseWeight } from '../../domain/quantity';
import { daysLeft, paceOf, speedFromMovements } from '../../domain/stock-insights';
import { useBusy } from '../../ui/use-busy';
import { ExpiryPanel } from './ExpiryPanel';
import { ShowMore, usePaged } from '../../ui/paged';
import { saveFailedText } from '../../lib/save-error';

/** Stock movements drawn at once in the product detail. */
const MOVEMENTS_PAGE = 50;

const ERRORS: Record<string, string> = {
  not_whole: t.products.invalidNumber,
  not_positive: t.products.invalidNumber,
  reason_required: t.products.reasonRequired,
  no_change: t.products.noChange,
  invalid_date: t.expiry.invalidDate,
};

const MV_LABEL: Record<StockMovementType, string> = {
  sale: t.products.mvSale,
  entry: t.products.mvEntry,
  adjustment: t.products.mvAdjust,
  void: t.products.mvVoid,
  return: t.products.mvReturn,
  purchase: t.products.mvPurchase,
  purchase_void: t.products.mvPurchaseVoid,
};

/** Stock entries, adjustments (with reason) and the movement history of one product. */
export function StockPanel({ product }: { product: Product }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const byWeight = product.soldBy === 'weight';
  const movements = useLiveQuery(() => store.products.movements(product.id), [store, product.id]);
  const [mode, setMode] = useState<'none' | 'entry' | 'adjust'>('none');
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, runOnce] = useBusy();
  // How fast it sells (last 30 days) and how long the stock lasts, from its own movements.
  const speed = useMemo(() => (movements ? speedFromMovements(movements, product, new Date()) : undefined), [movements, product]);
  const left = daysLeft(product.stock, speed);
  const pace = speed && paceOf(speed.perDay, product.soldBy);
  const paged = usePaged(movements ?? [], MOVEMENTS_PAGE);

  const save = async () => {
    // Weighed products: kg typed, grams stored.
    const parsed = byWeight ? parseWeight(qty) : /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : null;
    if (parsed === null) return setError(byWeight ? t.products.invalidWeight : t.products.invalidNumber);
    const n = parsed;
    const run = async () => {
      try {
        if (mode === 'entry') await store.products.addEntry(product.id, n, product.tracksExpiry && expiry ? expiry : undefined);
        else await store.products.adjust(product.id, n, reason);
        setMode('none');
        setQty('');
        setExpiry('');
        setReason('');
        setError(null);
        showToast(t.settings.saved);
      } catch (e) {
        setError((e instanceof DomainError && ERRORS[e.code]) || saveFailedText(e));
      }
    };
    if (mode === 'entry') return run();
    // Adjustments need the owner code (when set); check the input first so the code is asked only for a valid adjustment.
    const check = adjustmentDelta(product.stock, n, reason);
    if ('error' in check) return setError(ERRORS[check.error] ?? t.errors.saveFailed);
    await guard(run);
  };
  // One tap, one entry: a second tap while it is being saved is ignored.
  const submit = () => runOnce(save);

  return (
    <div className="mt-6">
      <p className="mb-1 text-center text-2xl font-extrabold">{t.products.inStock(formatQuantity(product.stock, product.soldBy))}</p>
      {movements && (
        <p className="mb-2 text-center text-sm text-slate-600">
          {speed && pace
            ? t.stockInsights.paceLine(
                formatQuantity(speed.sold, product.soldBy),
                t.stockInsights.pace(pace.qty, pace.per),
                left === undefined ? null : t.stockInsights.endsIn(left),
              )
            : t.stockInsights.noSales}
        </p>
      )}
      {mode === 'none' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setMode('entry')}>+ {t.products.entry}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setQty(byWeight ? formatKg(Math.max(0, product.stock)) : String(Math.max(0, product.stock)));
              setMode('adjust');
            }}
          >
            {t.products.adjust}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl bg-white p-3">
          <Field
            label={
              mode === 'entry'
                ? byWeight
                  ? t.products.entryQtyKg
                  : t.products.entryQty
                : byWeight
                  ? t.products.adjustQtyKg
                  : t.products.adjustQty
            }
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode={byWeight ? 'decimal' : 'numeric'}
            error={error}
            autoFocus
          />
          {mode === 'entry' && product.tracksExpiry && (
            <Field label={t.expiry.date} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          )}
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
            <Button className="flex-1" disabled={busy} onClick={() => void submit()}>
              {t.common.confirm}
            </Button>
          </div>
        </div>
      )}

      {product.tracksExpiry && <ExpiryPanel product={product} />}

      <h3 className="mt-5 mb-2 font-bold">{t.products.movements}</h3>
      <ul tabIndex={0} aria-label={t.products.movements} className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white">
        {paged.visible.map((m) => (
          <li key={m.id} className="flex justify-between gap-2 p-3 text-sm">
            <span className="min-w-0">
              <span className="font-semibold">{MV_LABEL[m.type]}</span>
              {m.reason ? ` · ${m.reason}` : ''}
              <span className="block text-slate-600">{formatDateTime(m.createdAt)}</span>
            </span>
            <span className={`font-bold tabular-nums ${m.delta < 0 ? 'text-red-700' : 'text-brand-700'}`}>
              {m.delta > 0 ? '+' : ''}
              {formatQuantity(m.delta, product.soldBy)}
            </span>
          </li>
        ))}
      </ul>
      <ShowMore rest={paged.rest} page={MOVEMENTS_PAGE} onClick={paged.more} className="mt-2" />
    </div>
  );
}
