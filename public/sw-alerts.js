/*
 * Payment reminders for the shopkeeper, run by Android in the background (Periodic Background Sync),
 * even when the app is closed. Loaded into the service worker with importScripts.
 * It only READS what the app prepared (meta key "creditAlertItems" in the real shop's database)
 * and shows at most one notification per day. Nothing leaves the phone.
 * Texts are in Portuguese here because this file is not part of the app bundle.
 */
/* eslint-disable */
const CAIXA_DB = 'caixa-loja';
const CAIXA_SOON_DAYS = 2;
const CAIXA_TAG = 'caixa-credit-alerts';

function caixaLocalDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function caixaAddDays(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  return caixaLocalDate(new Date(y, m - 1, d + days));
}

function caixaOpenDb() {
  return new Promise((resolve) => {
    const req = indexedDB.open(CAIXA_DB);
    // The shop's database does not exist yet: do not create it here.
    req.onupgradeneeded = () => req.transaction.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function caixaMeta(db, mode, fn) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains('meta')) return resolve(undefined);
    const tx = db.transaction('meta', mode);
    const req = fn(tx.objectStore('meta'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

async function caixaCheckAndNotify(force) {
  const db = await caixaOpenDb();
  if (!db) return;
  try {
    const today = caixaLocalDate(new Date());
    const last = await caixaMeta(db, 'readonly', (s) => s.get('alertsNotifiedOn'));
    if (!force && last && last.value === today) return;
    const row = await caixaMeta(db, 'readonly', (s) => s.get('creditAlertItems'));
    const items = row && typeof row.value === 'string' ? JSON.parse(row.value) : [];
    const soonLimit = caixaAddDays(today, CAIXA_SOON_DAYS);
    const overdue = items.filter((i) => i.dueDate < today).length;
    const dueToday = items.filter((i) => i.dueDate === today).length;
    const soon = items.filter((i) => i.dueDate > today && i.dueDate <= soonLimit).length;
    const parts = [];
    if (overdue) parts.push(overdue + ' em atraso');
    if (dueToday) parts.push(dueToday === 1 ? '1 vence hoje' : dueToday + ' vencem hoje');
    if (soon) parts.push(soon === 1 ? '1 vence nos próximos dias' : soon + ' vencem nos próximos dias');
    if (parts.length === 0) return;
    await self.registration.showNotification('Pagamentos de clientes', {
      body: parts.join(' · ') + '. Toque para ver e lembrar os clientes.',
      tag: CAIXA_TAG,
      icon: 'icon-192.png',
      data: { hash: '#/credit' },
    });
    await caixaMeta(db, 'readwrite', (s) => s.put({ key: 'alertsNotifiedOn', value: today }));
  } finally {
    db.close();
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === CAIXA_TAG) event.waitUntil(caixaCheckAndNotify(false));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.hash) || '#/credit';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (app) {
        // Change screen without reloading (a sale may be in progress).
        app.postMessage({ type: 'caixa-navigate', hash });
        return app.focus();
      }
      return self.clients.openWindow(new URL(hash, self.registration.scope).href);
    })(),
  );
});
