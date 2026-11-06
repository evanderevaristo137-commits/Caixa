import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { t } from '../../i18n/pt-AO';
import { Button, Empty, Money, normalise, Skeleton } from '../../ui/kit';
import { ProductSheet } from './ProductSheet';

export default function ProductsScreen() {
  const { store } = useApp();
  const products = useLiveQuery(() => store.products.list(), [store]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | 'new' | null>(null);

  const list = useMemo(() => {
    const q = normalise(query);
    return (products ?? []).filter((p) => !q || normalise(p.name).includes(q) || (p.barcode ?? '').startsWith(q));
  }, [products, query]);

  return (
    <div className="p-3">
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
      {!products ? (
        <Skeleton />
      ) : products.length === 0 ? (
        <Empty action={<Button onClick={() => setOpen('new')}>+ {t.products.add}</Button>}>{t.products.empty}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p.id)} className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{p.name}</p>
                  <Money cents={p.priceCents} className="text-slate-600" />
                </div>
                <span className={`rounded-full px-2 py-1 text-sm font-bold ${p.stock <= 0 ? 'bg-red-100 text-red-800' : p.stock <= p.minStock ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                  {t.products.inStock(p.stock)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <ProductSheet productId={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}
