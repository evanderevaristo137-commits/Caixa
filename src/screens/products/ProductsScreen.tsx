import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { t } from '../../i18n/pt-AO';
import { formatQuantity } from '../../domain/quantity';
import { formatKz } from '../../lib/money';
import { Button, Empty, normalise, Skeleton } from '../../ui/kit';
import { ProductSheet } from './ProductSheet';
import { LabelsSheet } from './LabelsSheet';
import { PurchasesView } from './PurchasesView';
import { SuppliersView } from './SuppliersView';

type View = 'products' | 'purchases' | 'suppliers';

/** Products, purchases (goods received) and suppliers, one tab each. */
export default function ProductsScreen() {
  // "A pagar a fornecedores" on Today opens the suppliers directly.
  const [view, setView] = useState<View>(() => {
    try {
      const wanted = sessionStorage.getItem('productsView');
      sessionStorage.removeItem('productsView');
      return wanted === 'suppliers' || wanted === 'purchases' ? wanted : 'products';
    } catch {
      return 'products';
    }
  });
  return (
    <div className="p-3">
      <div role="tablist" aria-label={t.products.title} className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1">
        {(['products', 'purchases', 'suppliers'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700'}`}
          >
            {t.products.views[v]}
          </button>
        ))}
      </div>
      {view === 'products' && <ProductsList />}
      {view === 'purchases' && <PurchasesView />}
      {view === 'suppliers' && <SuppliersView />}
    </div>
  );
}

function ProductsList() {
  const { store } = useApp();
  const products = useLiveQuery(() => store.products.list(), [store]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [labels, setLabels] = useState(false);

  const list = useMemo(() => {
    const q = normalise(query);
    return (products ?? []).filter((p) => !q || normalise(p.name).includes(q) || (p.barcode ?? '').startsWith(q));
  }, [products, query]);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.common.search}
          aria-label={t.common.search}
          className="min-h-12 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        />
        <Button onClick={() => setOpen('new')}>+ {t.products.add}</Button>
      </div>
      {products && products.length > 0 && (
        <Button variant="secondary" className="mb-3 w-full" onClick={() => setLabels(true)}>
          {t.labels.title}
        </Button>
      )}
      {!products ? (
        <Skeleton />
      ) : products.length === 0 ? (
        <Empty action={<Button onClick={() => setOpen('new')}>+ {t.products.add}</Button>}>{t.products.empty}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpen(p.id)}
                className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{p.name}</p>
                  <span className="text-slate-600 tabular-nums">
                    {p.soldBy === 'weight' ? t.weight.perKg(formatKz(p.priceCents)) : formatKz(p.priceCents)}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-sm font-bold ${p.stock <= 0 ? 'bg-red-100 text-red-800' : p.stock <= p.minStock ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}
                >
                  {t.products.inStock(formatQuantity(p.stock, p.soldBy))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <ProductSheet productId={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
      {labels && <LabelsSheet onClose={() => setLabels(false)} />}
    </div>
  );
}
