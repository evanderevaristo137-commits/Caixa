import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { creditBook, totalOutstanding } from '../../domain/credit';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Card, Empty, Money, Sheet, Skeleton } from '../../ui/kit';
import { CustomerSheet } from './CustomerSheet';
import { daysClass } from './days';
import { CustomerPicker } from '../sell/CustomerPicker';

export default function CreditScreen() {
  const { store } = useApp();
  const data = useLiveQuery(async () => {
    const [customers, sales, payments] = await Promise.all([store.customers.list(), store.sales.onCredit(), store.credit.payments()]);
    return creditBook(customers, sales, payments, new Date());
  }, [store]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!data) return <Skeleton />;
  const owing = data.filter((b) => b.balanceCents > 0);
  const settled = data.filter((b) => b.balanceCents <= 0);

  return (
    <div className="p-3">
      <Card className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-600">{t.credit.totalOwed}</p>
          <Money cents={totalOutstanding(data)} className="text-3xl font-extrabold text-amber-800" />
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          + {t.credit.newCustomer}
        </Button>
      </Card>

      {owing.length === 0 && <Empty>{t.credit.empty}</Empty>}

      <ul className="space-y-2">
        {[...owing, ...settled].map((b) => (
          <li key={b.customer.id}>
            <button
              type="button"
              onClick={() => setOpenId(b.customer.id)}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{b.customer.name}</p>
                {b.balanceCents > 0 ? (
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${daysClass(b.daysOutstanding)}`}>
                    {t.credit.days(b.daysOutstanding ?? 0)}
                  </span>
                ) : b.balanceCents < 0 ? (
                  <span className="text-sm font-semibold text-brand-700">{t.credit.inFavourShort(formatKz(-b.balanceCents))}</span>
                ) : (
                  <span className="text-sm text-slate-600">{t.credit.settled}</span>
                )}
              </div>
              {b.balanceCents > 0 && <Money cents={b.balanceCents} className="text-xl font-bold" />}
            </button>
          </li>
        ))}
      </ul>

      {openId && <CustomerSheet customerId={openId} onClose={() => setOpenId(null)} />}
      {adding && (
        <Sheet title={t.credit.newCustomer} onClose={() => setAdding(false)}>
          <CustomerPicker
            onSelect={(c) => {
              setAdding(false);
              setOpenId(c.id);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
