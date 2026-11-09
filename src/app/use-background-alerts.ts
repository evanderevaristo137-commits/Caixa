import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ALERT_KEYS, digitalAlertInfo, dueItems } from '../data/background-alerts';
import { registerPeriodicCheck } from '../lib/notifications';
import type { Store } from '../data/store';

/**
 * Keeps, on the phone, the short lists the background checker reads (public/sw-alerts.js):
 * who owes and by when, what the shop owes its suppliers, and the digital payments alarm.
 * Always from the real shop, never from the demo.
 */
export function useBackgroundAlerts(realStore: Store) {
  const due = useLiveQuery(() => dueItems(realStore, new Date()), [realStore]);
  useEffect(() => {
    if (!due) return;
    void realStore.db.meta.bulkPut([
      { key: ALERT_KEYS.credit, value: JSON.stringify(due.credit) },
      { key: ALERT_KEYS.suppliers, value: JSON.stringify(due.suppliers) },
    ]);
  }, [due, realStore]);

  // The digital alarm looks at complete days only: computed when the app opens and when the
  // contract minimum changes, not after every sale.
  const minShare = useLiveQuery(() => realStore.settings.get().then((s) => s.digitalMinShareBp ?? null), [realStore]);
  useEffect(() => {
    if (minShare === undefined) return;
    let cancelled = false;
    void digitalAlertInfo(realStore, new Date()).then((info) => {
      if (!cancelled) void realStore.db.meta.put({ key: ALERT_KEYS.digital, value: JSON.stringify(info) });
    });
    return () => {
      cancelled = true;
    };
  }, [minShare, realStore]);

  useEffect(() => {
    void registerPeriodicCheck();
    // Tapping the notification asks the open app to show the right screen, without reloading it.
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
