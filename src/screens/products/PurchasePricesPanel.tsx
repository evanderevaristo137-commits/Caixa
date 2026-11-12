import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { lastPriceBySupplier, purchasePrices } from '../../domain/purchase-report';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatDate } from '../../lib/dates';
import { formatKz } from '../../lib/money';

/** At most this many recent purchases in the product detail. */
const RECENT = 5;

/** What the shop paid for this product, purchase by purchase, and which supplier was cheapest last time. */
export function PurchasePricesPanel({ product }: { product: Product }) {
  const { store } = useApp();
  const data = useLiveQuery(async () => {
    const [purchases, suppliers] = await Promise.all([store.purchases.list(), store.suppliers.list()]);
    return { rows: purchasePrices(product.id, purchases), names: new Map(suppliers.map((s) => [s.id, s.name])) };
  }, [store, product.id]);
  if (!data) return null;
  const price = (cents: number) => (product.soldBy === 'weight' ? t.buying.perKg(formatKz(cents)) : formatKz(cents));
  const name = (id?: string) => (id ? (data.names.get(id) ?? '—') : t.buying.noSupplier);
  const bySupplier = lastPriceBySupplier(data.rows);
  return (
    <div className="mt-5">
      <h3 className="mb-2 font-bold">{t.buying.pricesTitle}</h3>
      {data.rows.length === 0 ? (
        <p className="rounded-xl bg-white p-3 text-slate-600">{t.buying.pricesNone}</p>
      ) : (
        <>
          {bySupplier.length > 1 && (
            <p className="mb-2 rounded-xl bg-brand-50 p-3 font-semibold text-brand-900">
              {t.buying.cheapest(name(bySupplier[0]!.supplierId), price(bySupplier[0]!.lastCents))}
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-xl bg-white">
            {data.rows.slice(0, RECENT).map((r) => (
              <li key={r.purchaseId} className="flex justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{name(r.supplierId)}</span>
                  <span className="text-slate-600">{formatDate(r.at)}</span>
                </span>
                <span className="font-bold whitespace-nowrap tabular-nums">{price(r.unitCostCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
