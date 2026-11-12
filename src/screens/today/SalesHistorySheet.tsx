import { useId, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { periodRange, SALE_PERIODS, searchSales, searchTotals, type SalePeriod, type SaleState } from '../../domain/sale-search';
import { comparePt } from '../../domain/ranking';
import { PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Field, Sheet, Skeleton } from '../../ui/kit';
import { SaleRow } from './SaleRow';
import { SaleSheet } from './SaleSheet';

/** How many sales are drawn at once; "Ver mais" draws the next ones (lists stay light on cheap phones). */
const PAGE = 50;
const STATES: SaleState[] = ['all', 'valid', 'voided'];

const chip = (on: boolean) =>
  `min-h-11 shrink-0 rounded-full border-2 px-3 text-sm font-semibold whitespace-nowrap ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/** "Procurar vendas": the sales of a period, by product, sale number, customer, payment method or state. */
export function SalesHistorySheet({ onClose }: { onClose: () => void }) {
  const { store } = useApp();
  const [period, setPeriod] = useState<SalePeriod>('7d');
  const [method, setMethod] = useState<PaymentMethod | undefined>();
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [state, setState] = useState<SaleState>('all');
  const [text, setText] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const customerField = useId();

  const data = useLiveQuery(async () => {
    const { from, to } = periodRange(period, new Date());
    const [sales, customers] = await Promise.all([store.sales.between(from.toISOString(), to.toISOString()), store.customers.list()]);
    return { period, sales, names: new Map(customers.map((c) => [c.id, c.name])) };
  }, [store, period]);

  const found = useMemo(
    () => (data ? searchSales(data.sales, { period, method, customerId, state, text }, (id) => data.names.get(id)) : []),
    [data, period, method, customerId, state, text],
  );
  // Only the methods and customers that appear in the period.
  const methods = useMemo(() => PAYMENT_METHODS.filter((m) => data?.sales.some((s) => s.method === m)), [data]);
  const customers = useMemo(() => {
    const ids = new Set(data?.sales.flatMap((s) => (s.customerId ? [s.customerId] : [])));
    return [...ids].map((id) => ({ id, name: data?.names.get(id) ?? '—' })).sort((a, b) => comparePt(a.name, b.name));
  }, [data]);
  const totals = searchTotals(found);
  const reset = () => setShown(PAGE);
  const multiDay = period === '7d' || period === '30d';

  return (
    <Sheet title={t.history.title} onClose={onClose}>
      <div className="space-y-3">
        <Field
          label={t.history.search}
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            reset();
          }}
          autoComplete="off"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t.history.period}>
          {SALE_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              className={chip(period === p)}
              onClick={() => {
                setPeriod(p);
                setCustomerId(undefined);
                reset();
              }}
            >
              {t.history.periods[p]}
            </button>
          ))}
        </div>
        {methods.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t.history.method}>
            <button
              type="button"
              aria-pressed={!method}
              className={chip(!method)}
              onClick={() => {
                setMethod(undefined);
                reset();
              }}
            >
              {t.history.allMethods}
            </button>
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                className={chip(method === m)}
                onClick={() => {
                  setMethod(m);
                  reset();
                }}
              >
                {methodLabel[m]}
              </button>
            ))}
          </div>
        )}
        {customers.length > 0 && (
          <div>
            <label htmlFor={customerField} className="mb-1 block text-sm font-semibold text-slate-700">
              {t.history.customer}
            </label>
            <select
              id={customerField}
              value={customerId ?? ''}
              onChange={(e) => {
                setCustomerId(e.target.value || undefined);
                reset();
              }}
              className="min-h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-base"
            >
              <option value="">{t.history.allCustomers}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2" role="group" aria-label={t.history.stateLabel}>
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={state === s}
              className={chip(state === s)}
              onClick={() => {
                setState(s);
                reset();
              }}
            >
              {t.history.states[s]}
            </button>
          ))}
        </div>

        {!data || data.period !== period ? (
          <Skeleton rows={4} />
        ) : found.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-center text-slate-600">{t.history.none}</p>
        ) : (
          <>
            <p role="status" className="rounded-xl bg-white p-3 font-semibold">
              {t.history.summary(totals.count, formatKz(totals.totalCents))}
              {totals.voided > 0 && <span className="block text-sm font-normal text-slate-600">{t.history.voided(totals.voided)}</span>}
            </p>
            <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
              {found.slice(0, shown).map((s) => (
                <li key={s.id}>
                  <SaleRow
                    sale={s}
                    withDate={multiDay}
                    customerName={s.customerId ? data.names.get(s.customerId) : undefined}
                    onOpen={() => setOpenId(s.id)}
                  />
                </li>
              ))}
            </ul>
            {found.length > shown && (
              <Button variant="secondary" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
                {t.history.more(Math.min(PAGE, found.length - shown))}
              </Button>
            )}
          </>
        )}
      </div>
      {openId && <SaleSheet saleId={openId} onClose={() => setOpenId(null)} />}
    </Sheet>
  );
}
