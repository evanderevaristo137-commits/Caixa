import { useEffect } from 'react';
import { ALERT_KEYS, digitalAlertInfo, dueItems, inssAlert } from '../data/background-alerts';
import { toLocalDateString } from '../lib/dates';
import { recordError } from '../lib/error-log';
import { registerPeriodicCheck } from '../lib/notifications';
import { ACCOUNTS_CHECKED_KEY, type Store } from '../data/store';

/**
 * Keeps, on the phone, the short lists the background checker reads (public/sw-alerts.js):
 * who owes and by when, what the shop owes its suppliers, the digital payments alarm and the
 * owner's INSS contribution of last month.
 * Always from the real shop, never from the demo.
 *
 * They only matter with the app closed, so they are prepared when the shop leaves the app
 * (screen off, another app): reading months of sales then never slows down a sale. Also once
 * when the phone is idle after opening, if the alarm is from another day (or after an update).
 *
 * Also once a day when idle: the customers' saved accounts are checked against their sales and
 * payments, and built again if any ever differs (that would be a mistake of the app: it goes to the
 * error log, so the pilot summary counts it).
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
        const [due, digital, inss] = await Promise.all([
          dueItems(realStore, now),
          digitalAlertInfo(realStore, now),
          inssAlert(realStore, now),
        ]);
        await realStore.db.meta.bulkPut([
          { key: ALERT_KEYS.credit, value: JSON.stringify(due.credit) },
          { key: ALERT_KEYS.suppliers, value: JSON.stringify(due.suppliers) },
          { key: ALERT_KEYS.digital, value: JSON.stringify(digital) },
          { key: ALERT_KEYS.inss, value: JSON.stringify(inss) },
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
    const checkAccountsIfOld = async () => {
      const today = toLocalDateString(new Date());
      try {
        if ((await realStore.db.meta.get(ACCOUNTS_CHECKED_KEY))?.value === today) return;
        const differed = await realStore.integrity.reconcileAccounts();
        await realStore.db.meta.put({ key: ACCOUNTS_CHECKED_KEY, value: today });
        if (differed > 0) recordError('accounts', new Error(`${differed} customer account(s) rebuilt from the sales and payments`));
      } catch {
        /* tried again the next time the app opens */
      }
    };
    document.addEventListener('visibilitychange', onLeave);
    window.addEventListener('pagehide', onLeave);
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(() => void prepareIfOld().then(checkAccountsIfOld), { timeout: 15_000 })
        : window.setTimeout(() => void prepareIfOld().then(checkAccountsIfOld), 5_000);
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
