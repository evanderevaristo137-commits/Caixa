import type { BackgroundAlertItem, DigitalAlertInfo, DueItem } from '../domain/alerts';
import { creditBook } from '../domain/credit';
import { digitalStatus } from '../domain/digital-watch';
import { inssAlertItem, type InssAlertItem } from '../domain/inss';
import { addDays, startOfLocalDay, toLocalDateString } from '../lib/dates';
import type { Store } from './store';

/**
 * The short lists the background checker (public/sw-alerts.js) reads with the app closed.
 * They stay on the phone, in the meta table of the real shop's database.
 */
export const ALERT_KEYS = {
  credit: 'creditAlertItems',
  suppliers: 'supplierAlertItems',
  digital: 'digitalAlert',
  inss: 'inssAlert',
} as const;

/** Customers who owe and suppliers the shop owes, with the date of the next payment. */
export async function dueItems(store: Store, now: Date): Promise<{ credit: BackgroundAlertItem[]; suppliers: DueItem[] }> {
  const [customers, sales, payments, payables] = await Promise.all([
    store.customers.list(),
    store.sales.onCredit(),
    store.credit.payments(),
    store.payables.book(now),
  ]);
  return {
    credit: creditBook(customers, sales, payments, now)
      .filter((b) => b.balanceCents > 0 && b.nextDueDate)
      .map((b) => ({ name: b.customer.name, dueDate: b.nextDueDate! })),
    suppliers: payables.filter((s) => s.balanceCents > 0 && s.nextDueDate).map((s) => ({ dueDate: s.nextDueDate! })),
  };
}

/** The digital payments alarm of today (it only changes once a day: it looks at complete days). */
export async function digitalAlertInfo(store: Store, now: Date): Promise<DigitalAlertInfo> {
  const day = startOfLocalDay(now);
  const from = addDays(day, -36).toISOString();
  const [sales, payments, settings] = await Promise.all([
    store.sales.since(from),
    store.credit.paymentsBetween(from, addDays(day, 1).toISOString()),
    store.settings.get(),
  ]);
  const status = digitalStatus(sales, payments, now, settings.digitalMinShareBp);
  return {
    on: toLocalDateString(now),
    alarm: status.alarm,
    belowMinimum: status.belowMinimum,
    shareBp: status.week.shareBp,
    ...(status.minShareBp !== undefined ? { minShareBp: status.minShareBp } : {}),
  };
}

/** Last month's INSS contribution, while the owner follows the INSS and has not recorded it as paid. */
export async function inssAlert(store: Store, now: Date): Promise<InssAlertItem | null> {
  const [settings, contributions] = await Promise.all([store.settings.get(), store.inss.list()]);
  return inssAlertItem(settings.inss, contributions, now);
}
