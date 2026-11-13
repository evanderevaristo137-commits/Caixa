import { lineTotal } from '../lib/money';
import { creditAccounts, type CreditAccount } from './credit';
import type { CreditPayment, Customer, Product, Sale, StockMovement } from './types';

export type IntegrityIssue =
  | { kind: 'stock_mismatch'; productId: string; name: string; recorded: number; computed: number }
  | { kind: 'sale_total_mismatch'; saleId: string; number: number }
  | { kind: 'credit_without_customer'; saleId: string; number: number }
  | { kind: 'payment_without_customer'; paymentId: string }
  | { kind: 'movement_without_product'; movementId: string }
  | { kind: 'duplicate_sale_number'; number: number }
  | { kind: 'account_mismatch'; customerId: string; name: string };

export interface IntegrityData {
  products: Product[];
  movements: StockMovement[];
  sales: Sale[];
  customers: Customer[];
  payments: CreditPayment[];
  /** The customers' saved accounts (checked against the sales and payments). */
  accounts?: CreditAccount[];
}

/** An account as a plain text, to compare a saved one with one worked out from the facts. */
const accountKey = (a: CreditAccount | undefined) =>
  a
    ? JSON.stringify([a.totalCreditCents, a.totalPaidCents, a.open.map((i) => [i.saleId ?? '', i.createdAt, i.dueDate, i.remainingCents])])
    : '';

/** The customers whose saved account differs from the one their sales and payments give (ids). */
export function accountDifferences(saved: CreditAccount[], fromFacts: CreditAccount[]): string[] {
  const savedBy = new Map(saved.map((a) => [a.customerId, a]));
  const factsBy = new Map(fromFacts.map((a) => [a.customerId, a]));
  return [...new Set([...savedBy.keys(), ...factsBy.keys()])].filter((id) => accountKey(savedBy.get(id)) !== accountKey(factsBy.get(id)));
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

  // Each phone numbers its own sales: the same number on two phones of the shop is fine.
  const numbers = new Map<string, { number: number; count: number }>();
  for (const s of d.sales) {
    const key = `${s.deviceId ?? ''}|${s.number}`;
    numbers.set(key, { number: s.number, count: (numbers.get(key)?.count ?? 0) + 1 });
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
  for (const { number, count } of numbers.values()) if (count > 1) issues.push({ kind: 'duplicate_sale_number', number });
  for (const p of d.payments) if (!customerIds.has(p.customerId)) issues.push({ kind: 'payment_without_customer', paymentId: p.id });
  if (d.accounts) {
    const names = new Map(d.customers.map((c) => [c.id, c.name]));
    for (const customerId of accountDifferences(d.accounts, creditAccounts(d.sales, d.payments))) {
      issues.push({ kind: 'account_mismatch', customerId, name: names.get(customerId) ?? '—' });
    }
  }
  return issues;
}
