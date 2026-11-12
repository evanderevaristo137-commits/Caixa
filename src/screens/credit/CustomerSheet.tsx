import { useState } from 'react';
import { compareText } from '../../domain/ranking';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { creditStatus, validateCreditPayment } from '../../domain/credit';
import { customerPunctuality } from '../../domain/debtors';
import { normaliseNif } from '../../domain/nif';
import { formatQuantity } from '../../domain/quantity';
import type { CreditPayment } from '../../domain/types';
import { creditPaymentLabel, methodLabel, t } from '../../i18n/pt-AO';
import { calendarDaysBetween, formatDateString, formatDateTime, toLocalDateString } from '../../lib/dates';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, LinkButton, Money, Sheet } from '../../ui/kit';
import { dueBadge, reminderLink } from './due';
import { useBusy } from '../../ui/use-busy';
import { statementText } from '../../domain/statement';
import { whatsAppLink } from '../../domain/whatsapp';

const VERDICT_CLASS = { good: 'text-brand-800', fair: 'text-amber-800', poor: 'text-red-700' } as const;

const PAY_METHODS: Exclude<CreditPayment['method'], 'return'>[] = [
  'cash',
  'multicaixa_express',
  'kwik',
  'unitel_money',
  'afrimoney',
  'paypay',
  'transfer',
  'tpa',
];

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
  const [method, setMethod] = useState<Exclude<CreditPayment['method'], 'return'>>('cash');
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [nif, setNif] = useState<string | null>(null);
  const [nifError, setNifError] = useState<string | null>(null);
  const [ownLimit, setOwnLimit] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  if (!data?.customer) return null;
  const { customer, sales, payments, settings } = data;
  const now = new Date();
  const status = creditStatus(customer.id, sales, payments, now);
  const badge = status.balanceCents > 0 ? dueBadge(status) : null;
  const remind = reminderLink(status, customer, settings.storeName, now);
  const punct = customerPunctuality(sales, payments, toLocalDateString(now));
  const judged = punct.onTime + punct.late + punct.openLate;

  // One tap, one payment: a second tap while it is being saved is ignored.
  const pay = (cents: number | null) =>
    run(async () => {
      const check = validateCreditPayment(cents ?? 0, status.balanceCents);
      if (check !== 'ok') return setError(check === 'zero' ? t.credit.zero : t.credit.tooMuch);
      await store.credit.addPayment(customer.id, cents!, method, transactionRef);
      setTransactionRef('');
      setPaying(false);
      setAmount('');
      setError(null);
      showToast(t.credit.paid);
    });

  const saveDetails = async () => {
    const nextName = name ?? customer.name;
    if (!nextName.trim()) return setNameError(t.products.nameRequired);
    if (nif !== null && !normaliseNif(nif).ok) return setNifError(t.settings.nifInvalid);
    setNifError(null);
    const limitCents = ownLimit === null ? undefined : ownLimit.trim() === '' ? null : parseKz(ownLimit);
    if (limitCents === null && ownLimit !== null && ownLimit.trim() !== '') return setLimitError(t.credit.limitInvalid);
    setLimitError(null);
    await store.customers.update(customer.id, {
      name: nextName,
      phone: phone ?? customer.phone,
      ...(nif !== null ? { nif } : {}),
      ...(limitCents !== undefined ? { creditLimitCents: limitCents } : {}),
    });
    setNif(null);
    setOwnLimit(null);
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
      label:
        (s.dueDate ? `${t.sell.payBy(formatDateString(s.dueDate))} · ` : '') +
        s.items.map((i) => `${formatQuantity(i.quantity, i.soldBy)} × ${i.name}`).join(', '),
    })),
    ...payments.map((p) => ({
      at: p.createdAt,
      kind: 'pay' as const,
      voided: false,
      cents: p.amountCents,
      label: creditPaymentLabel(p.method),
    })),
  ].sort((a, b) => compareText(b.at, a.at));

  return (
    <Sheet title={customer.name} onClose={onClose}>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-600">{status.balanceCents < 0 ? t.credit.inFavour : t.credit.owes}</p>
        <Money
          cents={Math.abs(status.balanceCents)}
          className={`block text-4xl font-extrabold ${status.balanceCents < 0 ? 'text-brand-700' : ''}`}
        />
        {badge && <span className={`mt-2 inline-block rounded-full px-3 py-1 font-semibold ${badge.className}`}>{badge.text}</span>}
        {status.dueNowCents > 0 && status.dueNowCents < status.balanceCents && (
          <p className="mt-2 font-semibold text-red-800">
            {t.credit.dueNow}: <Money cents={status.dueNowCents} />
          </p>
        )}
        {judged > 0 && (
          <p className="mt-2 text-sm text-slate-700">
            {punct.verdict && (
              <span className={`font-bold ${VERDICT_CLASS[punct.verdict]}`}>{t.punctuality.verdict[punct.verdict]} · </span>
            )}
            {punct.verdict ? t.punctuality.line(punct.onTime, judged, punct.avgDaysLate) : t.punctuality.tooFew}
          </p>
        )}
      </div>

      {status.balanceCents > 0 && (
        <div className="mt-4 space-y-2">
          {remind ? (
            <>
              <LinkButton href={remind} onClick={() => void store.customers.markReminded(customer.id)}>
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
              {method !== 'cash' && (
                <Field
                  label={t.sell.transactionRef}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              )}
              <div className="flex gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => void pay(status.balanceCents)}>
                  {t.credit.payAll}
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => void pay(parseKz(amount))}>
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
        <Field
          label={t.invoicing.customerNif}
          value={nif ?? customer.nif ?? ''}
          onChange={(e) => setNif(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          hint={t.settings.nifHint}
          error={nifError}
        />
        <Field
          label={t.credit.ownLimit}
          value={ownLimit ?? (customer.creditLimitCents ? formatKz(customer.creditLimitCents).replace(' Kz', '') : '')}
          onChange={(e) => setOwnLimit(e.target.value)}
          inputMode="numeric"
          error={limitError}
        />
        {(phone !== null || name !== null || nif !== null || ownLimit !== null) && (
          <Button className="w-full" onClick={() => void saveDetails()}>
            {t.common.save}
          </Button>
        )}
      </div>

      {(sales.length > 0 || payments.length > 0) && (
        <div className="mt-4 space-y-1">
          <LinkButton href={whatsAppLink(statementText(customer, settings.storeName, sales, payments, now), customer.phone)}>
            {t.credit.statement}
          </LinkButton>
          <p className="text-center text-sm text-slate-600">{t.credit.statementHint}</p>
        </div>
      )}

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
