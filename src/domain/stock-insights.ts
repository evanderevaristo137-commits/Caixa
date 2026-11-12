import { addDays, calendarDaysBetween, startOfLocalDay } from '../lib/dates';
import { formatKg, GRAMS_PER_KG } from './quantity';
import { isLowStock } from './today';
import type { Cents, IsoDate, Product, Sale, SaleReturn, StockMovement } from './types';

/**
 * How the stock moves: how fast each product sells (the last 30 days of sales), how many days the
 * stock lasts at that pace, products standing still (money tied up on the shelf), what to buy by
 * the speed of sale, and the losses (stock that left without being sold).
 */

/** Days of sales used to measure the speed of sale. */
export const SPEED_DAYS = 30;
/** A product is measured over at least this many days, so a new product is not "selling fast" by chance. */
export const MIN_SPEED_DAYS = 7;
/** What to buy: enough for this many days of sales. */
export const COVER_DAYS = 14;
/** Runs out within this many days at its pace: on the shopping list even above its minimum. */
export const SOON_DAYS = 7;

export interface Speed {
  /** Units (or grams) sold in the window, in valid sales. */
  sold: number;
  /** Sold per day over the days the product could sell (at least MIN_SPEED_DAYS). Not money: a plain number. */
  perDay: number;
  lastSoldAt?: IsoDate;
}

type SaleLike = Pick<Sale, 'createdAt' | 'voidedAt' | 'items'>;
type ProductLike = Pick<Product, 'id' | 'createdAt'>;

/** Speed of sale of each product over the last SPEED_DAYS days (sales outside that window are ignored). */
export function salesSpeed(sales: SaleLike[], products: ProductLike[], now: Date): Map<string, Speed> {
  const windowStart = addDays(startOfLocalDay(now), -(SPEED_DAYS - 1));
  const fromIso = windowStart.toISOString();
  const sold = new Map<string, { sold: number; last: IsoDate }>();
  for (const s of sales) {
    if (s.voidedAt || s.createdAt < fromIso) continue;
    for (const i of s.items) {
      const row = sold.get(i.productId);
      if (row) {
        row.sold += i.quantity;
        if (s.createdAt > row.last) row.last = s.createdAt;
      } else sold.set(i.productId, { sold: i.quantity, last: s.createdAt });
    }
  }
  const createdAt = new Map(products.map((p) => [p.id, p.createdAt]));
  const out = new Map<string, Speed>();
  for (const [productId, row] of sold) {
    // A product created during the window could only sell since then.
    const created = createdAt.get(productId);
    const start = created && created > fromIso ? new Date(created) : windowStart;
    const days = Math.max(MIN_SPEED_DAYS, calendarDaysBetween(start, now) + 1);
    out.set(productId, { sold: row.sold, perDay: row.sold / days, lastSoldAt: row.last });
  }
  return out;
}

/** The pace of sale in words: per day, or per week when less than one a day (a plain number, not money). */
export function paceOf(perDay: number, soldBy?: 'weight'): { qty: string; per: 'day' | 'week' } {
  const oneADay = soldBy === 'weight' ? 100 : 1; // 100 g a day for goods by the kilo
  const per = perDay >= oneADay ? 'day' : 'week';
  const value = per === 'day' ? perDay : perDay * 7;
  if (soldBy === 'weight') return { qty: `${formatKg(Math.round(value / 10) * 10)} kg`, per };
  const rounded = Math.round(value * 10) / 10;
  return { qty: String(rounded).replace('.', ','), per };
}

/**
 * Speed of sale of one product from its own stock movements (cheaper than reading every sale):
 * sales in the last SPEED_DAYS days, less sales voided in that time. Undefined when it did not sell.
 */
export function speedFromMovements(
  movements: Pick<StockMovement, 'type' | 'delta' | 'createdAt'>[],
  product: ProductLike,
  now: Date,
): Speed | undefined {
  const windowStart = addDays(startOfLocalDay(now), -(SPEED_DAYS - 1));
  const fromIso = windowStart.toISOString();
  let sold = 0;
  let last: IsoDate | undefined;
  for (const m of movements) {
    if (m.createdAt < fromIso) continue;
    if (m.type === 'sale') {
      sold -= m.delta;
      if (!last || m.createdAt > last) last = m.createdAt;
    } else if (m.type === 'void') sold -= m.delta;
  }
  if (sold <= 0) return undefined;
  const start = product.createdAt > fromIso ? new Date(product.createdAt) : windowStart;
  const days = Math.max(MIN_SPEED_DAYS, calendarDaysBetween(start, now) + 1);
  return { sold, perDay: sold / days, ...(last ? { lastSoldAt: last } : {}) };
}

/** Days the stock lasts at the current pace (0 when there is none left); undefined when it does not sell. */
export function daysLeft(stock: number, speed: Speed | undefined): number | undefined {
  if (!speed || speed.perDay <= 0) return undefined;
  return stock <= 0 ? 0 : Math.floor(stock / speed.perDay);
}

export interface RestockLine {
  productId: string;
  name: string;
  stock: number;
  /** Suggested quantity to buy (units, or grams). */
  suggested: number;
  soldBy?: 'weight';
  /** Days the stock lasts at the current pace (when it sells). */
  daysLeft?: number;
  /** 'low': at or below its minimum. 'soon': above it, but runs out within SOON_DAYS at its pace. */
  why: 'low' | 'soon';
  supplierId?: string;
}

/**
 * What to buy, most urgent first. Without speeds, as always: the products at or below their minimum,
 * enough to reach twice the minimum (at least 1 unit, or 1 kg). With the speed of sale: also the
 * products that run out within a week, and never less than two weeks of sales.
 */
export function restockList(products: Product[], speeds?: Map<string, Speed>): RestockLine[] {
  const lines: RestockLine[] = [];
  for (const p of products) {
    if (p.archivedAt) continue;
    const speed = speeds?.get(p.id);
    const left = daysLeft(p.stock, speed);
    const low = isLowStock(p);
    const soon = left !== undefined && left <= SOON_DAYS;
    if (!low && !soon) continue;
    const byWeight = p.soldBy === 'weight';
    const unit = byWeight ? GRAMS_PER_KG : 1;
    const byMinimum = Math.max(unit, p.minStock * 2 - p.stock);
    // Two weeks of sales, in whole units (or whole kilos).
    const bySpeed = speed ? Math.ceil((speed.perDay * COVER_DAYS - p.stock) / unit) * unit : 0;
    lines.push({
      productId: p.id,
      name: p.name,
      stock: p.stock,
      suggested: Math.max(byMinimum, bySpeed),
      ...(byWeight ? { soldBy: 'weight' as const } : {}),
      ...(left !== undefined ? { daysLeft: left } : {}),
      why: low ? 'low' : 'soon',
      ...(p.supplierId ? { supplierId: p.supplierId } : {}),
    });
  }
  // Runs out first, first; then the furthest below its minimum.
  const mins = new Map(products.map((p) => [p.id, p.minStock]));
  const below = (l: RestockLine) => l.stock - (mins.get(l.productId) ?? 0);
  return lines.sort((a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER) || below(a) - below(b));
}

/** What a quantity of a product cost the shop, from its cost price (undefined without one). */
export function stockValueCents(p: Pick<Product, 'costCents' | 'soldBy'>, quantity: number): Cents | undefined {
  if (p.costCents === undefined) return undefined;
  return p.soldBy === 'weight' ? Math.round((p.costCents * quantity) / GRAMS_PER_KG) : p.costCents * quantity;
}

export interface StillProduct {
  product: Product;
  /** What the stock on the shelf cost (undefined without a cost price). */
  valueCents?: Cents;
}

/**
 * Products standing still: in stock, in the shop for at least SPEED_DAYS days, and not sold in the
 * last SPEED_DAYS days. The money tied up on the shelf first.
 */
export function stillProducts(products: Product[], speeds: Map<string, Speed>, now: Date): StillProduct[] {
  const oldEnough = addDays(startOfLocalDay(now), -(SPEED_DAYS - 1)).toISOString();
  return products
    .filter((p) => !p.archivedAt && p.stock > 0 && p.createdAt <= oldEnough && !speeds.has(p.id))
    .map((product) => {
      const valueCents = stockValueCents(product, product.stock);
      return valueCents === undefined ? { product } : { product, valueCents };
    })
    .sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1) || (a.product.name < b.product.name ? -1 : 1));
}

export interface LossLine {
  productId: string;
  name: string;
  /** Units, or grams. */
  quantity: number;
  soldBy?: 'weight';
  /** At the product's cost price today (undefined without one). */
  valueCents?: Cents;
  /** Why it left: the reasons written, and how much for each. */
  reasons: { reason: string; quantity: number }[];
}

export interface Losses {
  lines: LossLine[];
  /** Value of the lines with a cost price. */
  valueCents: Cents;
  /** Lines without a cost price (not in the value). */
  unknownLines: number;
  /** Stock found above what the app had (counts, adjustments up): it makes up for part of the losses. */
  foundValueCents: Cents;
}

/** Name of the losses from goods customers gave back damaged (they never went back on the shelf). */
export const DAMAGED_RETURN = 'Devolvido estragado';

/**
 * Stock that left without being sold, in a period: adjustments down (broken, out of date, stolen,
 * counted short, own use…) and goods given back damaged. Worth the cost price; most money first.
 */
export function stockLosses(
  movements: Pick<StockMovement, 'productId' | 'type' | 'delta' | 'reason'>[],
  returns: Pick<SaleReturn, 'restock' | 'items'>[],
  products: Product[],
): Losses {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = new Map<string, { quantity: number; reasons: Map<string, number>; valueCents?: Cents }>();
  let foundValueCents = 0;
  const add = (productId: string, quantity: number, reason: string, valueCents: Cents | undefined) => {
    const row = rows.get(productId) ?? { quantity: 0, reasons: new Map<string, number>(), valueCents: 0 };
    row.quantity += quantity;
    row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + quantity);
    row.valueCents = row.valueCents === undefined || valueCents === undefined ? undefined : row.valueCents + valueCents;
    rows.set(productId, row);
  };
  for (const m of movements) {
    if (m.type !== 'adjustment') continue;
    const p = byId.get(m.productId);
    if (m.delta > 0) {
      foundValueCents += (p && stockValueCents(p, m.delta)) ?? 0;
      continue;
    }
    add(m.productId, -m.delta, (m.reason ?? '').trim() || '—', p && stockValueCents(p, -m.delta));
  }
  for (const r of returns) {
    if (r.restock) continue;
    for (const i of r.items)
      add(
        i.productId,
        i.quantity,
        DAMAGED_RETURN,
        i.costCents ?? (byId.get(i.productId) && stockValueCents(byId.get(i.productId)!, i.quantity)),
      );
  }
  const lines: LossLine[] = [...rows].map(([productId, row]) => {
    const p = byId.get(productId);
    return {
      productId,
      name: p?.name ?? '—',
      quantity: row.quantity,
      ...(p?.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
      ...(row.valueCents !== undefined ? { valueCents: row.valueCents } : {}),
      reasons: [...row.reasons].map(([reason, quantity]) => ({ reason, quantity })).sort((a, b) => b.quantity - a.quantity),
    };
  });
  lines.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1) || (a.name < b.name ? -1 : 1));
  return {
    lines,
    valueCents: lines.reduce((a, l) => a + (l.valueCents ?? 0), 0),
    unknownLines: lines.filter((l) => l.valueCents === undefined).length,
    foundValueCents,
  };
}
