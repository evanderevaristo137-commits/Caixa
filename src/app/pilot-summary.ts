import { lastBackupAt } from '../data/backup';
import type { DataMode } from '../data/db';
import type { Store } from '../data/store';
import { creditAlerts, totalOutstanding } from '../domain/credit';
import { pilotText } from '../domain/pilot';
import { addDays, startOfLocalDay } from '../lib/dates';

/**
 * Gathers the shop's numbers for the pilot summary (no names, no phones) and writes the message.
 * Read-only, so it can run inside a live query: the phone's id must already exist (`store.device.id()`).
 */
export async function buildPilotSummary(store: Store, mode: DataMode, now = new Date()): Promise<string> {
  const from = addDays(startOfLocalDay(now), -29).toISOString();
  const until = addDays(now, 1).toISOString();
  const [settings, device, firstSale, allProducts, sales, book, products, closes, expenses, purchases, backupAt] = await Promise.all([
    store.settings.get(),
    store.db.meta.get('deviceId'),
    store.db.sales.orderBy('createdAt').first(),
    store.db.products.toArray(),
    store.sales.since(from),
    store.credit.book(now),
    store.products.list(),
    store.cash.closes(),
    store.expenses.between(from, until),
    store.purchases.between(from, until),
    lastBackupAt(store.db),
  ]);
  const firsts = [firstSale?.createdAt, ...allProducts.map((p) => p.createdAt)].filter((x): x is string => !!x).sort();
  const deviceId = typeof device?.value === 'string' ? device.value : '—';
  const owing = book.filter((c) => c.balanceCents > 0);
  return pilotText({
    storeName: settings.storeName,
    deviceId,
    demo: mode === 'demo',
    now,
    firstUseAt: firsts[0],
    sales,
    customersOwing: owing.length,
    owedCents: totalOutstanding(book),
    customersOverdue: creditAlerts(book).overdue.length,
    products: products.length,
    productsWithCost: products.filter((p) => p.costCents !== undefined).length,
    closes: closes.filter((c) => c.createdAt >= from).length,
    expenses: expenses.filter((e) => !e.voidedAt).length,
    purchases: purchases.filter((p) => !p.voidedAt).length,
    lastBackupAt: backupAt,
  });
}
