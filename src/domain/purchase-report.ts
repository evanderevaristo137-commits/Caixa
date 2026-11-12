import { addDays, daysBetweenDateStrings, toLocalDateString } from '../lib/dates';
import { DEFAULT_TERM_DAYS } from './credit';
import { punctuality, type Punctuality } from './punctuality';
import { comparePt, compareText } from './ranking';
import type { Cents, IsoDate, Purchase, SupplierPayment } from './types';

/**
 * What the shop buys: the prices paid for each product (by supplier, over time), how each supplier's
 * prices move, the credit the suppliers give and how punctually the shop pays them, and the purchases
 * of a period.
 */

type PurchaseLike = Pick<Purchase, 'id' | 'supplierId' | 'items' | 'totalCents' | 'payment' | 'createdAt' | 'voidedAt' | 'dueDate'>;

export interface PriceRow {
  purchaseId: string;
  supplierId?: string;
  /** Per unit, or per kg. */
  unitCostCents: Cents;
  quantity: number;
  soldBy?: 'weight';
  at: IsoDate;
}

/** Each valid purchase of a product, newest first. */
export function purchasePrices(productId: string, purchases: PurchaseLike[]): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const p of purchases) {
    if (p.voidedAt) continue;
    const item = p.items.find((i) => i.productId === productId);
    if (!item) continue;
    rows.push({
      purchaseId: p.id,
      ...(p.supplierId ? { supplierId: p.supplierId } : {}),
      unitCostCents: item.unitCostCents,
      quantity: item.quantity,
      ...(item.soldBy ? { soldBy: item.soldBy } : {}),
      at: p.createdAt,
    });
  }
  return rows.sort((a, b) => compareText(b.at, a.at));
}

export interface SupplierPrice {
  supplierId?: string;
  /** The price of the last purchase from this supplier, and when. */
  lastCents: Cents;
  lastAt: IsoDate;
  count: number;
}

/** The last price of each supplier for one product, cheapest first (rows newest first, as purchasePrices gives them). */
export function lastPriceBySupplier(rows: PriceRow[]): SupplierPrice[] {
  const out = new Map<string, SupplierPrice>();
  for (const r of rows) {
    const key = r.supplierId ?? '';
    const seen = out.get(key);
    if (seen) seen.count += 1;
    else out.set(key, { ...(r.supplierId ? { supplierId: r.supplierId } : {}), lastCents: r.unitCostCents, lastAt: r.at, count: 1 });
  }
  return [...out.values()].sort((a, b) => a.lastCents - b.lastCents || compareText(b.lastAt, a.lastAt));
}

export interface SupplierProductPrice {
  productId: string;
  name: string;
  soldBy?: 'weight';
  lastCents: Cents;
  lastAt: IsoDate;
  /** The price of the purchase before, from the same supplier. */
  previousCents?: Cents;
  /** Change since then, in basis points (1000 = +10%). */
  changeBp?: number;
}

/** Each product bought from a supplier: its last price and how it moved since the purchase before. */
export function supplierPrices(supplierId: string, purchases: PurchaseLike[]): SupplierProductPrice[] {
  const mine = purchases.filter((p) => p.supplierId === supplierId && !p.voidedAt).sort((a, b) => compareText(b.createdAt, a.createdAt));
  const out = new Map<string, SupplierProductPrice>();
  for (const p of mine) {
    for (const i of p.items) {
      const seen = out.get(i.productId);
      if (!seen) {
        out.set(i.productId, {
          productId: i.productId,
          name: i.name,
          ...(i.soldBy ? { soldBy: i.soldBy } : {}),
          lastCents: i.unitCostCents,
          lastAt: p.createdAt,
        });
      } else if (seen.previousCents === undefined) {
        seen.previousCents = i.unitCostCents;
        if (i.unitCostCents > 0) seen.changeBp = Math.round(((seen.lastCents - i.unitCostCents) * 10_000) / i.unitCostCents);
      }
    }
  }
  return [...out.values()].sort((a, b) => comparePt(a.name, b.name));
}

export interface SupplierTerms {
  /** Average days between a purchase on credit and its due date (undefined without credit purchases). */
  avgTermDays?: number;
  /** How punctually the shop pays this supplier. */
  punctuality: Punctuality;
}

/** The credit a supplier gives and how punctually the shop pays it. */
export function supplierTerms(
  supplierId: string,
  purchases: PurchaseLike[],
  payments: Pick<SupplierPayment, 'supplierId' | 'amountCents' | 'createdAt'>[],
  today: string,
): SupplierTerms {
  const onCredit = purchases.filter((p) => p.supplierId === supplierId && p.payment === 'credit' && !p.voidedAt);
  const dueOf = (p: PurchaseLike) => p.dueDate ?? toLocalDateString(addDays(new Date(p.createdAt), DEFAULT_TERM_DAYS));
  const terms = onCredit.map((p) => daysBetweenDateStrings(toLocalDateString(new Date(p.createdAt)), dueOf(p)));
  const debts = onCredit.map((p) => ({ createdAt: p.createdAt, dueDate: dueOf(p), amountCents: p.totalCents }));
  return {
    ...(terms.length > 0 ? { avgTermDays: Math.round(terms.reduce((a, d) => a + d, 0) / terms.length) } : {}),
    punctuality: punctuality(
      debts,
      payments.filter((p) => p.supplierId === supplierId),
      today,
    ),
  };
}

export interface PurchaseReport {
  count: number;
  totalCents: Cents;
  /** Paid at the time (from the till or another way), and bought on credit. */
  paidNowCents: Cents;
  onCreditCents: Cents;
  /** Most money first; no supplier = undefined. */
  bySupplier: { supplierId?: string; totalCents: Cents; count: number }[];
  /** Most money first. */
  byProduct: { productId: string; name: string; quantity: number; soldBy?: 'weight'; totalCents: Cents }[];
}

/** The valid purchases with from <= createdAt < to. */
export function purchaseReport(purchases: PurchaseLike[], from: Date, to: Date): PurchaseReport {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const inPeriod = purchases.filter((p) => !p.voidedAt && p.createdAt >= fromIso && p.createdAt < toIso);
  const suppliers = new Map<string, { supplierId?: string; totalCents: Cents; count: number }>();
  const products = new Map<string, PurchaseReport['byProduct'][number]>();
  for (const p of inPeriod) {
    const key = p.supplierId ?? '';
    const s = suppliers.get(key) ?? { ...(p.supplierId ? { supplierId: p.supplierId } : {}), totalCents: 0, count: 0 };
    s.totalCents += p.totalCents;
    s.count += 1;
    suppliers.set(key, s);
    for (const i of p.items) {
      const row = products.get(i.productId) ?? {
        productId: i.productId,
        name: i.name,
        quantity: 0,
        ...(i.soldBy ? { soldBy: i.soldBy } : {}),
        totalCents: 0,
      };
      row.quantity += i.quantity;
      row.totalCents += i.lineTotalCents;
      products.set(i.productId, row);
    }
  }
  const totalCents = inPeriod.reduce((a, p) => a + p.totalCents, 0);
  const onCreditCents = inPeriod.filter((p) => p.payment === 'credit').reduce((a, p) => a + p.totalCents, 0);
  return {
    count: inPeriod.length,
    totalCents,
    paidNowCents: totalCents - onCreditCents,
    onCreditCents,
    bySupplier: [...suppliers.values()].sort((a, b) => b.totalCents - a.totalCents),
    byProduct: [...products.values()].sort((a, b) => b.totalCents - a.totalCents),
  };
}
