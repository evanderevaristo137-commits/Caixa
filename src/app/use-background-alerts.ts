import { useEffect } from 'react';
import { ALERT_KEYS, digitalAlertInfo, dueItems } from '../data/background-alerts';
import { toLocalDateString } from '../lib/dates';
import { registerPeriodicCheck } from '../lib/notifications';
import type { Store } from '../data/store';

/**
 * Keeps, on the phone, the short lists the background checker reads (public/sw-alerts.js):
 * who owes and by when, what the shop owes its suppliers, and the digital payments alarm.
 * Always from the real shop, never from the demo.
 *
 * They only matter with the app closed, so they are prepared when the shop leaves the app
 * (screen off, another app): reading months of sales then never slows down a sale. Also once
 * when the phone is idle after opening, if the alarm is from another day (or after an update).
 */
export function useBackgroundAlerts(realStore: Store) {
  useEffect(() => {
    let running = false;
    let again = false;
    const prepare = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const now = new Date();
        const [due, digital] = await Promise.all([dueItems(realStore, now), digitalAlertInfo(realStore, now)]);
        await realStore.db.meta.bulkPut([
          { key: ALERT_KEYS.credit, value: JSON.stringify(due.credit) },
          { key: ALERT_KEYS.suppliers, value: JSON.stringify(due.suppliers) },
          { key: ALERT_KEYS.digital, value: JSON.stringify(digital) },
        ]);
      } catch {
        /* the lists of last time stay; tried again when the app is left again */
      } finally {
        running = false;
        if (again) {
          again = false;
          void prepare();
        }
      }
    };
    const onLeave = () => {
      if (document.visibilityState === 'hidden') void prepare();
    };
    const prepareIfOld = async () => {
      let on: unknown;
      try {
        const row = await realStore.db.meta.get(ALERT_KEYS.digital);
        on = typeof row?.value === 'string' ? (JSON.parse(row.value) as { on?: unknown }).on : undefined;
      } catch {
        on = undefined;
      }
      if (on !== toLocalDateString(new Date())) await prepare();
    };
    document.addEventListener('visibilitychange', onLeave);
    window.addEventListener('pagehide', onLeave);
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(() => void prepareIfOld(), { timeout: 15_000 })
        : window.setTimeout(() => void prepareIfOld(), 5_000);
    return () => {
      document.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('pagehide', onLeave);
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [realStore]);

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
