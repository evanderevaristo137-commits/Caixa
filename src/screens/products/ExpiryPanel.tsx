import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { batchesOnShelf, daysBetween } from '../../domain/expiry';
import { formatKg, formatQuantity, parseWeight } from '../../domain/quantity';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatDateString, toLocalDateString } from '../../lib/dates';
import { Button, Field } from '../../ui/kit';
import { useBusy } from '../../ui/use-busy';
import { saveFailedText } from '../../lib/save-error';

/**
 * The expiry dates of what is on the shelf, first to expire first, and a way to give a date to
 * stock that has none (stock that was there before the product followed its dates).
 */
export function ExpiryPanel({ product }: { product: Product }) {
  const { store, showToast } = useApp();
  const batches = useLiveQuery(() => store.batches.forProduct(product.id), [store, product.id]);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  if (!batches) return null;
  const byWeight = product.soldBy === 'weight';
  const today = toLocalDateString(new Date());
  const shelf = batchesOnShelf(product.stock, batches);
  const undated = shelf.find((s) => !s.expiresOn)?.quantity ?? 0;

  const save = () =>
    run(async () => {
      const n = byWeight ? parseWeight(qty) : /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : null;
      if (n === null || n <= 0) return setError(t.expiry.errors.invalid_quantity!);
      try {
        await store.batches.addShelf(product.id, n, date);
        showToast(t.expiry.shelfSaved);
        setOpen(false);
        setDate('');
        setError(null);
      } catch (e) {
        setError((e instanceof DomainError && t.expiry.errors[e.code]) || saveFailedText(e));
      }
    });

  return (
    <div className="mt-5">
      <h3 className="mb-2 font-bold">{t.expiry.title}</h3>
      {shelf.length === 0 ? (
        <p className="rounded-xl bg-white p-3 text-slate-600">{t.expiry.none}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white">
          {shelf.map((s, i) => {
            const days = s.expiresOn ? daysBetween(today, s.expiresOn) : undefined;
            return (
              <li key={`${s.expiresOn ?? 'none'}-${i}`} className="flex justify-between gap-2 p-3">
                <span className="font-semibold">{formatQuantity(s.quantity, product.soldBy)}</span>
                <span
                  className={`text-right text-sm ${days === undefined ? 'text-slate-600' : days < 0 ? 'font-bold text-red-700' : days <= 30 ? 'font-semibold text-amber-800' : 'text-slate-700'}`}
                >
                  {s.expiresOn && days !== undefined ? t.expiry.expires(formatDateString(s.expiresOn), days) : t.expiry.noDate}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {undated > 0 &&
        (open ? (
          <div className="mt-2 space-y-3 rounded-xl bg-white p-3">
            <p className="text-sm text-slate-600">{t.expiry.shelfHint}</p>
            <Field
              label={byWeight ? t.expiry.shelfQtyKg : t.expiry.shelfQty}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode={byWeight ? 'decimal' : 'numeric'}
            />
            <Field label={t.expiry.shelfDate} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={error} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => void save()}>
                {t.expiry.shelfSave}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              setQty(byWeight ? formatKg(undated) : String(undated));
              setOpen(true);
            }}
          >
            {t.expiry.addShelf}
          </Button>
        ))}
    </div>
  );
}
