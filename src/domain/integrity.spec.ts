import { describe, expect, it } from 'vitest';
import { checkIntegrity, type IntegrityData } from './integrity';
import type { Sale } from './types';

const base = { createdAt: '', updatedAt: '' };
const product = { ...base, id: 'p1', name: 'Arroz', priceCents: 100, stock: 7, minStock: 0 };
const item = { productId: 'p1', name: 'Arroz', unitPriceCents: 100, quantity: 3, lineTotalCents: 300 };
const sale = (over: Partial<Sale> = {}): Sale => ({
  ...base,
  id: 's1',
  number: 1,
  items: [item],
  totalCents: 300,
  currency: 'AOA',
  method: 'cash',
  ...over,
});
const ok = (): IntegrityData => ({
  products: [product],
  movements: [
    { ...base, id: 'm1', productId: 'p1', type: 'entry', delta: 10 },
    { ...base, id: 'm2', productId: 'p1', type: 'sale', delta: -3, saleId: 's1' },
  ],
  sales: [sale()],
  customers: [{ ...base, id: 'c1', name: 'Cliente' }],
  payments: [],
});

describe('checkIntegrity', () => {
  it('finds nothing wrong in consistent data', () => {
    expect(checkIntegrity(ok())).toEqual([]);
  });
  it('detects stock that does not match the movements', () => {
    const d = ok();
    d.products = [{ ...product, stock: 9 }];
    expect(checkIntegrity(d)).toEqual([{ kind: 'stock_mismatch', productId: 'p1', name: 'Arroz', recorded: 9, computed: 7 }]);
  });
  it('detects sale totals that do not add up', () => {
    const d = ok();
    d.sales = [sale({ totalCents: 301 })];
    expect(checkIntegrity(d).map((i) => i.kind)).toEqual(['sale_total_mismatch']);
    d.sales = [sale({ items: [{ ...item, lineTotalCents: 299 }], totalCents: 299 })];
    expect(checkIntegrity(d).map((i) => i.kind)).toEqual(['sale_total_mismatch']);
  });
  it('detects credit sales and payments without a customer, orphan movements and repeated numbers', () => {
    const d = ok();
    d.sales = [sale({ method: 'credit', customerId: 'ghost' }), sale({ id: 's2' })];
    d.payments = [{ ...base, id: 'pay1', customerId: 'ghost', amountCents: 1, method: 'cash' }];
    d.movements.push({ ...base, id: 'm3', productId: 'gone', type: 'entry', delta: 1 });
    expect(
      checkIntegrity(d)
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['credit_without_customer', 'duplicate_sale_number', 'movement_without_product', 'payment_without_customer'].sort());
  });
});
