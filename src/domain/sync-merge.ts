/**
 * How two copies of the same record become one when the phones of a shop share their changes
 * (through a server, from phase 2). The result is the same on every phone, whatever the order the
 * copies arrive in, and nothing a shop recorded is lost:
 *
 * - facts (sales, payments, stock movements, returns…) are written once; the only steps they take
 *   afterwards (voided, confirmed) are never undone. When both phones took the same step, the first
 *   one counts, with its details (reason, the sale that replaced it).
 * - editable records (products, customers, suppliers, settings, staff) keep the most recent version
 *   («last write wins»), and the version that lost is written in the activity log (see apply.ts).
 *   Archiving is a step forward too: a later edit elsewhere never brings an archived product back.
 * - some fields are worked out on each phone from the facts (a product's stock) and are never taken
 *   from the other copy.
 */

export type SyncKind = 'fact' | 'editable';

export type SyncRecord = { id: string; createdAt?: string; updatedAt?: string } & Record<string, unknown>;

/** Steps a record only takes forward, each with the details that go with it. */
const FORWARD: Record<string, readonly string[]> = {
  voidedAt: ['voidReason', 'replacedBySaleId'],
  confirmedAt: [],
  archivedAt: [],
};

/** Moments where the latest one counts (the last WhatsApp reminder to a customer). */
const LATEST: readonly string[] = ['lastRemindedAt'];

export interface MergeResult<T> {
  record: T;
  /** The merged record differs from the local one (it has to be saved). */
  changed: boolean;
  /** An editable record whose local version lost to the other phone's: what was here before. */
  overwritten?: T;
}

const text = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** The record without the fields worked out locally, as text: to compare and to break ties the same way everywhere. */
function plain(r: SyncRecord, local: readonly string[]): string {
  const copy: Record<string, unknown> = { ...r };
  for (const f of local) delete copy[f];
  return JSON.stringify(copy, Object.keys(copy).sort());
}

/**
 * One record from two copies. `localFields`: fields worked out on this phone (never taken from the
 * other copy, e.g. a product's stock).
 */
export function mergeRecords<T extends SyncRecord>(
  kind: SyncKind,
  local: T | undefined,
  remote: T,
  localFields: readonly string[] = [],
): MergeResult<T> {
  if (!local) return { record: remote, changed: true };
  const lu = text(local.updatedAt) ?? '';
  const ru = text(remote.updatedAt) ?? '';
  // Facts are the same on both phones but for their steps; editable records: the most recent wins
  // (a tie is broken by the content, the same way on every phone).
  const remoteWins = kind === 'editable' && (ru > lu || (ru === lu && plain(remote, localFields) > plain(local, localFields)));
  const merged: Record<string, unknown> = { ...(remoteWins ? remote : local) };

  for (const [step, details] of Object.entries(FORWARD)) {
    const l = text(local[step]);
    const r = text(remote[step]);
    if (!l && !r) continue;
    // The first time the step was taken counts, with its details.
    const from = !l ? remote : !r ? local : r < l ? remote : local;
    for (const f of [step, ...details]) {
      if (from[f] === undefined) delete merged[f];
      else merged[f] = from[f];
    }
  }
  for (const f of LATEST) {
    const l = text(local[f]);
    const r = text(remote[f]);
    if (l || r) merged[f] = !l ? r : !r ? l : l > r ? l : r;
  }
  for (const f of localFields) {
    if (local[f] === undefined) delete merged[f];
    else merged[f] = local[f];
  }
  if (lu || ru) merged.updatedAt = lu > ru ? lu : ru;

  const record = merged as T;
  const changed = plain(record, []) !== plain(local, []);
  const overwritten = remoteWins && plain(local, localFields) !== plain(remote, localFields) ? local : undefined;
  return overwritten ? { record, changed, overwritten } : { record, changed };
}
