import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { DEFAULT_STORE_NAME } from '../../data/store';
import { changeDue } from '../../domain/cart';
import { creditStatus } from '../../domain/credit';
import { receiptText } from '../../domain/messages';
import { isPaymentPending, type Customer, type Sale, type Settings } from '../../domain/types';
import { whatsAppLink } from '../../domain/whatsapp';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatDateStringLong } from '../../lib/dates';
import { Button, LinkButton, Money, Sheet } from '../../ui/kit';

/**
 * "Venda registada": what was recorded, the change to give back and the non-fiscal receipt.
 * Everything shown comes from the saved sale, never from the cart (which is already empty).
 */
export function ReceiptSheet({
  sale,
  customer,
  settings,
  onClose,
}: {
  sale: Sale;
  customer: Customer | null;
  /** The shop details for the receipt, already loaded by the screen so the receipt is ready at once. */
  settings: Settings | undefined;
  onClose: () => void;
}) {
  const { store } = useApp();
  // What the customer owes after this purchase goes on the receipt: a bonus that may fail quietly.
  const [balanceAfter, setBalanceAfter] = useState<number | undefined>(undefined);
  useEffect(() => {
    const customerId = sale.method === 'credit' ? sale.customerId : undefined;
    if (!customerId) return;
    let cancelled = false;
    Promise.all([store.sales.byCustomer(customerId), store.credit.byCustomer(customerId)])
      .then(([sales, credits]) => {
        if (!cancelled) setBalanceAfter(creditStatus(customerId, sales, credits, new Date()).balanceCents);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store, sale]);

  const change = sale.cashReceivedCents !== undefined ? changeDue(sale.totalCents, sale.cashReceivedCents) : null;
  return (
    <Sheet title={t.sell.done} onClose={onClose}>
      <div className="py-2 text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-4xl text-brand-700">✓</div>
        <Money cents={sale.totalCents} className="block text-4xl font-extrabold" />
        <p className="mt-1 text-lg text-slate-600">
          {methodLabel[sale.method]}
          {isPaymentPending(sale) ? ` (${t.pending.receipt})` : ''}
          {customer ? ` — ${customer.name}` : ''}
        </p>
        {sale.dueDate && <p className="mt-1 font-semibold text-amber-800">{t.sell.payBy(formatDateStringLong(sale.dueDate))}</p>}
        {change !== null && (
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {t.sell.change}: <Money cents={change} />
          </p>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {settings && (
          <LinkButton
            href={whatsAppLink(
              receiptText(sale, settings, customer?.name, balanceAfter),
              sale.method === 'credit' ? customer?.phone : undefined,
            )}
          >
            {t.sell.shareReceipt}
          </LinkButton>
        )}
        <p className="text-center text-sm text-slate-600">{t.nonFiscal}</p>
        {settings?.storeName === DEFAULT_STORE_NAME && (
          <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-900">{t.sell.nameHint}</p>
        )}
        <Button big className="w-full" onClick={onClose}>
          {t.sell.newSale}
        </Button>
      </div>
    </Sheet>
  );
}
