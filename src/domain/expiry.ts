import { addDaysToDateString, isValidDateString } from '../lib/dates';
import { compareText } from './ranking';
import type { Batch, Product } from './types';

/**
 * Expiry dates (optional, product by product: pharmacies, food). The stock stays one number; each
 * stock that comes in with a date is a batch. What is left of each batch is worked out from the
 * stock, as goods leave the shelf: the oldest first (and, among batches that came in together, the
 * one that expires first). So a sale never needs to say which batch it took.
 */

/** Batches expiring within this many days are shown as "a vencer". */
export const EXPIRY_SOON_DAYS = 30;

export interface ShelfBatch {
  /** Units, or grams. */
  quantity: number;
  /** "YYYY-MM-DD"; undefined for stock without a date (it came in before the dates, or without one). */
  expiresOn?: string;
}

type BatchLike = Pick<Batch, 'quantity' | 'expiresOn' | 'createdAt' | 'voidedAt' | 'source'>;

/**
 * What is on the shelf of each batch, given the stock: the newest batches are the ones left. Dates
 * given to stock already on the shelf ('shelf') describe the oldest stock, whenever they were given;
 * among batches of the same age, the one that expires last is the one left.
 */
export function batchesOnShelf(stock: number, batches: BatchLike[]): ShelfBatch[] {
  let left = Math.max(0, stock);
  const shelf = (b: BatchLike) => (b.source === 'shelf' ? 1 : 0);
  const newestFirst = batches
    .filter((b) => !b.voidedAt && b.quantity > 0)
    .sort(
      (a, b) =>
        shelf(a) - shelf(b) || (shelf(a) ? 0 : compareText(b.createdAt, a.createdAt)) || compareText(b.expiresOn ?? '', a.expiresOn ?? ''),
    );
  const out: ShelfBatch[] = [];
  for (const b of newestFirst) {
    if (left <= 0) break;
    const quantity = Math.min(b.quantity, left);
    left -= quantity;
    out.push(b.expiresOn ? { quantity, expiresOn: b.expiresOn } : { quantity });
  }
  // Older stock than any batch: no date known.
  if (left > 0) out.push({ quantity: left });
  // The first to expire first; stock without a date last.
  return out.sort((a, b) => compareText(a.expiresOn ?? '9999', b.expiresOn ?? '9999'));
}

export interface ExpiryLine {
  productId: string;
  name: string;
  soldBy?: 'weight';
  quantity: number;
  expiresOn: string;
  /** Days until it expires (negative: already expired). */
  daysLeft: number;
}

/**
 * Stock on the shelf that has expired or expires within `days`, for the products that follow
 * their dates: expired first, then the first to expire.
 */
export function expiringStock(
  products: Pick<Product, 'id' | 'name' | 'soldBy' | 'stock' | 'tracksExpiry' | 'archivedAt'>[],
  batches: (BatchLike & Pick<Batch, 'productId'>)[],
  today: string,
  days = EXPIRY_SOON_DAYS,
): ExpiryLine[] {
  const byProduct = new Map<string, BatchLike[]>();
  for (const b of batches) {
    const list = byProduct.get(b.productId);
    if (list) list.push(b);
    else byProduct.set(b.productId, [b]);
  }
  const limit = addDaysToDateString(today, days);
  const out: ExpiryLine[] = [];
  for (const p of products) {
    if (!p.tracksExpiry || p.archivedAt || p.stock <= 0) continue;
    for (const s of batchesOnShelf(p.stock, byProduct.get(p.id) ?? [])) {
      if (!s.expiresOn || s.expiresOn > limit) continue;
      out.push({
        productId: p.id,
        name: p.name,
        ...(p.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
        quantity: s.quantity,
        expiresOn: s.expiresOn,
        daysLeft: daysBetween(today, s.expiresOn),
      });
    }
  }
  return out.sort((a, b) => compareText(a.expiresOn, b.expiresOn) || compareText(a.name, b.name));
}

/** Whole days from one "YYYY-MM-DD" to another (calendar days, no clock involved). */
export function daysBetween(from: string, to: string): number {
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** A date the shop can give a batch: a real "YYYY-MM-DD" (in the past too: it may be expired already). */
export const isExpiryDate = (s: string | undefined): s is string => !!s && isValidDateString(s);
