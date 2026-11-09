import { useEffect, useMemo, useRef, useState } from 'react';
import type { Store } from '../../data/store';
import { parseRanking, salesFrequency, serialiseRanking } from '../../domain/ranking';
import type { Product } from '../../domain/types';
import { addDays } from '../../lib/dates';

/**
 * Best sellers of the last 30 days, fixed when the screen opens (products never jump while the
 * shopkeeper taps). The ranking saved last time is used at once, so the products show without
 * first reading a month of sales; a fresh one is computed a moment later, for the next opening.
 * Without a usable saved ranking (first time, or the demo renewed its products) it waits for the fresh one.
 */
export function useFrozenRanking(store: Store, mode: string, products: Product[] | undefined): Map<string, number> | undefined {
  const key = `caixa.rank.${mode}`;
  const saved = useMemo(() => {
    try {
      return parseRanking(localStorage.getItem(key));
    } catch {
      return null;
    }
  }, [key]);
  const [fresh, setFresh] = useState<Map<string, number>>();
  const frozen = useRef<Map<string, number> | undefined>(undefined);
  const loaded = products !== undefined;
  const usable = !!saved && !!products && products.some((p) => saved.has(p.id));

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const id = setTimeout(
      () =>
        void store.sales.since(addDays(new Date(), -30).toISOString()).then((sales) => {
          if (cancelled) return;
          const ranking = salesFrequency(sales);
          try {
            localStorage.setItem(key, serialiseRanking(ranking));
          } catch {
            /* not saved: it is computed again next time */
          }
          setFresh(ranking);
        }),
      // With a usable saved ranking the screen is already sorted: refresh it a moment later, for next time.
      usable ? 2000 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [store, key, loaded, usable]);

  if (!frozen.current && products) {
    if (usable) frozen.current = saved!;
    else if (fresh) frozen.current = fresh;
  }
  return frozen.current;
}
