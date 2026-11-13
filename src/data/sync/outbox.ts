import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie';
import { uuid } from '../../lib/ids';
import { isSyncTable } from './tables';

/**
 * The queue of changes to send («fila de alterações»): one row per record changed since the last
 * time the server took them. `v` is a new random token at each change, so a record changed again
 * while being sent stays in the queue (see `acknowledge`). `id` '*' means the whole table was
 * replaced (a restored backup): it is sent again in full.
 *
 * Off until the shop starts syncing (phase 2): until then nothing is written and nothing grows.
 */
export interface ChangeRow {
  t: string;
  id: string;
  v: string;
}

export const CHANGES = 'changes';

/** Per database: whether changes are being recorded, and the transactions that bring other phones' changes (never recorded). */
export interface SyncState {
  on: boolean;
  remote: WeakSet<object>;
}

export const newSyncState = (): SyncState => ({ on: false, remote: new WeakSet() });

/** The store names of a transaction (an IndexedDB transaction underneath). */
const hasStore = (trans: unknown, name: string) => {
  const names = (trans as { objectStoreNames?: DOMStringList }).objectStoreNames;
  return !!names && names.contains(name);
};

function keysOf(req: DBCoreMutateRequest, results: readonly unknown[] | undefined, failures: Record<number, Error>): string[] {
  if (req.type === 'deleteRange') return ['*'];
  const keys = req.type === 'delete' ? req.keys : (results ?? []);
  return keys.flatMap((k, i) => (k === undefined || failures[i] ? [] : [String(k)]));
}

/**
 * Records, in the same transaction, every record written to a shared table (Dexie middleware: it sees
 * every write, whatever code made it). Writes that bring other phones' changes are not recorded.
 */
export function changeTracking(state: SyncState): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'caixaChanges',
    create(down) {
      return {
        ...down,
        transaction(stores, mode, options) {
          const record = state.on && mode === 'readwrite' && stores.some(isSyncTable) && !stores.includes(CHANGES);
          return down.transaction(record ? [...stores, CHANGES] : stores, mode, options);
        },
        table(name): DBCoreTable {
          const table = down.table(name);
          if (!isSyncTable(name)) return table;
          return {
            ...table,
            async mutate(req) {
              const res = await table.mutate(req);
              if (!state.on || state.remote.has(req.trans) || !hasStore(req.trans, CHANGES)) return res;
              const keys = keysOf(req, res.results, res.failures);
              if (keys.length) {
                await down.table(CHANGES).mutate({ type: 'put', trans: req.trans, values: keys.map((id) => ({ t: name, id, v: uuid() })) });
              }
              return res;
            },
          };
        },
      };
    },
  };
}
