import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { BackgroundAlertItem } from '../domain/alerts';
import { creditBook } from '../domain/credit';
import { registerPeriodicCheck } from '../lib/notifications';
import type { Store } from '../data/store';

/**
 * Keeps, on the phone, the short list the background checker reads (public/sw-alerts.js):
 * who owes and by when. Always from the real shop, never from the demo.
 */
export function useBackgroundAlerts(realStore: Store) {
  const items = useLiveQuery(async () => {
    const [customers, sales, payments] = await Promise.all([
      realStore.customers.list(),
      realStore.sales.onCredit(),
      realStore.credit.payments(),
    ]);
    return creditBook(customers, sales, payments, new Date())
      .filter((b) => b.balanceCents > 0 && b.nextDueDate)
      .map((b): BackgroundAlertItem => ({ name: b.customer.name, dueDate: b.nextDueDate! }));
  }, [realStore]);

  useEffect(() => {
    if (items) void realStore.db.meta.put({ key: 'creditAlertItems', value: JSON.stringify(items) });
  }, [items, realStore]);

  useEffect(() => {
    void registerPeriodicCheck();
    // Tapping the notification asks the open app to show the customers, without reloading it.
    const onMessage = (e: MessageEvent) => {
      const data: unknown = e.data;
      if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'caixa-navigate') {
        const hash = (data as { hash?: unknown }).hash;
        if (typeof hash === 'string' && hash.startsWith('#/')) window.location.hash = hash;
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);
}
