import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { formatQuantity } from '../../domain/quantity';
import { t } from '../../i18n/pt-AO';
import { formatDateString, formatDateTime } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { Button, Empty, Field, Money, Sheet, Skeleton } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { NewPurchaseSheet } from './NewPurchaseSheet';

/** Purchases (goods received), newest first. */
export function PurchasesView() {
  const { store } = useApp();
  const data = useLiveQuery(async () => {
    const [purchases, suppliers] = await Promise.all([store.purchases.list(), store.suppliers.list()]);
    return { purchases: purchases.reverse(), names: new Map(suppliers.map((s) => [s.id, s.name])) };
  }, [store]);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <Button className="mb-3 w-full" onClick={() => setAdding(true)}>
        + {t.purchases.add}
      </Button>
      {!data ? (
        <Skeleton />
      ) : data.purchases.length === 0 ? (
        <Empty>{t.purchases.empty}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
          {data.purchases.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpenId(p.id)}
                className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold ${p.voidedAt ? 'text-slate-400 line-through' : ''}`}>
                    {t.purchases.number(p.number)} · {p.supplierId ? (data.names.get(p.supplierId) ?? '') : t.purchases.noSupplier}
                  </span>
                  <span className="text-sm text-slate-600">
                    {formatDateTime(p.createdAt)} · {p.payment === 'credit' ? t.purchases.onCredit : t.purchases.payments[p.payment]}
                    {p.voidedAt && (
                      <span className="ml-1 rounded bg-red-100 px-1.5 font-semibold text-red-800">{t.purchases.voidedTag}</span>
                    )}
                  </span>
                </span>
                <Money cents={p.totalCents} className={`font-bold ${p.voidedAt ? 'text-slate-400 line-through' : ''}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && <NewPurchaseSheet onClose={() => setAdding(false)} />}
      {openId && <PurchaseSheet purchaseId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** One purchase, and voiding it (reason + owner code): the stock goes back down. */
function PurchaseSheet({ purchaseId, onClose }: { purchaseId: string; onClose: () => void }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const data = useLiveQuery(async () => {
    const purchase = await store.purchases.get(purchaseId);
    const supplier = purchase?.supplierId ? await store.suppliers.get(purchase.supplierId) : undefined;
    return { purchase, supplier };
  }, [store, purchaseId]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!data?.purchase) return null;
  const { purchase, supplier } = data;

  const confirmVoid = async () => {
    if (reason.trim().length < 3) return setError(t.products.reasonRequired);
    await guard(async () => {
      try {
        await store.purchases.void(purchase.id, reason);
        showToast(t.purchases.voided);
        setVoiding(false);
      } catch {
        setError(t.errors.saveFailed);
      }
    });
  };

  return (
    <Sheet title={t.purchases.number(purchase.number)} onClose={onClose}>
      <p className="text-slate-600">
        {formatDateTime(purchase.createdAt)} · {supplier?.name ?? t.purchases.noSupplier}
      </p>
      <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-white">
        {purchase.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-2 p-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{i.name}</span>
              <span className="text-sm text-slate-600">
                {formatQuantity(i.quantity, i.soldBy)} × {formatKz(i.unitCostCents)}
                {i.soldBy === 'weight' ? '/kg' : ''}
              </span>
            </span>
            <Money cents={i.lineTotalCents} className="font-semibold" />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3">
        <span className="font-semibold">{t.purchases.total}</span>
        <Money cents={purchase.totalCents} className="text-2xl font-extrabold" />
      </div>
      <p className="mt-2 text-slate-700">
        {t.purchases.payments[purchase.payment]}
        {purchase.dueDate ? ` · ${t.purchases.payBy(formatDateString(purchase.dueDate))}` : ''}
      </p>
      {purchase.note && <p className="mt-1 text-slate-700">{purchase.note}</p>}
      {purchase.voidedAt ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-800">
          {t.purchases.voidedInfo(formatDateTime(purchase.voidedAt), purchase.voidReason ?? '')}
        </p>
      ) : voiding ? (
        <div className="mt-4 space-y-3 rounded-xl bg-white p-3">
          <p className="font-bold">{t.purchases.voidTitle}</p>
          <div className="flex flex-wrap gap-2">
            {t.purchases.voidReasons.map((r) => (
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
          <p className="text-sm text-slate-600">{t.purchases.voidNote}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setVoiding(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="dangerSolid" className="flex-1" onClick={() => void confirmVoid()}>
              {t.purchases.voidConfirm}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" className="mt-4 w-full" onClick={() => setVoiding(true)}>
          {t.purchases.void}
        </Button>
      )}
    </Sheet>
  );
}
