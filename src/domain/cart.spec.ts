import { describe, expect, it } from 'vitest';
import { addToCart, cartCount, cartItems, cartTotal, changeDue, parseStoredCart, reconcileCart, setQuantity } from './cart';

const rice = { id: 'p1', name: 'Arroz 1 kg', priceCents: 120_000 };
const oil = { id: 'p2', name: 'Óleo 1 L', priceCents: 185_000 };
const soap = { id: 'p3', name: 'Sabão', priceCents: 25_000 };

describe('cart', () => {
  it('adds products and merges repeated taps', () => {
    let cart = addToCart([], rice);
    cart = addToCart(cart, oil);
    cart = addToCart(cart, rice);
    expect(cart).toHaveLength(2);
    expect(cart[0]!.quantity).toBe(2);
    expect(cartCount(cart)).toBe(3);
  });

  it('computes the total of 3 products exactly', () => {
    let cart = addToCart([], rice, 2);
    cart = addToCart(cart, oil);
    cart = addToCart(cart, soap, 3);
    expect(cartTotal(cart)).toBe(2 * 120_000 + 185_000 + 3 * 25_000);
    expect(cartItems(cart).map((i) => i.lineTotalCents)).toEqual([240_000, 185_000, 75_000]);
  });

  it('changes and removes quantities', () => {
    let cart = addToCart([], rice);
    cart = setQuantity(cart, 'p1', 5);
    expect(cartTotal(cart)).toBe(600_000);
    cart = setQuantity(cart, 'p1', 0);
    expect(cart).toEqual([]);
    expect(cartTotal(cart)).toBe(0);
  });

  it('keeps the price snapshot even if the product changes later', () => {
    const cart = addToCart([], rice);
    rice.priceCents = 999;
    expect(cartTotal(cart)).toBe(120_000);
    rice.priceCents = 120_000;
  });

  it('computes change for cash', () => {
    expect(changeDue(185_000, 200_000)).toBe(15_000);
    expect(changeDue(185_000, 185_000)).toBe(0);
    expect(changeDue(185_000, 100_000)).toBeNull();
  });
});

describe('cart persistence helpers', () => {
  it('refreshes prices and drops archived products', () => {
    const cart = addToCart(addToCart([], rice), oil, 2);
    const products = [
      { ...rice, priceCents: 130_000 },
      { ...oil, archivedAt: '2026-11-06T10:00:00Z' },
    ];
    const next = reconcileCart(cart, products);
    expect(next).toEqual([{ productId: 'p1', name: 'Arroz 1 kg', unitPriceCents: 130_000, quantity: 1 }]);
    expect(cartTotal(next)).toBe(130_000);
  });

  it('returns the same cart when nothing changed', () => {
    const cart = addToCart([], rice);
    expect(reconcileCart(cart, [rice])).toBe(cart);
  });

  it('ignores malformed saved carts', () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart('not json')).toEqual([]);
    expect(parseStoredCart('{"a":1}')).toEqual([]);
    const ok = { productId: 'p1', name: 'Arroz', unitPriceCents: 100, quantity: 2 };
    expect(parseStoredCart(JSON.stringify([ok, { ...ok, quantity: 0 }, { ...ok, unitPriceCents: 1.5 }]))).toEqual([ok]);
  });
});
