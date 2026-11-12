import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { expiringStock } from '../../domain/expiry';
import { t } from '../../i18n/pt-AO';
import { toLocalDateString } from '../../lib/dates';
import { Card } from '../../ui/kit';
import { ExpiryList } from '../products/ExpiryList';

/** At most this many lots on «Hoje»; the rest are in Produtos → Análise do stock → Validades. */
const FIRST = 5;

/** Lots expired or expiring within 30 days, for the products that follow their dates (nothing otherwise). */
export function ExpiryCard() {
  const { store } = useApp();
  const lines = useLiveQuery(async () => {
    const products = (await store.products.list()).filter((p) => p.tracksExpiry);
    if (products.length === 0) return [];
    return expiringStock(products, await store.batches.all(), toLocalDateString(new Date()));
  }, [store]);
  if (!lines || lines.length === 0) return null;
  return (
    <Card className="border-2 border-amber-300">
      <h2 className="font-bold">{t.expiry.card(lines.length)}</h2>
      <p className="mb-1 text-sm text-slate-600">{t.expiry.cardHint}</p>
      <div className="-mx-3">
        <ExpiryList lines={lines.slice(0, FIRST)} />
      </div>
      {lines.length > FIRST && <p className="mt-1 text-sm text-slate-600">{t.expiry.more(lines.length - FIRST)}</p>}
    </Card>
  );
}
