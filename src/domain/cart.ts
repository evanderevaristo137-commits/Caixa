import { sumCents } from '../lib/money';
import { articleCount, lineTotalFor, type SoldBy } from './quantity';
import type { Cents, Product, SaleItem } from './types';

export interface CartLine {
  productId: string;
  name: string;
  /** Price per unit, or per kg for products sold by weight. */
  unitPriceCents: Cents;
  /** Units, or GRAMS for products sold by weight. */
  quantity: number;
  soldBy?: SoldBy;
  /** "500 Kz de feijão": the customer asked for an amount, so the line costs exactly that. */
  fixedTotalCents?: Cents;
}

export type Cart = CartLine[];

export function addToCart(cart: Cart, product: Pick<Product, 'id' | 'name' | 'priceCents'>, qty = 1): Cart {
  const existing = cart.find((l) => l.productId === product.id);
  if (existing) {
    return cart.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + qty } : l));
  }
  return [...cart, { productId: product.id, name: product.name, unitPriceCents: product.priceCents, quantity: qty }];
}

/**
 * Products sold by weight have one line each: the weight sheet sets the whole weight
 * (and, when the customer asked for an amount, that exact amount). 0 removes the line.
 */
export function setWeightLine(
  cart: Cart,
  product: Pick<Product, 'id' | 'name' | 'priceCents'>,
  grams: number,
  fixedTotalCents?: Cents,
): Cart {
  if (!Number.isInteger(grams)) throw new Error('Weight must be whole grams');
  if (grams <= 0) return cart.filter((l) => l.productId !== product.id);
  const line: CartLine = {
    productId: product.id,
    name: product.name,
    unitPriceCents: product.priceCents,
    quantity: grams,
    soldBy: 'weight',
    ...(fixedTotalCents !== undefined ? { fixedTotalCents } : {}),
  };
  return cart.some((l) => l.productId === product.id) ? cart.map((l) => (l.productId === product.id ? line : l)) : [...cart, line];
}

/** Sets a line's quantity; 0 or less removes the line. */
export function setQuantity(cart: Cart, productId: string, quantity: number): Cart {
  if (!Number.isInteger(quantity)) throw new Error('Quantity must be a whole number');
  if (quantity <= 0) return cart.filter((l) => l.productId !== productId);
  // A new weight replaces an amount the customer had asked for.
  return cart.map((l) => (l.productId === productId ? { ...l, quantity, fixedTotalCents: undefined } : l));
}

/** What one cart line costs (an amount asked by the customer, or quantity × price). */
export function lineTotalOf(l: CartLine): Cents {
  return l.fixedTotalCents ?? lineTotalFor(l.unitPriceCents, l.quantity, l.soldBy);
}

export function cartItems(cart: Cart): SaleItem[] {
  return cart.map((l) => ({
    productId: l.productId,
    name: l.name,
    unitPriceCents: l.unitPriceCents,
    quantity: l.quantity,
    lineTotalCents: lineTotalOf(l),
    ...(l.soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
  }));
}

export function cartTotal(cart: Cart): Cents {
  return sumCents(cartItems(cart).map((i) => i.lineTotalCents));
}

/** Articles in the cart: units count one by one, each weighed product counts as one. */
export function cartCount(cart: Cart): number {
  return articleCount(cart);
}

/** Change to give back for a cash payment; null if the customer handed over too little. */
export function changeDue(totalCents: Cents, receivedCents: Cents): Cents | null {
  return receivedCents >= totalCents ? receivedCents - totalCents : null;
}

/**
 * Brings a cart up to date with the current products: refreshes name and price,
 * and drops products that were archived or deleted. Returns the same array when nothing changed.
 */
export function reconcileCart(cart: Cart, products: Pick<Product, 'id' | 'name' | 'priceCents' | 'archivedAt'>[]): Cart {
  const byId = new Map(products.map((p) => [p.id, p]));
  let changed = false;
  const next: Cart = [];
  for (const line of cart) {
    const p = byId.get(line.productId);
    if (!p || p.archivedAt) {
      changed = true;
      continue;
    }
    if (p.name !== line.name || p.priceCents !== line.unitPriceCents) {
      changed = true;
      // A new price cancels an amount asked by the customer: the weighed quantity stays.
      const fixed = p.priceCents === line.unitPriceCents ? line.fixedTotalCents : undefined;
      next.push({ ...line, name: p.name, unitPriceCents: p.priceCents, fixedTotalCents: fixed });
    } else {
      next.push(line);
    }
  }
  return changed ? next : cart;
}

/** Reads a cart saved on the phone; anything malformed is ignored. */
export function parseStoredCart(raw: string | null): Cart {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (l): l is CartLine =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as CartLine).productId === 'string' &&
        typeof (l as CartLine).name === 'string' &&
        Number.isInteger((l as CartLine).unitPriceCents) &&
        Number.isInteger((l as CartLine).quantity) &&
        (l as CartLine).quantity > 0 &&
        ((l as CartLine).soldBy === undefined || (l as CartLine).soldBy === 'weight' || (l as CartLine).soldBy === 'unit') &&
        ((l as CartLine).fixedTotalCents === undefined || Number.isInteger((l as CartLine).fixedTotalCents)),
    );
  } catch {
    return [];
  }
}

/** Angolan notes used to suggest "how much did the customer hand over". */
const NOTE_STEPS_CENTS = [500, 1_000, 2_000, 5_000, 10_000, 20_000].map((kz) => kz * 100);

/** Likely amounts handed over for a cash payment (above the total), smallest first, at most 3. */
export function cashSuggestions(totalCents: Cents): Cents[] {
  if (totalCents <= 0) return [];
  const values = new Set<Cents>();
  for (const step of NOTE_STEPS_CENTS) {
    const rounded = Math.ceil(totalCents / step) * step;
    if (rounded > totalCents) values.add(rounded);
  }
  return [...values].sort((a, b) => a - b).slice(0, 3);
}
