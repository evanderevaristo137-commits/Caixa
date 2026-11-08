import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { creditBook, totalOutstanding } from '../../domain/credit';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Card, Empty, Money, Sheet, Skeleton } from '../../ui/kit';
import { CustomerSheet } from './CustomerSheet';
import { dueBadge, reminderLink } from './due';
import { CustomerPicker } from '../sell/CustomerPicker';

export default function CreditScreen() {
  const { store } = useApp();
  const data = useLiveQuery(async () => {
    const [customers, sales, payments, settings] = await Promise.all([
      store.customers.list(),
      store.sales.onCredit(),
      store.credit.payments(),
      store.settings.get(),
    ]);
    const now = new Date();
    return creditBook(customers, sales, payments, now).map((b) => ({
      ...b,
      // Quick "Lembrar" only when the payment is late, due today or due soon.
      remind: b.dueState === 'later' ? null : reminderLink(b, b.customer, settings.storeName, now),
    }));
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
          <li key={b.customer.id} className="flex items-stretch gap-2 rounded-xl bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setOpenId(b.customer.id)}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left active:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{b.customer.name}</p>
                {b.balanceCents > 0 ? (
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${dueBadge(b)?.className ?? ''}`}>
                    {dueBadge(b)?.text}
                  </span>
                ) : b.balanceCents < 0 ? (
                  <span className="text-sm font-semibold text-brand-700">{t.credit.inFavourShort(formatKz(-b.balanceCents))}</span>
                ) : (
                  <span className="text-sm text-slate-600">{t.credit.settled}</span>
                )}
              </div>
              {b.balanceCents > 0 && <Money cents={b.balanceCents} className="text-xl font-bold" />}
            </button>
            {b.remind && (
              <a
                href={b.remind}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void store.customers.markReminded(b.customer.id)}
                aria-label={`${t.credit.remindShort} ${b.customer.name}`}
                className="my-2 mr-2 flex min-w-16 flex-col items-center justify-center rounded-xl bg-[#15803d] px-2 text-xs font-semibold text-white active:bg-[#166534]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.8-.2 1.4Z" />
                </svg>
                {t.credit.remindShort}
              </a>
            )}
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
