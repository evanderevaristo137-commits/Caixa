import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Money } from '../../ui/kit';
import { ShowMore, usePaged } from '../../ui/paged';
import { useBusy } from '../../ui/use-busy';
import { SaleSheet } from './SaleSheet';
import { saveFailedText } from '../../lib/save-error';

/** Drawn 20 at a time. */
const PAGE = 20;

/**
 * Electronic payments whose money had not arrived when the sale was recorded, oldest first
 * (inside the «Para tratar hoje» sheet): «Já entrou» right here, or open the sale (to record it
 * again if the money never came).
 */
export function PendingPayments() {
  const { store, showToast } = useApp();
  const pending = useLiveQuery(() => store.sales.pending(), [store]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const { visible, rest, more } = usePaged(pending ?? [], PAGE);
  if (!pending) return null;
  const totalCents = pending.reduce((a, s) => a + s.totalCents, 0);

  const confirm = (id: string) =>
    run(async () => {
      try {
        await store.sales.confirmPayment(id);
        showToast(t.pending.confirmedToast);
      } catch (e) {
        showToast(saveFailedText(e));
      }
    });

  return (
    <div className="rounded-xl bg-white p-3">
      {pending.length === 0 ? (
        <p className="py-2 text-slate-600">{t.pending.none}</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-slate-600">{t.pending.cardHint}</p>
            <Money cents={totalCents} className="text-xl font-extrabold whitespace-nowrap text-amber-800" />
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {visible.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <button type="button" className="min-h-12 min-w-0 flex-1 text-left active:bg-slate-50" onClick={() => setOpenId(s.id)}>
                  <span className="block font-semibold">
                    {methodLabel[s.method]} · <Money cents={s.totalCents} />
                  </span>
                  <span className="block truncate text-sm text-slate-600">
                    {t.history.number(s.number)} · {formatDateTime(s.createdAt)}
                    {s.transactionRef ? ` · ${s.transactionRef}` : ''}
                  </span>
                </button>
                <Button aria-label={t.pending.arrivedFor(s.number)} disabled={busy} onClick={() => void confirm(s.id)}>
                  {t.pending.arrived}
                </Button>
              </li>
            ))}
          </ul>
          <ShowMore rest={rest} page={PAGE} onClick={more} className="mt-2" />
        </>
      )}
      {openId && <SaleSheet saleId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
