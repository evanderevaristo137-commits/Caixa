import { useState } from 'react';
import { compareText } from '../../domain/ranking';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { payableStatus } from '../../domain/payables';
import { supplierOrderText } from '../../domain/purchases';
import { restockList } from '../../domain/today';
import { toWhatsAppNumber, whatsAppLink } from '../../domain/whatsapp';
import { t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, LinkButton, Money, Sheet } from '../../ui/kit';
import { dueBadge } from '../credit/due';

/** One supplier: contact, what the shop owes, paying it, ordering by WhatsApp and the history. */
export function SupplierSheet({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const { store, showToast } = useApp();
  const data = useLiveQuery(async () => {
    const [supplier, purchases, payments, products, settings] = await Promise.all([
      store.suppliers.get(supplierId),
      store.purchases.bySupplier(supplierId),
      store.supplierPayments.bySupplier(supplierId),
      store.products.list(),
      store.settings.get(),
    ]);
    return { supplier, purchases, payments, products, settings };
  }, [store, supplierId]);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [fromCash, setFromCash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  if (!data?.supplier) return null;
  const { supplier, purchases, payments, products, settings } = data;
  const now = new Date();
  const status = payableStatus(supplier.id, purchases, payments, now);
  const badge = status.balanceCents > 0 ? dueBadge(status) : null;
  // The order: low-stock products usually bought from this supplier.
  const toOrder = restockList(products.filter((p) => p.supplierId === supplier.id));
  const orderLink =
    toOrder.length > 0 && toWhatsAppNumber(supplier.phone)
      ? whatsAppLink(supplierOrderText(settings.storeName, supplier.name, toOrder, now), supplier.phone)
      : null;

  const pay = async (cents: number | null) => {
    if (cents === null || cents <= 0) return setError(t.suppliers.zero);
    try {
      await store.supplierPayments.add(supplier.id, cents, fromCash);
      setPaying(false);
      setAmount('');
      setError(null);
      showToast(t.suppliers.paid);
    } catch (e) {
      setError(e instanceof DomainError && e.code === 'too_much' ? t.suppliers.tooMuch : t.errors.saveFailed);
    }
  };

  const saveDetails = async () => {
    await store.suppliers.update(supplier.id, { name: name ?? supplier.name, phone: phone ?? supplier.phone ?? '' });
    setName(null);
    setPhone(null);
    showToast(t.settings.saved);
  };

  const history = [
    ...purchases.map((p) => ({
      id: p.id,
      at: p.createdAt,
      label: `${t.suppliers.purchase} n.º ${p.number}`,
      cents: p.totalCents,
      voided: !!p.voidedAt,
      credit: p.payment === 'credit',
    })),
    ...payments.map((p) => ({
      id: p.id,
      at: p.createdAt,
      label: t.suppliers.payment,
      cents: -p.amountCents,
      voided: false,
      credit: false,
    })),
  ].sort((a, b) => compareText(b.at, a.at));

  const chip = (selected: boolean) =>
    `min-h-12 rounded-xl border-2 px-2 text-sm font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

  return (
    <Sheet title={supplier.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-white p-3">
          <p className="text-sm font-semibold text-slate-600">{status.balanceCents < 0 ? t.suppliers.inFavour : t.suppliers.owes}</p>
          <Money cents={Math.abs(status.balanceCents)} className="block text-3xl font-extrabold" />
          {badge && <span className={`mt-1 inline-block rounded px-1.5 text-sm font-semibold ${badge.className}`}>{badge.text}</span>}
        </div>

        {status.balanceCents > 0 &&
          (paying ? (
            <div className="space-y-3 rounded-xl bg-white p-3">
              <Field
                label={t.suppliers.amount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                error={error}
              />
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.purchases.payment}>
                <button type="button" aria-pressed={fromCash} onClick={() => setFromCash(true)} className={chip(fromCash)}>
                  {t.suppliers.paidFromCash}
                </button>
                <button type="button" aria-pressed={!fromCash} onClick={() => setFromCash(false)} className={chip(!fromCash)}>
                  {t.suppliers.paidOtherwise}
                </button>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void pay(status.balanceCents)}>
                  {t.suppliers.payAll}
                </Button>
                <Button className="flex-1" onClick={() => void pay(parseKz(amount))}>
                  {t.common.confirm}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={() => setPaying(true)}>
              {t.suppliers.pay}
            </Button>
          ))}

        {orderLink ? (
          <>
            <LinkButton href={orderLink}>{t.suppliers.order}</LinkButton>
            <p className="text-sm text-slate-600">{t.suppliers.orderHint}</p>
          </>
        ) : (
          <p className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">
            {toOrder.length === 0 ? t.suppliers.orderNone : t.suppliers.noPhone}
          </p>
        )}

        <div className="space-y-2 rounded-xl bg-white p-3">
          <Field label={t.purchases.supplierName} value={name ?? supplier.name} onChange={(e) => setName(e.target.value)} />
          <Field
            label={t.purchases.supplierPhone}
            value={phone ?? supplier.phone ?? ''}
            type="tel"
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
          />
          {(name !== null || phone !== null) && (
            <Button className="w-full" onClick={() => void saveDetails()}>
              {t.suppliers.save}
            </Button>
          )}
        </div>

        {history.length > 0 && (
          <div>
            <h3 className="mb-1 font-bold">{t.suppliers.history}</h3>
            <ul className="divide-y divide-slate-100 rounded-xl bg-white">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 p-3 text-sm">
                  <span className={h.voided ? 'text-slate-400 line-through' : ''}>
                    <span className="font-semibold">{h.label}</span>
                    {h.credit ? ` · ${t.purchases.onCredit}` : ''}
                    <span className="block text-slate-600">{formatDateTime(h.at)}</span>
                  </span>
                  <span
                    className={`font-bold tabular-nums ${h.voided ? 'text-slate-400 line-through' : h.cents < 0 ? 'text-brand-700' : ''}`}
                  >
                    {h.cents < 0 ? '− ' : ''}
                    {formatKz(Math.abs(h.cents))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
