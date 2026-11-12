import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { dueDateFromTerm, DEFAULT_TERM_DAYS } from '../../domain/credit';
import { purchaseLineTotal } from '../../domain/purchases';
import { formatKg, parseWeight } from '../../domain/quantity';
import { restockList } from '../../domain/today';
import { PURCHASE_PAYMENTS, type Product, type PurchasePayment } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Money, normalise, Sheet } from '../../ui/kit';
import { TermPicker } from '../sell/TermPicker';

interface Line {
  product: Product;
  qty: string;
  cost: string;
}

const kzText = (cents: number | undefined) => (cents === undefined ? '' : formatKz(cents).replace(' Kz', ''));
const parseQty = (p: Product, text: string) =>
  p.soldBy === 'weight' ? parseWeight(text) : /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;

/** Goods received from a supplier: products, quantities and costs, and how it was paid. */
export function NewPurchaseSheet({ onClose }: { onClose: () => void }) {
  const { store, showToast } = useApp();
  const data = useLiveQuery(async () => ({ products: await store.products.list(), suppliers: await store.suppliers.list() }), [store]);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [newSupplier, setNewSupplier] = useState<{ name: string; phone: string } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [payment, setPayment] = useState<PurchasePayment>('cash');
  const [dueDate, setDueDate] = useState(() => dueDateFromTerm(DEFAULT_TERM_DAYS, new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const products = useMemo(() => data?.products ?? [], [data]);
  const found = useMemo(() => {
    const q = normalise(query);
    return products.filter((p) => !lines.some((l) => l.product.id === p.id) && (!q || normalise(p.name).includes(q))).slice(0, 30);
  }, [products, lines, query]);

  const addLine = (p: Product, qty?: number) => {
    const qtyText = qty === undefined ? '' : p.soldBy === 'weight' ? formatKg(qty) : String(qty);
    setLines((ls) => [...ls, { product: p, qty: qtyText, cost: kzText(p.costCents) }]);
    setPicking(false);
    setQuery('');
    setError(null);
  };

  const addLow = () => {
    const chosen = supplierId;
    const candidates = restockList(products).filter((r) => !lines.some((l) => l.product.id === r.productId));
    for (const r of candidates) {
      const p = products.find((x) => x.id === r.productId)!;
      // With a supplier chosen, only what is usually bought from them (or from nobody yet).
      if (chosen && p.supplierId && p.supplierId !== chosen) continue;
      addLine(p, r.suggested);
    }
  };

  const parsed = lines.map((l) => {
    const quantity = parseQty(l.product, l.qty);
    const unitCostCents = parseKz(l.cost);
    const ok = quantity !== null && quantity > 0 && unitCostCents !== null;
    return {
      ok,
      quantity,
      unitCostCents,
      total: ok ? purchaseLineTotal({ quantity: quantity!, unitCostCents: unitCostCents!, soldBy: l.product.soldBy }) : 0,
    };
  });
  const total = parsed.reduce((a, l) => a + l.total, 0);

  const confirm = async () => {
    if (lines.length === 0) return setError(t.purchases.emptyLines);
    if (parsed.some((l) => !l.ok)) return setError(t.purchases.invalidLine);
    if (payment === 'credit' && !supplierId && !newSupplier?.name.trim()) return setError(t.purchases.creditNeedsSupplier);
    setBusy(true);
    try {
      let sid = supplierId;
      if (newSupplier?.name.trim()) sid = (await store.suppliers.create(newSupplier.name, newSupplier.phone)).id;
      await store.purchases.create({
        supplierId: sid,
        lines: lines.map((l, i) => ({ productId: l.product.id, quantity: parsed[i]!.quantity!, unitCostCents: parsed[i]!.unitCostCents! })),
        payment,
        dueDate: payment === 'credit' ? dueDate : undefined,
        note,
      });
      showToast(t.purchases.saved);
      onClose();
    } catch (e) {
      setError(e instanceof DomainError && e.code === 'supplier_required' ? t.purchases.creditNeedsSupplier : t.errors.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const chip = (selected: boolean) =>
    `min-h-12 rounded-xl border-2 px-3 text-sm font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

  return (
    <Sheet title={t.purchases.add} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t.purchases.supplier}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.purchases.supplier}>
            <button
              type="button"
              aria-pressed={!supplierId && !newSupplier}
              onClick={() => {
                setSupplierId(undefined);
                setNewSupplier(null);
              }}
              className={chip(!supplierId && !newSupplier)}
            >
              {t.purchases.noSupplier}
            </button>
            {(data?.suppliers ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={supplierId === s.id}
                onClick={() => {
                  setSupplierId(s.id);
                  setNewSupplier(null);
                }}
                className={chip(supplierId === s.id)}
              >
                {s.name}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={!!newSupplier}
              onClick={() => {
                setSupplierId(undefined);
                setNewSupplier({ name: '', phone: '' });
              }}
              className={chip(!!newSupplier)}
            >
              {t.purchases.newSupplier}
            </button>
          </div>
          {newSupplier && (
            <div className="mt-2 space-y-2 rounded-xl bg-white p-3">
              <Field
                label={t.purchases.supplierName}
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
              />
              <Field
                label={t.purchases.supplierPhone}
                value={newSupplier.phone}
                type="tel"
                inputMode="tel"
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
              />
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t.purchases.products}</p>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={l.product.id} className="rounded-xl bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">{l.product.name}</span>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="min-h-11 rounded-lg px-2 text-sm font-semibold text-red-700 active:bg-red-50"
                  >
                    {t.purchases.remove}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label={l.product.soldBy === 'weight' ? t.purchases.qtyKg : t.purchases.qty}
                    value={l.qty}
                    inputMode={l.product.soldBy === 'weight' ? 'decimal' : 'numeric'}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                  />
                  <Field
                    label={l.product.soldBy === 'weight' ? t.purchases.unitCostKg : t.purchases.unitCost}
                    value={l.cost}
                    inputMode="decimal"
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))}
                  />
                </div>
                {parsed[i]!.ok && <Money cents={parsed[i]!.total} className="mt-1 block text-right font-semibold" />}
              </li>
            ))}
          </ul>
          {picking ? (
            <div className="mt-2 space-y-2 rounded-xl bg-white p-3">
              <input
                type="search"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.common.search}
                aria-label={t.purchases.pickProduct}
                className="min-h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
              />
              <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
                {found.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addLine(p)}
                      className="min-h-12 w-full px-2 text-left font-semibold active:bg-slate-50"
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setPicking(true)}>
                {t.purchases.addProduct}
              </Button>
              <Button variant="secondary" onClick={addLow}>
                {t.purchases.addLow}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white p-3">
          <span className="font-semibold">{t.purchases.total}</span>
          <Money cents={total} className="text-2xl font-extrabold" />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t.purchases.payment}</p>
          <div className="grid grid-cols-1 gap-2" role="group" aria-label={t.purchases.payment}>
            {PURCHASE_PAYMENTS.map((m) => (
              <button key={m} type="button" aria-pressed={payment === m} onClick={() => setPayment(m)} className={chip(payment === m)}>
                {t.purchases.payments[m]}
              </button>
            ))}
          </div>
        </div>
        {payment === 'credit' && <TermPicker value={dueDate} onChange={setDueDate} />}
        <Field label={t.purchases.note} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        {error && <p className="font-medium text-red-700">{error}</p>}
        <Button big className="w-full" disabled={busy} onClick={() => void confirm()}>
          {t.purchases.confirm}
        </Button>
      </div>
    </Sheet>
  );
}
