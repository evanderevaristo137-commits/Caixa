import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { cartTotal, changeDue, type Cart } from '../../domain/cart';
import { receiptText } from '../../domain/messages';
import { whatsAppLink } from '../../domain/whatsapp';
import { PAYMENT_METHODS, type Customer, type PaymentMethod, type Sale } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { parseKz } from '../../lib/money';
import { Button, Field, LinkButton, Money, Sheet } from '../../ui/kit';
import { CustomerPicker } from './CustomerPicker';

export function CheckoutSheet({ cart, onClose, onDone }: { cart: Cart; onClose: () => void; onDone: () => void }) {
  const { store, payments, showToast } = useApp();
  const settings = useLiveQuery(() => store.settings.get(), [store]);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const total = cartTotal(cart);
  const receivedCents = received ? parseKz(received) : null;
  const change = receivedCents !== null ? changeDue(total, receivedCents) : null;

  const canConfirm =
    method !== null && !busy && (method !== 'credit' || customer !== null) && (method !== 'cash' || !received || change !== null);

  const confirm = async () => {
    if (!method || !canConfirm) return;
    setBusy(true);
    try {
      let paymentRef: string | undefined;
      if (method !== 'cash' && method !== 'credit') {
        const res = await payments.requestPayment({ amountCents: total, method, reference: crypto.randomUUID?.() ?? String(Date.now()) });
        if (res.status !== 'confirmed') {
          showToast(t.sell.paymentFailed);
          return;
        }
        paymentRef = res.providerRef;
      }
      const saved = await store.sales.create({
        cart,
        method,
        customerId: customer?.id,
        paymentRef,
        cashReceivedCents: method === 'cash' && receivedCents !== null ? receivedCents : undefined,
      });
      navigator.vibrate?.([40, 60, 40]);
      setSale(saved);
    } finally {
      setBusy(false);
    }
  };

  if (sale) {
    const text = settings ? receiptText(sale, settings, customer?.name) : '';
    return (
      <Sheet title={t.sell.done} onClose={onDone}>
        <div className="py-2 text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-4xl text-brand-700">✓</div>
          <Money cents={sale.totalCents} className="block text-4xl font-extrabold" />
          <p className="mt-1 text-lg text-slate-600">
            {methodLabel[sale.method]}
            {customer ? ` — ${customer.name}` : ''}
          </p>
          {sale.cashReceivedCents !== undefined && change !== null && (
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {t.sell.change}: <Money cents={change} />
            </p>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <LinkButton href={whatsAppLink(text, sale.method === 'credit' ? customer?.phone : undefined)}>{t.sell.shareReceipt}</LinkButton>
          <p className="text-center text-sm text-slate-500">{t.nonFiscal}</p>
          <Button big className="w-full" onClick={onDone}>
            {t.sell.newSale}
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t.sell.howPay} onClose={onClose}>
      <p className="mb-3 text-center">
        <Money cents={total} className="text-4xl font-extrabold" />
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            aria-pressed={method === m}
            className={`min-h-16 rounded-xl border-2 px-2 text-lg font-semibold ${method === m ? 'border-brand-700 bg-brand-700 text-white' : m === 'credit' ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white'}`}
          >
            {methodLabel[m]}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <div className="mt-4">
          <Field
            label={t.sell.received}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            inputMode="numeric"
            error={received && change === null ? t.sell.notEnough : null}
          />
          {change !== null && received && (
            <p className="mt-2 text-xl font-bold text-amber-700">
              {t.sell.change}: <Money cents={change} />
            </p>
          )}
        </div>
      )}

      {method === 'credit' && (
        <div className="mt-4">
          <p className="mb-2 font-semibold">{t.sell.chooseCustomer}</p>
          <CustomerPicker selected={customer?.id} onSelect={setCustomer} />
        </div>
      )}

      {method && method !== 'cash' && method !== 'credit' && payments.isTest && (
        <p className="mt-3 rounded-lg bg-slate-200 p-2 text-center text-sm text-slate-700">{t.sell.simulated}</p>
      )}

      <Button big className="mt-4 w-full" disabled={!canConfirm} onClick={() => void confirm()}>
        {t.sell.confirmSale}
      </Button>
    </Sheet>
  );
}
