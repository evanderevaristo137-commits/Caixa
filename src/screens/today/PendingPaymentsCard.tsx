import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Card, Money } from '../../ui/kit';
import { useBusy } from '../../ui/use-busy';
import { SaleSheet } from './SaleSheet';

/** At most this many at first; «Ver todos» shows the rest. */
const FIRST = 5;

/**
 * Electronic payments whose money had not arrived when the sale was recorded, oldest first:
 * «Já entrou» right here, or open the sale (to record it again if the money never came).
 */
export function PendingPaymentsCard() {
  const { store, showToast } = useApp();
  const pending = useLiveQuery(() => store.sales.pending(), [store]);
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, run] = useBusy();
  if (!pending) return null;
  // The last one was just confirmed from its sale: the sale stays open until it is closed.
  if (pending.length === 0) return openId ? <SaleSheet saleId={openId} onClose={() => setOpenId(null)} /> : null;
  const totalCents = pending.reduce((a, s) => a + s.totalCents, 0);
  const shown = all ? pending : pending.slice(0, FIRST);

  const confirm = (id: string) =>
    run(async () => {
      try {
        await store.sales.confirmPayment(id);
        showToast(t.pending.confirmedToast);
      } catch {
        showToast(t.errors.saveFailed);
      }
    });

  return (
    <Card className="border-2 border-amber-300">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{t.pending.cardTitle(pending.length)}</h2>
          <p className="text-sm text-slate-600">{t.pending.cardHint}</p>
        </div>
        <Money cents={totalCents} className="text-xl font-extrabold whitespace-nowrap text-amber-800" />
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {shown.map((s) => (
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
      {pending.length > shown.length && (
        <Button variant="secondary" className="mt-2 w-full" onClick={() => setAll(true)}>
          {t.pending.showAll(pending.length)}
        </Button>
      )}
      {openId && <SaleSheet saleId={openId} onClose={() => setOpenId(null)} />}
    </Card>
  );
}
