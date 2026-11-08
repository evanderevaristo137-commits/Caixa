import { lineTotal } from '../lib/money';
import type { CreditPayment, Customer, Product, Sale, StockMovement } from './types';

export type IntegrityIssue =
  | { kind: 'stock_mismatch'; productId: string; name: string; recorded: number; computed: number }
  | { kind: 'sale_total_mismatch'; saleId: string; number: number }
  | { kind: 'credit_without_customer'; saleId: string; number: number }
  | { kind: 'payment_without_customer'; paymentId: string }
  | { kind: 'movement_without_product'; movementId: string }
  | { kind: 'duplicate_sale_number'; number: number };

export interface IntegrityData {
  products: Product[];
  movements: StockMovement[];
  sales: Sale[];
  customers: Customer[];
  payments: CreditPayment[];
}

/**
 * Re-checks the numbers from the original facts: stock = sum of movements, sale total = sum of
 * its lines, every credit sale and payment belongs to a customer. An empty list means all is right.
 */
export function checkIntegrity(d: IntegrityData): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const productIds = new Set(d.products.map((p) => p.id));
  const customerIds = new Set(d.customers.map((c) => c.id));

  const movementSum = new Map<string, number>();
  for (const m of d.movements) {
    if (!productIds.has(m.productId)) issues.push({ kind: 'movement_without_product', movementId: m.id });
    movementSum.set(m.productId, (movementSum.get(m.productId) ?? 0) + m.delta);
  }
  for (const p of d.products) {
    const computed = movementSum.get(p.id) ?? 0;
    if (computed !== p.stock) issues.push({ kind: 'stock_mismatch', productId: p.id, name: p.name, recorded: p.stock, computed });
  }

  const numbers = new Map<number, number>();
  for (const s of d.sales) {
    numbers.set(s.number, (numbers.get(s.number) ?? 0) + 1);
    const linesOk = s.items.every((i) =>
      i.soldBy === 'weight'
        ? // rounded to the whole kwanza, or an amount asked by the customer: within 1 Kz + one gram's price
          Math.abs(i.lineTotalCents - (i.unitPriceCents * i.quantity) / 1000) <= 100 + i.unitPriceCents / 1000
        : i.lineTotalCents === lineTotal(i.unitPriceCents, i.quantity),
    );
    const sum = s.items.reduce((a, i) => a + i.lineTotalCents, 0);
    if (!linesOk || sum !== s.totalCents) issues.push({ kind: 'sale_total_mismatch', saleId: s.id, number: s.number });
    if (s.method === 'credit' && (!s.customerId || !customerIds.has(s.customerId))) {
      issues.push({ kind: 'credit_without_customer', saleId: s.id, number: s.number });
    }
  }
  for (const [number, count] of numbers) if (count > 1) issues.push({ kind: 'duplicate_sale_number', number });
  for (const p of d.payments) if (!customerIds.has(p.customerId)) issues.push({ kind: 'payment_without_customer', paymentId: p.id });
  return issues;
}
