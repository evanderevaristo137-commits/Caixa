import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../app/context';
import { creditBook, totalOutstanding } from '../domain/credit';
import { summariseToday } from '../domain/today';
import { PAYMENT_METHODS } from '../domain/types';
import { methodLabel, t } from '../i18n/pt-AO';
import { addDays, startOfLocalDay } from '../lib/dates';
import { Card, Money, Skeleton } from '../ui/kit';

export default function TodayScreen() {
  const { store } = useApp();
  const data = useLiveQuery(async () => {
    const now = new Date();
    const since = addDays(startOfLocalDay(now), -1).toISOString();
    const [recent, products, customers, creditSales, payments] = await Promise.all([
      store.sales.since(since),
      store.products.list(),
      store.customers.list(),
      store.sales.onCredit(),
      store.credit.payments(),
    ]);
    return {
      summary: summariseToday(recent, products, now),
      owed: totalOutstanding(creditBook(customers, creditSales, payments, now)),
    };
  }, [store]);

  if (!data) return <Skeleton rows={4} />;
  const { summary, owed } = data;
  const { today, yesterday, diffCents, lowStock } = summary;
  const max = Math.max(1, ...PAYMENT_METHODS.map((m) => today.byMethod[m]));

  return (
    <div className="space-y-3 p-3">
      <Card className="bg-brand-700 text-white">
        <p className="text-sm font-semibold text-brand-100">{t.today.sold}</p>
        <Money cents={today.totalCents} className="block text-4xl font-extrabold" />
        <p className="mt-1 text-lg">{t.today.sales(today.count)}</p>
        <p className="mt-2 rounded-lg bg-white/15 px-3 py-2 text-base">
          {t.today.vsYesterday}: <Money cents={yesterday.totalCents} className="font-semibold" /> ({t.today.sales(yesterday.count)})
          <br />
          <span className="font-bold">
            {diffCents === 0 ? t.today.same : (
              <>
                {diffCents > 0 ? '▲ ' : '▼ '}
                <Money cents={Math.abs(diffCents)} /> {diffCents > 0 ? t.today.more : t.today.less}
              </>
            )}
          </span>
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">{t.today.byMethod}</h2>
        {today.count === 0 ? (
          <p className="text-slate-500">{t.today.noSales}</p>
        ) : (
          <ul className="space-y-2">
            {PAYMENT_METHODS.filter((m) => today.byMethod[m] > 0).map((m) => (
              <li key={m}>
                <div className="flex justify-between text-base">
                  <span>{methodLabel[m]}</span>
                  <Money cents={today.byMethod[m]} className="font-semibold" />
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${m === 'credit' ? 'bg-amber-500' : 'bg-brand-600'}`} style={{ width: `${(today.byMethod[m] / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <a href="#/credit" className="block">
        <Card className="flex items-center justify-between">
          <span className="font-bold">{t.today.creditTotal}</span>
          <Money cents={owed} className="text-xl font-extrabold text-amber-800" />
        </Card>
      </a>

      <Card>
        <h2 className="mb-2 font-bold">{t.today.lowStock}</h2>
        {lowStock.length === 0 ? (
          <p className="text-slate-500">{t.today.noLowStock}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span className="truncate pr-2">{p.name}</span>
                <span className={`font-bold whitespace-nowrap ${p.stock <= 0 ? 'text-red-700' : 'text-amber-700'}`}>
                  {p.stock} / {p.minStock}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
