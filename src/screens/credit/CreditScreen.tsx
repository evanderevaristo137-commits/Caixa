import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { totalOutstanding } from '../../domain/credit';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Card, Empty, Money, Sheet, Skeleton } from '../../ui/kit';
import { CustomerSheet } from './CustomerSheet';
import { dueBadge, reminderLink } from './due';
import { CustomerPicker } from '../sell/CustomerPicker';
import { DebtorsSheet } from './DebtorsSheet';
import { byCustomer, customerPunctuality } from '../../domain/debtors';
import { toLocalDateString } from '../../lib/dates';
import { ShowMore, usePaged } from '../../ui/paged';

/** Customers drawn at once; «Ver mais» draws the next ones. */
const CUSTOMERS_PAGE = 40;

export default function CreditScreen() {
  const { store } = useApp();
  // The list comes from the customers' saved accounts (one short row each): it shows at once.
  const data = useLiveQuery(async () => {
    const now = new Date();
    const [book, settings] = await Promise.all([store.credit.book(now), store.settings.get()]);
    return {
      book: book.map((b) => ({
        ...b,
        // Quick "Lembrar" only when the payment is late, due today or due soon.
        remind: b.dueState === 'later' ? null : reminderLink(b, b.customer, settings.storeName, now),
      })),
    };
  }, [store]);
  // Who usually pays late (only said with enough history) needs every credit sale and payment:
  // read once the list is on the screen, so the list appears as fast as it can on a cheap phone.
  const listed = data !== undefined;
  const history = useLiveQuery(
    async () => (listed ? { sales: await store.sales.onCredit(), payments: await store.credit.payments() } : undefined),
    [store, listed],
  );
  const poorPayers = useMemo(() => {
    if (!data || !history) return new Set<string>();
    const today = toLocalDateString(new Date());
    const salesOf = byCustomer(history.sales);
    const paymentsOf = byCustomer(history.payments);
    return new Set(
      data.book
        .filter(
          (b) =>
            b.balanceCents > 0 &&
            customerPunctuality(salesOf.get(b.customer.id) ?? [], paymentsOf.get(b.customer.id) ?? [], today).verdict === 'poor',
        )
        .map((b) => b.customer.id),
    );
  }, [data, history]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [report, setReport] = useState(false);
  const owing = useMemo(() => (data?.book ?? []).filter((b) => b.balanceCents > 0), [data]);
  const list = useMemo(() => [...owing, ...(data?.book ?? []).filter((b) => b.balanceCents <= 0)], [data, owing]);
  const paged = usePaged(list, CUSTOMERS_PAGE);

  if (!data) return <Skeleton />;

  return (
    <div className="p-3">
      <Card className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-600">{t.credit.totalOwed}</p>
          <Money cents={totalOutstanding(data.book)} className="text-3xl font-extrabold text-amber-800" />
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          + {t.credit.newCustomer}
        </Button>
      </Card>

      {owing.length > 0 && (
        <Button variant="secondary" className="mb-3 w-full" onClick={() => setReport(true)}>
          {t.debtors.open}
        </Button>
      )}
      {owing.length === 0 && <Empty>{t.credit.empty}</Empty>}

      <ul className="space-y-2">
        {paged.visible.map((b) => (
          <li key={b.customer.id} className="flex items-stretch gap-2 rounded-xl bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setOpenId(b.customer.id)}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left active:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{b.customer.name}</p>
                {b.balanceCents > 0 ? (
                  <>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${dueBadge(b)?.className ?? ''}`}>
                      {dueBadge(b)?.text}
                    </span>
                    {poorPayers.has(b.customer.id) && (
                      <span className="ml-1 text-sm font-semibold text-red-700">{t.punctuality.verdict.poor}</span>
                    )}
                  </>
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

      <ShowMore rest={paged.rest} page={CUSTOMERS_PAGE} onClick={paged.more} className="mt-3" />
      {openId && <CustomerSheet customerId={openId} onClose={() => setOpenId(null)} />}
      {report && <DebtorsSheet onClose={() => setReport(false)} />}
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
