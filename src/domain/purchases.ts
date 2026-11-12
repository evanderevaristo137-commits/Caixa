import { formatDate } from '../lib/dates';
import { lineCostCents } from './profit';
import { formatQuantity } from './quantity';
import type { Cents, PurchaseItem } from './types';
import { greeting } from './whatsapp';

/** Cost of one purchased line: units × cost, or grams × cost per kg (rounded to the cêntimo). */
export function purchaseLineTotal(line: Pick<PurchaseItem, 'quantity' | 'soldBy' | 'unitCostCents'>): Cents {
  return lineCostCents(line)!;
}

export const purchaseTotal = (lines: Pick<PurchaseItem, 'quantity' | 'soldBy' | 'unitCostCents'>[]): Cents =>
  lines.reduce((a, l) => a + purchaseLineTotal(l), 0);

/** Polite order for a supplier, ready to send by WhatsApp (the shopkeeper can change it before sending). */
export function supplierOrderText(
  storeName: string,
  supplierName: string,
  lines: { name: string; suggested: number; soldBy?: 'weight' }[],
  now: Date,
): string {
  const firstName = supplierName.trim();
  const out = [`*Encomenda — ${storeName}*`, formatDate(now.toISOString()), '', `${greeting(now)}, ${firstName}! Queria encomendar:`];
  for (const l of lines) out.push(`• ${l.name}: ${formatQuantity(l.suggested, l.soldBy)}`);
  out.push('', 'Obrigado!');
  return out.join('\n');
}

/**
 * The cost price of a product after a purchase. Usually the cost of this purchase ("comprei a 350,
 * o custo é 350"). With the average cost (optional): what was on the shelf at its cost, plus what came
 * in at its cost, divided by the total, to the cêntimo; the purchase cost alone when there was no
 * stock (or it was negative) or no cost known. Weighed goods: grams weigh, costs are per kg.
 */
export function costAfterPurchase(
  before: { stock: number; costCents?: Cents },
  quantity: number,
  unitCostCents: Cents,
  method?: 'average',
): Cents {
  if (method !== 'average' || before.costCents === undefined || before.stock <= 0) return unitCostCents;
  return Math.round((before.stock * before.costCents + quantity * unitCostCents) / (before.stock + quantity));
}
