import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { totalPayable } from '../../domain/payables';
import { t } from '../../i18n/pt-AO';
import { Button, Card, Empty, Field, Money, Sheet, Skeleton } from '../../ui/kit';
import { dueBadge } from '../credit/due';
import { SupplierSheet } from './SupplierSheet';
import { useBusy } from '../../ui/use-busy';

/** Suppliers with what the shop owes them, most urgent first. */
export function SuppliersView() {
  const { store } = useApp();
  const book = useLiveQuery(() => store.payables.book(), [store]);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => setAdding(true)}>
        + {t.suppliers.add}
      </Button>
      {!book ? (
        <Skeleton />
      ) : book.length === 0 ? (
        <Empty>{t.suppliers.empty}</Empty>
      ) : (
        <>
          <Card className="flex items-center justify-between">
            <span className="font-bold">{t.suppliers.totalOwed}</span>
            <Money cents={totalPayable(book)} className="text-xl font-extrabold text-amber-800" />
          </Card>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
            {book.map((b) => {
              const badge = b.balanceCents > 0 ? dueBadge(b) : null;
              return (
                <li key={b.supplier.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(b.supplier.id)}
                    className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.supplier.name}</span>
                      {badge ? (
                        <span className={`rounded px-1.5 text-sm font-semibold ${badge.className}`}>{badge.text}</span>
                      ) : (
                        <span className="text-sm text-slate-600">{t.suppliers.settled}</span>
                      )}
                    </span>
                    {b.balanceCents > 0 && <Money cents={b.balanceCents} className="font-bold" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {adding && <NewSupplierSheet onClose={() => setAdding(false)} />}
      {openId && <SupplierSheet supplierId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function NewSupplierSheet({ onClose }: { onClose: () => void }) {
  const { store, showToast } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const save = () =>
    run(async () => {
      if (!name.trim()) return setError(t.products.nameRequired);
      await store.suppliers.create(name, phone);
      showToast(t.settings.saved);
      onClose();
    });
  return (
    <Sheet title={t.suppliers.add} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t.purchases.supplierName} value={name} onChange={(e) => setName(e.target.value)} error={error} />
        <Field label={t.purchases.supplierPhone} value={phone} type="tel" inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
        <Button big className="w-full" disabled={busy} onClick={() => void save()}>
          {t.common.save}
        </Button>
      </div>
    </Sheet>
  );
}
