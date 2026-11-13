import { useState } from 'react';
import { useApp } from '../../app/context';
import { shoppingListText } from '../../domain/messages';
import { formatQuantity } from '../../domain/quantity';
import { restockList, stillProducts, type RestockLine, type StillProduct } from '../../domain/stock-insights';
import { whatsAppLink } from '../../domain/whatsapp';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { LinkButton, Sheet, Skeleton } from '../../ui/kit';
import { useLoaded } from '../../ui/use-loaded';
import { StockLossesView } from './StockLossesView';
import { ExpiryList } from './ExpiryList';
import { expiringStock } from '../../domain/expiry';
import { toLocalDateString } from '../../lib/dates';
import { stockDoc } from '../../domain/report-doc';
import { ReportButton } from '../../ui/ReportPrint';

type View = 'buy' | 'still' | 'losses' | 'expiry';

/**
 * «Análise do stock»: what to buy by the speed of sale, products standing still (money on the
 * shelf) and the losses. Read once when it opens: a month of sales is thousands of records.
 */
export function StockInsightsSheet({ onClose, initialView = 'buy' }: { onClose: () => void; initialView?: View }) {
  const { store } = useApp();
  const [view, setView] = useState<View>(initialView);
  const data = useLoaded(async () => {
    const now = new Date();
    const [products, speeds, settings, batches] = await Promise.all([
      store.products.list(),
      store.sales.speeds(now),
      store.settings.get(),
      store.batches.all(),
    ]);
    const buy = restockList(products, speeds);
    return {
      products,
      buy,
      // Only shops that follow expiry dates see that tab.
      tracked: products.some((p) => p.tracksExpiry),
      expiring: expiringStock(products, batches, toLocalDateString(now), 60),
      still: stillProducts(products, speeds, now),
      minOf: new Map(products.map((p) => [p.id, p.minStock])),
      list: whatsAppLink(shoppingListText(settings.storeName, buy, now)),
    };
  }, [store]);

  return (
    <Sheet title={t.stockInsights.title} onClose={onClose}>
      <div
        role="tablist"
        aria-label={t.stockInsights.title}
        className={`mb-3 grid gap-1 rounded-xl bg-slate-200 p-1 ${data?.tracked ? 'grid-cols-4' : 'grid-cols-3'}`}
      >
        {(data?.tracked ? (['buy', 'still', 'losses', 'expiry'] as const) : (['buy', 'still', 'losses'] as const)).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700'}`}
          >
            {v === 'expiry' ? t.expiry.tab : t.stockInsights.views[v]}
          </button>
        ))}
      </div>
      {view === 'losses' ? (
        <StockLossesView />
      ) : !data ? (
        <Skeleton rows={4} />
      ) : view === 'buy' ? (
        <BuyView lines={data.buy} minOf={data.minOf} listLink={data.list} />
      ) : view === 'expiry' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t.expiry.tabHint}</p>
          <ExpiryList lines={data.expiring} empty={t.expiry.tabNone} />
        </div>
      ) : (
        <StillView rows={data.still} />
      )}
      {data && (
        <div className="mt-4 space-y-1">
          <ReportButton build={(head) => stockDoc({ products: data.products, buy: data.buy, still: data.still }, head)} />
          <p className="text-center text-sm text-slate-600">{t.reportDoc.stockHint}</p>
        </div>
      )}
    </Sheet>
  );
}

function BuyView({ lines, minOf, listLink }: { lines: RestockLine[]; minOf: Map<string, number>; listLink: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t.stockInsights.buyHint}</p>
      {lines.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.stockInsights.buyNone}</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {lines.map((l) => (
              <li key={l.productId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{l.name}</span>
                  <span
                    className={`text-sm ${l.daysLeft !== undefined && l.daysLeft <= 2 ? 'font-semibold text-red-700' : 'text-slate-600'}`}
                  >
                    {t.stockInsights.has(formatQuantity(Math.max(0, l.stock), l.soldBy))} ·{' '}
                    {l.daysLeft !== undefined
                      ? t.stockInsights.endsIn(l.daysLeft)
                      : t.stockInsights.low(formatQuantity(minOf.get(l.productId) ?? 0, l.soldBy))}
                  </span>
                </span>
                <span className="text-right font-bold whitespace-nowrap">{t.stockInsights.buy(formatQuantity(l.suggested, l.soldBy))}</span>
              </li>
            ))}
          </ul>
          <LinkButton href={listLink}>{t.stockInsights.sendList}</LinkButton>
        </>
      )}
    </div>
  );
}

function StillView({ rows }: { rows: StillProduct[] }) {
  const totalCents = rows.reduce((a, r) => a + (r.valueCents ?? 0), 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t.stockInsights.stillHint}</p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.stockInsights.stillNone}</p>
      ) : (
        <>
          <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-950">
            {t.stockInsights.stillTotal(rows.length, formatKz(totalCents))}
          </p>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {rows.map(({ product: p, valueCents }) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-sm text-slate-600">{t.stockInsights.has(formatQuantity(p.stock, p.soldBy))}</span>
                </span>
                <span className="text-right whitespace-nowrap">
                  {valueCents === undefined ? (
                    <span className="text-sm text-slate-500">{t.stockInsights.stillNoCost}</span>
                  ) : (
                    <span className="font-bold">{formatKz(valueCents)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
