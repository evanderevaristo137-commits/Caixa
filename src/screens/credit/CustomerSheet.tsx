import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { creditStatus, validateCreditPayment } from '../../domain/credit';
import { reminderText } from '../../domain/messages';
import { toWhatsAppNumber, whatsAppLink } from '../../domain/whatsapp';
import type { CreditPayment } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { calendarDaysBetween, formatDate, formatDateTime } from '../../lib/dates';
import { parseKz } from '../../lib/money';
import { Button, Field, LinkButton, Money, Sheet } from '../../ui/kit';
import { daysClass } from './days';

const PAY_METHODS: CreditPayment['method'][] = ['cash', 'multicaixa_express', 'kwik', 'unitel_money', 'afrimoney'];

export function CustomerSheet({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { store, showToast } = useApp();
  const data = useLiveQuery(async () => {
    const [customer, sales, payments, settings] = await Promise.all([
      store.customers.get(customerId),
      store.sales.byCustomer(customerId),
      store.credit.byCustomer(customerId),
      store.settings.get(),
    ]);
    return { customer, sales: sales.filter((s) => s.method === 'credit'), payments, settings };
  }, [store, customerId]);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CreditPayment['method']>('cash');
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  if (!data?.customer) return null;
  const { customer, sales, payments, settings } = data;
  const now = new Date();
  const status = creditStatus(customer.id, sales, payments, now);

  const pay = async (cents: number | null) => {
    const check = validateCreditPayment(cents ?? 0, status.balanceCents);
    if (check !== 'ok') return setError(check === 'zero' ? t.credit.zero : t.credit.tooMuch);
    await store.credit.addPayment(customer.id, cents!, method);
    setPaying(false);
    setAmount('');
    setError(null);
    showToast(t.credit.paid);
  };

  const saveDetails = async () => {
    const nextName = name ?? customer.name;
    if (!nextName.trim()) return setNameError(t.products.nameRequired);
    await store.customers.update(customer.id, nextName, phone ?? customer.phone);
    setPhone(null);
    setName(null);
    setNameError(null);
    showToast(t.settings.saved);
  };

  const history = [
    ...sales.map((s) => ({
      at: s.createdAt,
      kind: 'buy' as const,
      voided: !!s.voidedAt,
      cents: s.totalCents,
      label: s.items.map((i) => `${i.quantity}× ${i.name}`).join(', '),
    })),
    ...payments.map((p) => ({ at: p.createdAt, kind: 'pay' as const, voided: false, cents: p.amountCents, label: methodLabel[p.method] })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Sheet title={customer.name} onClose={onClose}>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-600">{status.balanceCents < 0 ? t.credit.inFavour : t.credit.owes}</p>
        <Money
          cents={Math.abs(status.balanceCents)}
          className={`block text-4xl font-extrabold ${status.balanceCents < 0 ? 'text-brand-700' : ''}`}
        />
        {status.daysOutstanding !== undefined && (
          <span className={`mt-2 inline-block rounded-full px-3 py-1 font-semibold ${daysClass(status.daysOutstanding)}`}>
            {t.credit.days(status.daysOutstanding)} · {formatDate(status.oldestUnpaidAt!)}
          </span>
        )}
      </div>

      {status.balanceCents > 0 && (
        <div className="mt-4 space-y-2">
          {toWhatsAppNumber(customer.phone) ? (
            <>
              <LinkButton
                href={whatsAppLink(
                  reminderText(customer.name, status.balanceCents, status.oldestUnpaidAt, settings.storeName, now),
                  customer.phone,
                )}
                onClick={() => void store.customers.markReminded(customer.id)}
              >
                {t.credit.remind}
              </LinkButton>
              {customer.lastRemindedAt && (
                <p className="text-center text-sm text-slate-600">
                  {t.credit.lastReminder(calendarDaysBetween(new Date(customer.lastRemindedAt), now))}
                </p>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-900">{t.credit.noPhone}</p>
          )}
          {!paying ? (
            <Button big className="w-full" onClick={() => setPaying(true)}>
              {t.credit.pay}
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl bg-white p-3">
              <Field
                label={t.credit.amount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                error={error}
                autoFocus
              />
              <p className="text-sm font-semibold text-slate-700">{t.credit.method}</p>
              <div className="flex flex-wrap gap-2">
                {PAY_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    aria-pressed={method === m}
                    className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${method === m ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
                  >
                    {methodLabel[m]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void pay(status.balanceCents)}>
                  {t.credit.payAll}
                </Button>
                <Button className="flex-1" onClick={() => void pay(parseKz(amount))}>
                  {t.common.confirm}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3 rounded-xl bg-white p-3">
        <Field
          label={t.sell.customerName}
          value={name ?? customer.name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          autoComplete="off"
        />
        <Field
          label={t.credit.editPhone}
          type="tel"
          inputMode="tel"
          value={phone ?? customer.phone ?? ''}
          onChange={(e) => setPhone(e.target.value)}
        />
        {(phone !== null || name !== null) && (
          <Button className="w-full" onClick={() => void saveDetails()}>
            {t.common.save}
          </Button>
        )}
      </div>

      <h3 className="mt-5 mb-2 font-bold">{t.credit.history}</h3>
      <ul className="divide-y divide-slate-200 rounded-xl bg-white">
        {history.map((h, i) => (
          <li key={i} className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="font-semibold">
                {h.kind === 'pay' ? t.credit.payment : h.voided ? t.credit.voidedPurchase : t.credit.purchase}
              </p>
              <p className="truncate text-sm text-slate-600">
                {formatDateTime(h.at)} · {h.label}
              </p>
            </div>
            <Money
              cents={h.kind === 'buy' ? h.cents : -h.cents}
              className={`font-bold ${h.kind === 'pay' ? 'text-brand-700' : ''} ${h.voided ? 'text-slate-400 line-through' : ''}`}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
