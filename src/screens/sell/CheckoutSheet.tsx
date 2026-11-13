import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { payAndWait } from '../../providers/payment';
import { uuid } from '../../lib/ids';
import { DomainError } from '../../data/store';
import { cartTotal, cashSuggestions, changeDue, type Cart } from '../../domain/cart';
import { checkCreditLimit, creditStatus, DEFAULT_TERM_DAYS, dueDateFromTerm } from '../../domain/credit';
import { isElectronic, isProviderMethod, PAYMENT_METHODS, type Customer, type PaymentMethod, type Sale } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Money, Sheet } from '../../ui/kit';
import { CustomerPicker } from './CustomerPicker';
import { TermPicker } from './TermPicker';
import { usePinGuard } from '../../ui/pin';
import { recordError } from '../../lib/error-log';
import { useTeam } from '../../app/team';

/**
 * Choosing how the customer pays and recording the sale. The receipt is shown by ReceiptSheet.
 * With `replaces`, the same screen records again a sale whose electronic payment never came.
 */
export function CheckoutSheet({
  cart,
  saleId,
  replaces,
  onClose,
  onSaved,
  onOutdated,
  onDuplicate,
}: {
  cart: Cart;
  /** Id of this sale, born with the cart: it cannot be recorded twice. */
  saleId: string;
  /** "O pagamento não entrou": this sale is voided and recorded again, paid the way chosen here. */
  replaces?: Sale;
  onClose: () => void;
  onSaved: (sale: Sale, customer: Customer | null) => void;
  /** A price or a product changed since the cart was made: show the cart again. */
  onOutdated?: () => void;
  /** This sale was already recorded (the app closed just after saving). */
  onDuplicate?: () => void;
}) {
  const { store, payments, showToast } = useApp();
  const guard = usePinGuard();
  const team = useTeam();
  const settings = useLiveQuery(() => store.settings.get(), [store]);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [chosenDueDate, setChosenDueDate] = useState<string | null>(null);
  const [received, setReceived] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  // Guards against a double tap saving the same sale twice (state updates are not instant).
  const submitting = useRef(false);
  // Payments: a new key after each failed attempt; the reference is always this sale.
  const attemptKey = useRef(uuid());
  const total = cartTotal(cart);
  const receivedCents = received ? parseKz(received) : null;
  const change = receivedCents !== null ? changeDue(total, receivedCents) : null;

  // Credit sales: what the customer already owes, overdue payments and the credit limit.
  const credit = useLiveQuery(async () => {
    if (!customer) return undefined;
    const [sales, paid] = await Promise.all([store.sales.byCustomer(customer.id), store.credit.byCustomer(customer.id)]);
    return creditStatus(customer.id, sales, paid, new Date());
  }, [store, customer?.id]);
  const limit =
    method === 'credit' && customer && credit
      ? checkCreditLimit({
          balanceCents: credit.balanceCents,
          saleCents: total,
          customerLimitCents: customer.creditLimitCents,
          shopLimitCents: settings?.creditLimitCents,
        })
      : undefined;
  const overLimit = (limit?.exceedsByCents ?? 0) > 0;

  // Electronic payments whose money has not arrived yet are confirmed later («Já entrou» on «Hoje»).
  // A real payment provider confirms by itself, so then only transfers and the TPA can wait.
  const canWait = method !== null && isElectronic(method) && (!isProviderMethod(method) || payments.isTest);
  const pending = canWait && later;

  // Credit sales: the usual term is pre-selected; the shopkeeper can pick another.
  const dueDate = chosenDueDate ?? dueDateFromTerm(settings?.creditTermDays ?? DEFAULT_TERM_DAYS, new Date());
  const canConfirm =
    method !== null && !busy && (method !== 'credit' || customer !== null) && (method !== 'cash' || !received || change !== null);

  const confirm = async (allowOverLimit = false) => {
    if (!method || !canConfirm || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      let paymentRef: string | undefined;
      // Methods of the payment provider: the app asks for the payment. Transfers and the TPA are only
      // recorded, and so is a payment the shop will confirm later.
      if (isProviderMethod(method) && !pending) {
        // Same attempt, method and amount = same key: a retry after a network error never charges twice.
        // After a definite failure the next attempt gets a new key.
        const res = await payAndWait(payments, {
          idempotencyKey: `${attemptKey.current}:${method}:${total}`,
          amountCents: total,
          currency: 'AOA',
          method,
          reference: saleId,
        });
        if (res.status !== 'confirmed') {
          attemptKey.current = uuid();
          showToast(t.sell.paymentFailed);
          return;
        }
        paymentRef = res.providerRef;
      }
      const input = {
        id: saleId,
        method,
        customerId: customer?.id,
        paymentRef,
        cashReceivedCents: method === 'cash' && receivedCents !== null ? receivedCents : undefined,
        dueDate: method === 'credit' ? dueDate : undefined,
        transactionRef,
        allowOverLimit,
        pending,
      };
      const saved = replaces ? await store.sales.repay(replaces.id, input, t.pending.reason) : await store.sales.create({ ...input, cart });
      navigator.vibrate?.([40, 60, 40]);
      onSaved(saved, customer);
    } catch (e) {
      const code = e instanceof DomainError ? e.code : '';
      if (code === 'credit_limit') showToast(t.credit.limitExceeded);
      else if (onOutdated && (code === 'price_changed' || code === 'product_unavailable')) onOutdated();
      else if (onDuplicate && code === 'duplicate_sale') onDuplicate();
      else if (code === 'not_pending') showToast(t.pending.notPending);
      else {
        // Not a rule of the shop: the phone failed to save (full, or a bug). Kept for the pilot.
        if (!code) recordError('sale', e);
        showToast(t.errors.saveFailed);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet title={replaces ? t.pending.repayTitle : t.sell.howPay} onClose={onClose}>
      <p className="mb-3 text-center">
        <Money cents={total} className="text-4xl font-extrabold" />
      </p>
      {replaces && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-amber-950">{t.pending.repayNote(replaces.number)}</p>}
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
          <p className="mb-2 text-sm font-semibold text-slate-700">{t.sell.receivedQuick}</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[total, ...cashSuggestions(total)].map((v, i) => {
              const text = formatKz(v).replace(' Kz', '');
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setReceived(text)}
                  aria-pressed={received === text}
                  className={`min-h-12 rounded-xl border-2 px-2 text-base font-semibold ${received === text ? 'border-brand-700 bg-brand-50' : 'border-slate-300 bg-white'}`}
                >
                  {i === 0 ? t.sell.exact : formatKz(v)}
                </button>
              );
            })}
          </div>
          <Field
            label={t.sell.otherAmount}
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
          {customer && credit && (
            <div className="mt-3 space-y-1 rounded-xl bg-white p-3 text-base">
              <p className="flex justify-between">
                <span>{t.credit.owesNow}</span>
                <Money cents={Math.max(0, credit.balanceCents)} className="font-semibold" />
              </p>
              {limit?.limitCents !== undefined && (
                <p className="flex justify-between">
                  <span>{t.credit.limitLabel}</span>
                  <Money cents={limit.limitCents} className="font-semibold" />
                </p>
              )}
              {credit.dueState === 'overdue' && <p className="font-semibold text-red-800">{t.credit.hasOverdue}</p>}
              {overLimit && (
                <p role="alert" className="rounded-lg bg-red-50 p-2 font-semibold text-red-800">
                  {t.credit.overLimit(formatKz(limit!.exceedsByCents))}
                </p>
              )}
            </div>
          )}
          {customer && (
            <div className="mt-4">
              <TermPicker value={dueDate} onChange={setChosenDueDate} />
            </div>
          )}
        </div>
      )}

      {method && isElectronic(method) && (
        <div className="mt-4 space-y-2">
          {payments.isTest && isProviderMethod(method) && !pending && (
            <p className="rounded-lg bg-slate-200 p-2 text-center text-sm text-slate-700">{t.sell.simulated}</p>
          )}
          <Field
            label={method === 'transfer' ? t.sell.transferRef : method === 'tpa' ? t.sell.tpaRef : t.sell.transactionRef}
            hint={method === 'transfer' ? t.sell.transferHint : method === 'tpa' ? t.sell.tpaHint : t.sell.transactionRefHint}
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
          {canWait && (
            <label className="flex min-h-12 items-start gap-3 rounded-xl bg-white px-3 py-2">
              <input
                type="checkbox"
                className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
                checked={later}
                onChange={(e) => setLater(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">{t.pending.toggle}</span>
                <span className="text-sm text-slate-600">{t.pending.toggleHint}</span>
              </span>
            </label>
          )}
        </div>
      )}

      {overLimit ? (
        <Button big variant="dangerSolid" className="mt-4 w-full" disabled={!canConfirm} onClick={() => void guard(() => confirm(true))}>
          {t.credit.confirmOverLimit}
        </Button>
      ) : (
        <Button
          big
          className="mt-4 w-full"
          disabled={!canConfirm}
          // Recording again voids the first sale, and an employee without credit needs the owner: the owner code.
          onClick={() => void (replaces || (method === 'credit' && !team.can('credit')) ? guard(() => confirm()) : confirm())}
        >
          {t.sell.confirmSale}
        </Button>
      )}
    </Sheet>
  );
}
