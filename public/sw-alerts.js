/*
 * Reminders for the shopkeeper, run by Android in the background (Periodic Background Sync),
 * even when the app is closed. Loaded into the service worker with importScripts.
 * It only READS what the app prepared in the real shop's database (meta keys "creditAlertItems",
 * "supplierAlertItems", "digitalAlert" and "inssAlert", see src/data/background-alerts.ts) and shows at most
 * one notification per day. Nothing leaves the phone.
 * caixaDailyAlert must say exactly what dailyAlert in src/domain/alerts.ts says (a test compares them).
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

function caixaPct(bp) {
  return Math.round(bp / 100) + '%';
}

function caixaDueText(items, today) {
  const soonLimit = caixaAddDays(today, CAIXA_SOON_DAYS);
  const overdue = items.filter((i) => i.dueDate < today).length;
  const dueToday = items.filter((i) => i.dueDate === today).length;
  const soon = items.filter((i) => i.dueDate > today && i.dueDate <= soonLimit).length;
  const parts = [];
  if (overdue) parts.push(overdue + ' em atraso');
  if (dueToday) parts.push(dueToday === 1 ? '1 vence hoje' : dueToday + ' vencem hoje');
  if (soon) parts.push(soon === 1 ? '1 vence nos próximos dias' : soon + ' vencem nos próximos dias');
  return parts.join(' · ');
}

function caixaInssText(inss, today) {
  if (!inss || today < inss.from || today > inss.until) return '';
  if (today < inss.dueDate) return 'pagar a contribuição de ' + inss.label + ' até dia ' + Number(inss.dueDate.slice(8, 10));
  if (today === inss.dueDate) return 'a contribuição de ' + inss.label + ' vence hoje';
  return 'contribuição de ' + inss.label + ' em atraso';
}

/** The one notification of the day, or null. Same rules as dailyAlert in src/domain/alerts.ts. */
function caixaDailyAlert(today, credit, suppliers, digital, inss) {
  const sections = [];
  const customers = caixaDueText(credit, today);
  if (customers) sections.push({ title: 'Pagamentos de clientes', label: 'Clientes', text: customers, hash: '#/credit' });
  const owed = caixaDueText(suppliers, today);
  if (owed) sections.push({ title: 'Pagamentos a fornecedores', label: 'Fornecedores', text: owed, hash: '#/today' });
  const fresh = !!digital && (digital.on === today || digital.on === caixaAddDays(today, -1));
  if (fresh && digital.alarm) {
    const text =
      digital.belowMinimum && typeof digital.minShareBp === 'number'
        ? 'abaixo do mínimo do contrato: ' + caixaPct(digital.shareBp) + ' (mínimo ' + caixaPct(digital.minShareBp) + ')'
        : 'desceram muito nos últimos 7 dias: ' + caixaPct(digital.shareBp) + ' dos recebimentos';
    sections.push({ title: 'Pagamentos digitais', label: 'Pagamentos digitais', text: text, hash: '#/today' });
  }
  const retirement = caixaInssText(inss, today);
  if (retirement) sections.push({ title: 'A minha reforma (INSS)', label: 'INSS', text: retirement, hash: '#/today' });
  if (sections.length === 0) return null;
  if (sections.length === 1) {
    const only = sections[0];
    const body = only.text.charAt(0).toUpperCase() + only.text.slice(1);
    const tail = only.hash === '#/credit' ? 'Toque para ver e lembrar os clientes.' : 'Toque para ver.';
    return { title: only.title, body: body + '. ' + tail, hash: only.hash };
  }
  return {
    title: 'Avisos da loja',
    body: sections.map((x) => x.label + ': ' + x.text).join('. ') + '. Toque para ver.',
    hash: '#/today',
  };
}

function caixaParse(row, fallback) {
  try {
    return row && typeof row.value === 'string' ? JSON.parse(row.value) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function caixaCheckAndNotify(force) {
  const db = await caixaOpenDb();
  if (!db) return;
  try {
    const today = caixaLocalDate(new Date());
    const last = await caixaMeta(db, 'readonly', (s) => s.get('alertsNotifiedOn'));
    if (!force && last && last.value === today) return;
    const credit = caixaParse(await caixaMeta(db, 'readonly', (s) => s.get('creditAlertItems')), []);
    const suppliers = caixaParse(await caixaMeta(db, 'readonly', (s) => s.get('supplierAlertItems')), []);
    const digital = caixaParse(await caixaMeta(db, 'readonly', (s) => s.get('digitalAlert')), null);
    const inss = caixaParse(await caixaMeta(db, 'readonly', (s) => s.get('inssAlert')), null);
    const alert = caixaDailyAlert(today, credit, suppliers, digital, inss);
    if (!alert) return;
    await self.registration.showNotification(alert.title, {
      body: alert.body,
      tag: CAIXA_TAG,
      icon: 'icon-192.png',
      data: { hash: alert.hash },
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
