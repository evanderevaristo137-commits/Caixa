import Dexie from 'dexie';
import { changedFields } from '../../domain/audit-entry';
import { mergeRecords, type SyncRecord } from '../../domain/sync-merge';
import type { AuditEntry } from '../../domain/types';
import { uuid } from '../../lib/ids';
import { rebuildAccounts } from '../accounts';
import { DB_NAMES, type CaixaDB } from '../db';
import type { ChangeRow } from './outbox';
import { APPLY_ORDER, LOCAL_FIELDS, SYNC_TABLES, type SyncTable } from './tables';

/**
 * Sharing changes between the phones of a shop (phase 2, through a server), prepared without one:
 * what a phone sends (`buildBatch`, or `snapshotBatch` the first time), how the server's answer
 * leaves the queue (`acknowledge`) and how a phone takes the others' changes (`applyBatch`).
 * The server itself, and the shop's account, are still to be chosen (see docs/SINCRONIZACAO.md).
 */

export const SYNC_FORMAT = 1;

/** What a phone sends, or gets: the current version of each record, by table. */
export interface SyncBatch {
  format: typeof SYNC_FORMAT;
  /** The phone the changes come from. */
  deviceId: string;
  records: Partial<Record<SyncTable, SyncRecord[]>>;
}

const sharedTables = (db: CaixaDB) => APPLY_ORDER.map((t) => db.table(t));

/** Starts noting changes for the server (the first sync sends everything; then only what changed). Never in the demo. */
export async function startTracking(db: CaixaDB): Promise<void> {
  if (db.name === DB_NAMES.demo) throw new Error('The demo never syncs');
  await db.meta.put({ key: 'syncOn', value: 1 });
  db.sync.on = true;
}

/** Stops noting changes, and empties the queue. */
export async function stopTracking(db: CaixaDB): Promise<void> {
  await db.meta.delete('syncOn');
  db.sync.on = false;
  await db.changes.clear();
}

/** Changes waiting to be sent (at most `limit` records). */
export const pendingChanges = (db: CaixaDB, limit = 500): Promise<ChangeRow[]> => db.changes.limit(limit).toArray();

async function deviceIdOf(db: CaixaDB): Promise<string> {
  const row = await db.meta.get('deviceId');
  return typeof row?.value === 'string' ? row.value : '';
}

/** The current version of the records in `rows`; a table that was replaced (a restored backup) goes in full. */
export async function buildBatch(db: CaixaDB, rows: readonly ChangeRow[]): Promise<SyncBatch> {
  const records: SyncBatch['records'] = {};
  await db.transaction('r', sharedTables(db), async () => {
    for (const t of APPLY_ORDER) {
      const mine = rows.filter((r) => r.t === t);
      if (mine.length === 0) continue;
      const table = db.table<SyncRecord, string>(t);
      const list = mine.some((r) => r.id === '*')
        ? await table.toArray()
        : (await table.bulkGet(mine.map((r) => r.id))).filter((r): r is SyncRecord => r !== undefined);
      if (list.length) records[t] = list;
    }
  });
  return { format: SYNC_FORMAT, deviceId: await deviceIdOf(db), records };
}

/** Everything this phone holds that is shared: for the first sync. */
export async function snapshotBatch(db: CaixaDB): Promise<SyncBatch> {
  return buildBatch(
    db,
    APPLY_ORDER.map((t) => ({ t, id: '*', v: '' })),
  );
}

/** The server took these changes: they leave the queue, unless the record changed again meanwhile. */
export function acknowledge(db: CaixaDB, rows: readonly ChangeRow[]): Promise<number> {
  return db.transaction('rw', db.changes, async () => {
    const keys = rows.map((r): [string, string] => [r.t, r.id]);
    const now = await db.changes.bulkGet(keys);
    const done = keys.filter((_, i) => now[i]?.v === rows[i]!.v);
    await db.changes.bulkDelete(done);
    return done.length;
  });
}

const ENTITY: Partial<Record<SyncTable, AuditEntry['entity']>> = {
  products: 'product',
  customers: 'customer',
  suppliers: 'supplier',
  settings: 'settings',
  staff: 'staff',
};

export interface ApplyResult {
  /** Records saved (new or changed). */
  saved: number;
  /** Local versions replaced by a more recent one from another phone (each noted in the activity log). */
  overwritten: number;
}

/**
 * Takes another phone's changes, all or nothing: each record is joined with this phone's copy
 * (domain/sync-merge.ts), the versions that lost are noted in the activity log, and the stock and
 * the customers' accounts are worked out again from the facts. These writes are not queued: they
 * came from the server.
 */
export async function applyBatch(db: CaixaDB, batch: SyncBatch, now = new Date()): Promise<ApplyResult> {
  if (batch.format !== SYNC_FORMAT) throw new Error('unknown_format');
  const at = now.toISOString();
  return db.transaction('rw', [...sharedTables(db), db.accounts], async () => {
    const trans = Dexie.currentTransaction;
    if (trans?.idbtrans) db.sync.remote.add(trans.idbtrans);
    let saved = 0;
    const notes: AuditEntry[] = [];
    for (const t of APPLY_ORDER) {
      const incoming = batch.records[t] ?? [];
      if (incoming.length === 0) continue;
      const table = db.table<SyncRecord, string>(t);
      const locals = await table.bulkGet(incoming.map((r) => r.id));
      const puts: SyncRecord[] = [];
      incoming.forEach((remote, i) => {
        const m = mergeRecords(SYNC_TABLES[t], locals[i], remote, LOCAL_FIELDS[t]);
        if (m.changed) puts.push(m.record);
        if (m.overwritten) {
          notes.push({
            id: uuid(),
            entity: ENTITY[t] ?? 'data',
            entityId: m.record.id,
            action: 'sync_overwritten',
            ...changedFields<SyncRecord>(m.overwritten, m.record, ['name']),
            createdAt: at,
            updatedAt: at,
          });
        }
      });
      if (puts.length) await table.bulkPut(puts);
      saved += puts.length;
    }
    // Worked out from the facts, never copied.
    if (batch.records.stockMovements?.length || batch.records.products?.length) await recountStock(db);
    if (batch.records.sales?.length || batch.records.creditPayments?.length || batch.records.customers?.length) {
      await rebuildAccounts(db);
    }
    if (notes.length) await db.audit.bulkAdd(notes);
    return { saved, overwritten: notes.length };
  });
}

/** Each product's stock = the sum of its movements (inside a transaction with products and stockMovements). */
async function recountStock(db: CaixaDB): Promise<void> {
  const sums = new Map<string, number>();
  await db.stockMovements.each((m) => {
    sums.set(m.productId, (sums.get(m.productId) ?? 0) + m.delta);
  });
  const changed = (await db.products.toArray()).flatMap((p) => {
    const stock = sums.get(p.id) ?? 0;
    return p.stock === stock ? [] : [{ ...p, stock }];
  });
  if (changed.length) await db.products.bulkPut(changed);
}
