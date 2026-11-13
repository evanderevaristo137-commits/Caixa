import { useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { formatKg, formatQuantity, parseWeight } from '../../domain/quantity';
import { returnable, returnItems } from '../../domain/returns';
import type { Sale, SaleReturn } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Field, Money, Sheet } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { useBusy } from '../../ui/use-busy';
import { saveFailedText } from '../../lib/save-error';

const chip = (on: boolean) =>
  `min-h-12 rounded-xl border-2 px-3 text-sm font-semibold ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/**
 * Goods given back from one sale, all or part: how much of each line, whether they go back on the
 * shelf, how the money goes back, and why. The money is worked out by the app, never typed.
 */
export function ReturnSheet({ sale, earlier, onClose }: { sale: Sale; earlier: SaleReturn[]; onClose: () => void }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const [busy, run] = useBusy();
  const left = useMemo(() => returnable(sale, earlier), [sale, earlier]);
  const lines = sale.items.filter((i) => (left.get(i.productId) ?? 0) > 0);
  // Units: how many come back. Weighed goods: the kg typed.
  const [units, setUnits] = useState<Record<string, number>>({});
  const [kg, setKg] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const onCredit = sale.method === 'credit';
  const [refund, setRefund] = useState<SaleReturn['refund']>(onCredit ? 'debt' : 'cash');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wanted = sale.items.map((i) => ({
    productId: i.productId,
    quantity: i.soldBy === 'weight' ? (parseWeight(kg[i.productId] ?? '') ?? (kg[i.productId] ? -1 : 0)) : (units[i.productId] ?? 0),
  }));
  const items = returnItems(sale, earlier, wanted);
  const total = typeof items === 'string' ? 0 : items.reduce((a, i) => a + i.refundCents, 0);

  const confirm = () => {
    if (typeof items === 'string') return setError(t.returns.errors[items] ?? t.errors.saveFailed);
    if (reason.trim().length < 3) return setError(t.returns.errors.reason_required!);
    setError(null);
    return guard(() =>
      run(async () => {
        try {
          await store.returns.create({ saleId: sale.id, lines: wanted, refund, restock, reason });
          showToast(t.returns.done(formatKz(total)));
          onClose();
        } catch (e) {
          setError((e instanceof DomainError && t.returns.errors[e.code]) || saveFailedText(e));
        }
      }),
    );
  };

  return (
    <Sheet title={t.returns.title(sale.number)} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 font-semibold">{t.returns.howMany}</p>
          <ul className="divide-y divide-slate-200 rounded-xl bg-white">
            {lines.map((i) => {
              const max = left.get(i.productId) ?? 0;
              const n = units[i.productId] ?? 0;
              return (
                <li key={i.productId} className="p-3">
                  <p className="font-semibold">{i.name}</p>
                  <p className="text-sm text-slate-600">{t.returns.left(formatQuantity(max, i.soldBy))}</p>
                  {i.soldBy === 'weight' ? (
                    <Field
                      label={t.returns.weightLabel(i.name)}
                      inputMode="decimal"
                      placeholder={formatKg(max)}
                      value={kg[i.productId] ?? ''}
                      onChange={(e) => setKg((k) => ({ ...k, [i.productId]: e.target.value }))}
                    />
                  ) : (
                    <div className="mt-2 flex items-center gap-3" role="group" aria-label={i.name}>
                      <Button
                        variant="secondary"
                        aria-label={`− ${i.name}`}
                        disabled={n === 0}
                        onClick={() => setUnits((u) => ({ ...u, [i.productId]: Math.max(0, n - 1) }))}
                      >
                        −
                      </Button>
                      <span className="min-w-8 text-center text-xl font-bold tabular-nums" aria-live="polite">
                        {n}
                      </span>
                      <Button
                        variant="secondary"
                        aria-label={`+ ${i.name}`}
                        disabled={n >= max}
                        onClick={() => setUnits((u) => ({ ...u, [i.productId]: Math.min(max, n + 1) }))}
                      >
                        +
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-2 font-semibold">{t.returns.restock}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={restock} className={chip(restock)} onClick={() => setRestock(true)}>
              {t.returns.restockYes}
            </button>
            <button type="button" aria-pressed={!restock} className={chip(!restock)} onClick={() => setRestock(false)}>
              {t.returns.restockNo}
            </button>
          </div>
        </div>

        {onCredit ? (
          <p className="rounded-xl bg-amber-50 p-3 text-amber-950">{t.returns.debtNote}</p>
        ) : (
          <div>
            <p className="mb-2 font-semibold">{t.returns.refund}</p>
            <div className="grid gap-2">
              {(['cash', 'other'] as const).map((r) => (
                <button key={r} type="button" aria-pressed={refund === r} className={chip(refund === r)} onClick={() => setRefund(r)}>
                  {t.returns.refunds[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 font-semibold">{t.returns.reason}</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {t.returns.reasons.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
                className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${reason === r ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Field label={t.returns.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white p-3 text-lg font-bold">
          <span>{onCredit ? t.returns.totalDebt : t.returns.total}</span>
          <Money cents={total} className="text-2xl font-extrabold" />
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">
            {error}
          </p>
        )}
        <Button big className="w-full" disabled={busy || total <= 0} onClick={() => void confirm()}>
          {t.returns.confirm}
        </Button>
      </div>
    </Sheet>
  );
}
