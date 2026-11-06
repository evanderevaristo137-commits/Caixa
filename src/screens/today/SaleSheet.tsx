import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { receiptText } from '../../domain/messages';
import { whatsAppLink } from '../../domain/whatsapp';
import { methodLabel, t, voidReasonsList } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { lineTotal } from '../../lib/money';
import { Button, Field, LinkButton, Money, Sheet } from '../../ui/kit';

/** One sale: details, resend the non-fiscal receipt, or void it (with a reason). */
export function SaleSheet({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { store, showToast } = useApp();
  const data = useLiveQuery(async () => {
    const sale = await store.sales.get(saleId);
    const [customer, settings] = await Promise.all([
      sale?.customerId ? store.customers.get(sale.customerId) : Promise.resolve(undefined),
      store.settings.get(),
    ]);
    return { sale, customer, settings };
  }, [store, saleId]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!data?.sale) return null;
  const { sale, customer, settings } = data;

  const confirmVoid = async () => {
    try {
      await store.sales.void(sale.id, reason);
      showToast(t.sale.voidDone);
      setVoiding(false);
    } catch (e) {
      setError(e instanceof DomainError && e.code === 'reason_required' ? t.products.reasonRequired : String(e));
    }
  };

  return (
    <Sheet title={t.sale.title(sale.number)} onClose={onClose}>
      <p className="text-slate-600">{formatDateTime(sale.createdAt)}</p>
      <ul className="my-3 divide-y divide-slate-200 rounded-xl bg-white">
        {sale.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-2 p-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{i.name}</span>
              <span className="text-sm text-slate-600">
                {i.quantity} × <Money cents={i.unitPriceCents} />
              </span>
            </span>
            <Money cents={lineTotal(i.unitPriceCents, i.quantity)} className="font-semibold" />
          </li>
        ))}
      </ul>
      <dl className="space-y-1 text-base">
        <div className="flex justify-between text-xl font-extrabold">
          <dt>{t.sale.total}</dt>
          <dd>
            <Money cents={sale.totalCents} className={sale.voidedAt ? 'line-through' : ''} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">{t.sale.method}</dt>
          <dd className="font-semibold">{methodLabel[sale.method]}</dd>
        </div>
        {customer && (
          <div className="flex justify-between">
            <dt className="text-slate-600">{t.sale.customer}</dt>
            <dd className="font-semibold">{customer.name}</dd>
          </div>
        )}
        {sale.paymentRef && (
          <div className="flex justify-between">
            <dt className="text-slate-600">{t.sale.ref}</dt>
            <dd className="text-sm">{sale.paymentRef}</dd>
          </div>
        )}
      </dl>

      {sale.voidedAt ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-800">
          {t.sale.voidedInfo(formatDateTime(sale.voidedAt), sale.voidReason ?? '')}
        </p>
      ) : voiding ? (
        <div className="mt-4 space-y-3 rounded-xl bg-white p-3">
          <p className="font-bold">{t.sale.voidTitle}</p>
          <div className="flex flex-wrap gap-2">
            {voidReasonsList.map((r) => (
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
          <p className="text-sm text-slate-600">{t.sale.voidNote}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setVoiding(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="dangerSolid" className="flex-1" onClick={() => void confirmVoid()}>
              {t.sale.voidConfirm}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <LinkButton
            href={whatsAppLink(receiptText(sale, settings, customer?.name), sale.method === 'credit' ? customer?.phone : undefined)}
          >
            {t.sale.resend}
          </LinkButton>
          <Button variant="danger" className="w-full" onClick={() => setVoiding(true)}>
            {t.sale.void}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
