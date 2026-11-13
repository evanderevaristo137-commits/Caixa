import type { SyncKind } from '../../domain/sync-merge';

/**
 * What the phones of a shop share (from phase 2, through a server), table by table, and what never
 * leaves the phone. A test checks that every table of the database is in one list or the other, so a
 * new table cannot be forgotten.
 */
export const SYNC_TABLES = {
  // Editable: the most recent version wins (domain/sync-merge.ts).
  settings: 'editable',
  staff: 'editable',
  suppliers: 'editable',
  customers: 'editable',
  products: 'editable',
  // Facts: written once; only steps forward (voided, confirmed).
  purchases: 'fact',
  sales: 'fact',
  creditPayments: 'fact',
  returns: 'fact',
  supplierPayments: 'fact',
  expenses: 'fact',
  cashCloses: 'fact',
  inssContributions: 'fact',
  batches: 'fact',
  stockMovements: 'fact',
  audit: 'fact',
} as const satisfies Record<string, SyncKind>;

export type SyncTable = keyof typeof SYNC_TABLES;

/** In this order a phone takes the other phones' changes: what others point to comes first. */
export const APPLY_ORDER = Object.keys(SYNC_TABLES) as SyncTable[];

export const isSyncTable = (name: string): name is SyncTable => Object.hasOwn(SYNC_TABLES, name);

/** Fields worked out on each phone from the facts: never taken from another phone. */
export const LOCAL_FIELDS: Partial<Record<SyncTable, readonly string[]>> = { products: ['stock'] };

/**
 * Never shared: this phone's counters and keys (meta), the owner's and the staff's codes, the safety
 * copy, what is worked out from the facts (customers' accounts) and the queue of changes itself.
 */
export const PHONE_TABLES = ['meta', 'safety', 'staffPins', 'accounts', 'changes'] as const;
