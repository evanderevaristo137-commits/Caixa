import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { stillProducts } from '../../domain/stock-insights';
import { bestWeekday, lostCustomers, stillMoney, SUGGEST, type BelowCost } from '../../domain/suggestions';
import type { Customer } from '../../domain/types';
import { addDays, addDaysToDateString, startOfLocalDay, toLocalDateString } from '../../lib/dates';

/** What months of sales say, worked out at most once a day and kept on the phone. */
interface Daily {
  day: string;
  lost: { id: string; purchases: number; daysAway: number }[];
  still: { count: number; valueCents: number } | null;
  weekday: { weekday: number; aboveBp: number } | null;
}

export type Suggestion =
  | { key: string; kind: 'below_cost'; items: BelowCost[] }
  | { key: string; kind: 'lost'; items: { customer: Customer; purchases: number; daysAway: number }[] }
  | { key: string; kind: 'still'; count: number; valueCents: number }
  | { key: string; kind: 'weekday'; weekday: number; aboveBp: number };

const dailyKey = (mode: string) => `caixa.suggestions.${mode}`;
const seenKey = (mode: string) => `caixa.suggestions.seen.${mode}`;

function read<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage, the suggestions are worked out again next time.
  }
}

/** Shown again after this many days when the owner taps «Já vi». */
const HIDE_DAYS = 7;

/**
 * The shop's suggestions on «Hoje». Products below their cost are checked with the day's numbers (a
 * cheap read). The others read months of sales: worked out a few seconds after «Hoje» opens, at most
 * once a day, and kept on the phone (so «Hoje» never waits for them).
 */
export function useSuggestions(below: BelowCost[]): { list: Suggestion[]; hide: (key: string) => void } {
  const { store, mode } = useApp();
  const today = toLocalDateString(new Date());
  const [daily, setDaily] = useState<Daily | null>(() => read<Daily>(dailyKey(mode)));
  const [seen, setSeen] = useState<Record<string, string>>(() => read<Record<string, string>>(seenKey(mode)) ?? {});

  useEffect(() => {
    if (daily?.day === today) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const now = new Date();
        const [customers, credit, products, speeds, sales] = await Promise.all([
          store.customers.list(),
          store.sales.onCredit(),
          store.products.list(),
          store.sales.speeds(now),
          store.sales.since(addDays(startOfLocalDay(now), -7 * SUGGEST.weekdayWeeks).toISOString()),
        ]);
        const fresh: Daily = {
          day: toLocalDateString(now),
          lost: lostCustomers(customers, credit, now).map((l) => ({ id: l.customer.id, purchases: l.purchases, daysAway: l.daysAway })),
          still: stillMoney(stillProducts(products, speeds, now)),
          weekday: bestWeekday(sales, now),
        };
        write(dailyKey(mode), fresh);
        setDaily(fresh);
      })();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [daily, today, store, mode]);

  // Names as they are now (the daily list keeps only ids).
  const customers = useLiveQuery(
    async () =>
      daily && daily.lost.length > 0 ? new Map((await store.customers.list()).map((c) => [c.id, c])) : new Map<string, Customer>(),
    [store, daily],
  );

  const list: Suggestion[] = [];
  if (below.length > 0) {
    list.push({
      key: `below:${below
        .map((b) => b.product.id)
        .sort()
        .join(',')}`,
      kind: 'below_cost',
      items: below,
    });
  }
  if (daily?.day === today) {
    const lost = daily.lost.flatMap((l) => {
      const customer = customers?.get(l.id);
      return customer ? [{ customer, purchases: l.purchases, daysAway: l.daysAway }] : [];
    });
    if (lost.length > 0)
      list.push({
        key: `lost:${lost
          .map((l) => l.customer.id)
          .sort()
          .join(',')}`,
        kind: 'lost',
        items: lost,
      });
    if (daily.still) list.push({ key: 'still', kind: 'still', ...daily.still });
    if (daily.weekday) list.push({ key: `weekday:${daily.weekday.weekday}`, kind: 'weekday', ...daily.weekday });
  }

  const hide = (key: string) => {
    const next = { ...seen, [key]: addDaysToDateString(today, HIDE_DAYS) };
    write(seenKey(mode), next);
    setSeen(next);
  };
  return { list: list.filter((s) => !(seen[s.key] && seen[s.key]! > today)), hide };
}
