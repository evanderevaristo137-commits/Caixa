import { describe, expect, it } from 'vitest';
import {
  addToCart,
  cartCount,
  cartItems,
  cartTotal,
  cashSuggestions,
  changeDue,
  lineProblem,
  parseOpenSale,
  parseStoredCart,
  reconcileCart,
  saleItem,
  sameLines,
  setQuantity,
  setWeightLine,
} from './cart';

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

describe('cashSuggestions', () => {
  it('suggests the next likely notes above the total', () => {
    expect(cashSuggestions(370_000)).toEqual([400_000, 500_000, 1_000_000]);
    expect(cashSuggestions(120_000)).toEqual([150_000, 200_000, 500_000]);
    expect(cashSuggestions(50_000)).toEqual([100_000, 200_000, 500_000]);
  });
  it('handles totals that are already round', () => {
    expect(cashSuggestions(1_000_000)).toEqual([2_000_000]);
    expect(cashSuggestions(500_000)).toEqual([600_000, 1_000_000, 2_000_000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});

describe('cart with products sold by weight', () => {
  const beans = { id: 'w1', name: 'Feijão a granel', priceCents: 140_000, soldBy: 'weight' as const }; // 1.400 Kz/kg

  it('one line per weighed product, set by the weight sheet', () => {
    let cart = setWeightLine([], beans, 750);
    cart = addToCart(cart, rice);
    expect(cartItems(cart)[0]).toMatchObject({ quantity: 750, soldBy: 'weight', lineTotalCents: 105_000 });
    cart = setWeightLine(cart, beans, 1_000);
    expect(cart.filter((l) => l.productId === 'w1')).toHaveLength(1);
    expect(cartTotal(cart)).toBe(140_000 + 120_000);
    expect(cartCount(cart)).toBe(2);
    expect(setWeightLine(cart, beans, 0).some((l) => l.productId === 'w1')).toBe(false);
  });

  it('"500 Kz de feijão" costs exactly 500 Kz', () => {
    const cart = setWeightLine([], beans, 357, 50_000);
    expect(cartTotal(cart)).toBe(50_000);
    // Changing the weight afterwards goes back to the price per kg.
    expect(cartTotal(setQuantity(cart, 'w1', 500))).toBe(70_000);
  });

  it('a new price cancels the asked amount; the saved cart keeps weights', () => {
    const cart = setWeightLine([], beans, 357, 50_000);
    expect(cartTotal(reconcileCart(cart, [{ ...beans, priceCents: 150_000 }]))).toBe(53_600);
    expect(parseStoredCart(JSON.stringify(cart))).toEqual(cart);
  });
});

describe('a cart line is checked against the product before it is sold', () => {
  const beans = { id: 'w1', name: 'Feijão a granel', priceCents: 140_000, soldBy: 'weight' as const };

  it('accepts a line that matches the product', () => {
    expect(lineProblem(addToCart([], rice)[0]!, rice)).toBeNull();
    expect(lineProblem(setWeightLine([], beans, 750)[0]!, beans)).toBeNull();
    expect(lineProblem(setWeightLine([], beans, 357, 50_000)[0]!, beans)).toBeNull();
  });

  it('refuses a product that is gone, archived or sold another way', () => {
    const line = addToCart([], rice)[0]!;
    expect(lineProblem(line, undefined)).toBe('unavailable');
    expect(lineProblem(line, { ...rice, archivedAt: '2026-11-06T10:00:00Z' })).toBe('unavailable');
    expect(lineProblem(line, { ...rice, soldBy: 'weight' })).toBe('sold_by');
    expect(lineProblem(setWeightLine([], beans, 750)[0]!, { ...beans, soldBy: undefined })).toBe('sold_by');
  });

  it('refuses a price that is not the product price, whatever the screen says', () => {
    const line = { ...addToCart([], rice)[0]!, unitPriceCents: 100 };
    expect(lineProblem(line, rice)).toBe('price');
  });

  it('refuses an asked amount that does not match the weight', () => {
    // 357 g at 1.400 Kz/kg is 499,80 Kz: "500 Kz" fits, "100 Kz" for the same weight does not.
    expect(lineProblem(setWeightLine([], beans, 357, 10_000)[0]!, beans)).toBe('amount');
    // Units never have an asked amount.
    expect(lineProblem({ ...addToCart([], rice)[0]!, fixedTotalCents: 100 }, rice)).toBe('amount');
  });

  it('builds the sale line from the product: its name and its price', () => {
    const tampered = { ...addToCart([], rice, 2)[0]!, name: 'Outro nome', unitPriceCents: 1 };
    expect(saleItem(tampered, rice)).toEqual({
      productId: 'p1',
      name: 'Arroz 1 kg',
      unitPriceCents: 120_000,
      quantity: 2,
      lineTotalCents: 240_000,
    });
    expect(saleItem(setWeightLine([], beans, 750)[0]!, beans)).toMatchObject({ soldBy: 'weight', quantity: 750, lineTotalCents: 105_000 });
    expect(saleItem(setWeightLine([], beans, 357, 50_000)[0]!, beans).lineTotalCents).toBe(50_000);
  });

  it('repairs a cart that can no longer be sold as it is', () => {
    const cart = [
      { ...addToCart([], rice)[0]!, fixedTotalCents: 100 }, // an amount on a unit line: dropped
      setWeightLine([], beans, 357, 10_000)[0]!, // an amount that does not match: back to the weight
      { ...addToCart([], oil)[0]!, soldBy: 'weight' as const }, // sold another way: the line goes
    ];
    const fixed = reconcileCart(cart, [rice, beans, oil]);
    expect(fixed).toHaveLength(2);
    expect(fixed.every((l) => l.fixedTotalCents === undefined)).toBe(true);
    expect(cartTotal(fixed)).toBe(120_000 + 50_000);
    for (const l of fixed)
      expect(
        lineProblem(
          l,
          [rice, beans].find((p) => p.id === l.productId),
        ),
      ).toBeNull();
  });
});

describe('the sale kept on the phone', () => {
  const line = { productId: 'p1', name: 'Arroz', unitPriceCents: 100, quantity: 2 };

  it('carries the id of the sale with the lines', () => {
    expect(parseOpenSale(JSON.stringify({ id: 'abc', lines: [line] }))).toEqual({ id: 'abc', lines: [line] });
  });

  it('still reads the format of older versions (only the lines)', () => {
    expect(parseOpenSale(JSON.stringify([line]))).toEqual({ lines: [line] });
    expect(parseStoredCart(JSON.stringify({ id: 'abc', lines: [line] }))).toEqual([line]);
  });

  it('ignores anything malformed', () => {
    expect(parseOpenSale(null)).toEqual({ lines: [] });
    expect(parseOpenSale('not json')).toEqual({ lines: [] });
    expect(parseOpenSale('7')).toEqual({ lines: [] });
    expect(parseOpenSale(JSON.stringify({ id: 7, lines: 'x' }))).toEqual({ lines: [] });
    expect(parseOpenSale(JSON.stringify({ id: 'abc', lines: [line, { ...line, quantity: 0 }] }))).toEqual({ id: 'abc', lines: [line] });
  });

  it('knows when a cart is exactly what a sale recorded', () => {
    const cart = addToCart(addToCart([], rice, 2), oil);
    const items = cartItems(cart);
    expect(sameLines(cart, items)).toBe(true);
    expect(sameLines(cart, [...items].reverse())).toBe(true);
    expect(sameLines(addToCart(cart, soap), items)).toBe(false);
    expect(sameLines(setQuantity(cart, 'p1', 3), items)).toBe(false);
    expect(sameLines([], items)).toBe(false);
    // A price that changed since does not make it another sale.
    expect(sameLines(reconcileCart(cart, [{ ...rice, priceCents: 1 }, oil]), items)).toBe(true);
  });
});
