import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { cartOfSale } from '../../domain/cart';
import { isPaymentPending, type Sale } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { uuid } from '../../lib/ids';
import { Button } from '../../ui/kit';
import { useBusy } from '../../ui/use-busy';
import { CheckoutSheet } from '../sell/CheckoutSheet';

/**
 * Where the money of a sale stands: an electronic payment still to confirm («Já entrou», or «Não
 * entrou» to record the sale again the way the customer pays now), confirmed, or recorded again.
 */
export function PaymentStatus({ sale }: { sale: Sale }) {
  const { store, showToast } = useApp();
  const [busy, run] = useBusy();
  // Id of the sale that will replace this one, born when «Não entrou» opens (never recorded twice).
  const [repayId, setRepayId] = useState<string | null>(null);
  const links = useLiveQuery(async () => {
    const [replacedBy, replaces] = await Promise.all([
      sale.replacedBySaleId ? store.sales.get(sale.replacedBySaleId) : Promise.resolve(undefined),
      sale.replacesSaleId ? store.sales.get(sale.replacesSaleId) : Promise.resolve(undefined),
    ]);
    return { replacedBy, replaces };
  }, [store, sale.replacedBySaleId, sale.replacesSaleId]);

  const confirm = () =>
    run(async () => {
      try {
        await store.sales.confirmPayment(sale.id);
        showToast(t.pending.confirmedToast);
      } catch {
        showToast(t.errors.saveFailed);
      }
    });

  return (
    <>
      {links?.replaces && <p className="mt-3 rounded-xl bg-white p-3 text-slate-700">{t.pending.replaces(links.replaces.number)}</p>}
      {links?.replacedBy && (
        <p className="mt-3 rounded-xl bg-white p-3 font-semibold text-slate-800">{t.pending.replacedBy(links.replacedBy.number)}</p>
      )}
      {sale.confirmedAt && <p className="mt-3 text-sm text-slate-600">{t.pending.confirmed(formatDateTime(sale.confirmedAt))}</p>}
      {isPaymentPending(sale) && (
        <div className="mt-4 space-y-2 rounded-xl bg-amber-50 p-3">
          <p className="font-semibold text-amber-950">{t.pending.since(formatDateTime(sale.pendingSince!))}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void confirm()}>
              {t.pending.arrived}
            </Button>
            <Button variant="secondary" onClick={() => setRepayId(uuid())}>
              {t.pending.notArrived}
            </Button>
          </div>
        </div>
      )}
      {repayId && (
        <CheckoutSheet
          cart={cartOfSale(sale)}
          saleId={repayId}
          replaces={sale}
          onClose={() => setRepayId(null)}
          onSaved={(saved) => {
            setRepayId(null);
            showToast(t.pending.repaid(saved.number));
          }}
        />
      )}
    </>
  );
}
