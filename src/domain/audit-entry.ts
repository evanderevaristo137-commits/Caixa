import type { Purchase, Sale } from './types';

/**
 * What goes into a line of the activity log. The records themselves (sales, purchases, movements)
 * already keep everything and never change except to be voided: a line keeps only what describes the
 * action (for the log in «Mais») and, for changes, what changed. About a tenth of the space.
 */

/** A sale as the log describes it. The full sale (lines, prices, cost) is in the sales table. */
export function saleLog(s: Sale) {
  return {
    number: s.number,
    totalCents: s.totalCents,
    method: s.method,
    lines: s.items.length,
    ...(s.customerId ? { customerId: s.customerId } : {}),
    ...(s.dueDate ? { dueDate: s.dueDate } : {}),
    ...(s.creditLimitOverride ? { creditLimitOverride: s.creditLimitOverride } : {}),
    ...(s.voidedAt ? { voidedAt: s.voidedAt, voidReason: s.voidReason } : {}),
  };
}

/** A purchase as the log describes it. The full purchase is in the purchases table. */
export function purchaseLog(p: Purchase) {
  return {
    number: p.number,
    totalCents: p.totalCents,
    payment: p.payment,
    lines: p.items.length,
    ...(p.supplierId ? { supplierId: p.supplierId } : {}),
    ...(p.dueDate ? { dueDate: p.dueDate } : {}),
    ...(p.voidedAt ? { voidedAt: p.voidedAt, voidReason: p.voidReason } : {}),
  };
}

/**
 * Before and after of a change, with only the fields that changed and those that name the record
 * (`keep`, such as the name). The time of the change is the time of the log line.
 */
export function changedFields<T extends object>(
  before: T,
  after: T,
  keep: readonly (keyof T)[] = [],
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof T)[]);
  for (const k of keys) {
    if (k === 'updatedAt') continue;
    if (!keep.includes(k) && JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    if (before[k] !== undefined) b[k] = before[k];
    if (after[k] !== undefined) a[k] = after[k];
  }
  return { before: b, after: a };
}
