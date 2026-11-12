import { sumCents } from '../lib/money';
import { amountFitsWeight, articleCount, lineTotalFor, type SoldBy } from './quantity';
import type { Cents, Product, Sale, SaleItem } from './types';

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

/**
 * The cart of a recorded sale, with its prices and line totals (to record it again when its payment
 * never came). Weighed goods keep exactly what the line cost (rounding, or an amount asked).
 */
export function cartOfSale(sale: Pick<Sale, 'items'>): Cart {
  return sale.items.map((i) => ({
    productId: i.productId,
    name: i.name,
    unitPriceCents: i.unitPriceCents,
    quantity: i.quantity,
    ...(i.soldBy === 'weight' ? { soldBy: i.soldBy, fixedTotalCents: i.lineTotalCents } : {}),
  }));
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

/** Why a cart line can no longer be sold as it is. */
export type LineProblem = 'unavailable' | 'sold_by' | 'price' | 'amount';

/**
 * Checks a cart line against the product as it is now. The product decides the price and how it is
 * sold: what the screen remembers is only compared with it, never trusted.
 */
export function lineProblem(
  line: CartLine,
  product: Pick<Product, 'priceCents' | 'soldBy' | 'archivedAt'> | undefined,
): LineProblem | null {
  if (!product || product.archivedAt) return 'unavailable';
  if ((product.soldBy ?? 'unit') !== (line.soldBy ?? 'unit')) return 'sold_by';
  if (product.priceCents !== line.unitPriceCents) return 'price';
  if (line.fixedTotalCents !== undefined) {
    // Only weighed products take an amount asked by the customer, and it must match the weight.
    if (line.soldBy !== 'weight' || !amountFitsWeight(line.fixedTotalCents, line.quantity, product.priceCents)) return 'amount';
  }
  return null;
}

/** One line of a sale: name and price come from the product, the quantity from the cart. */
export function saleItem(line: CartLine, product: Pick<Product, 'id' | 'name' | 'priceCents' | 'soldBy'>): SaleItem {
  const soldBy = product.soldBy ?? 'unit';
  return {
    productId: product.id,
    name: product.name,
    unitPriceCents: product.priceCents,
    quantity: line.quantity,
    lineTotalCents: line.fixedTotalCents ?? lineTotalFor(product.priceCents, line.quantity, soldBy),
    ...(soldBy === 'weight' ? { soldBy: 'weight' as const } : {}),
  };
}

/** True when the cart holds exactly what a sale recorded (same products and quantities). */
export function sameLines(cart: Cart, items: Pick<SaleItem, 'productId' | 'quantity'>[]): boolean {
  if (cart.length !== items.length) return false;
  const left = new Map<string, number>();
  for (const i of items) left.set(i.productId, (left.get(i.productId) ?? 0) + i.quantity);
  for (const l of cart) left.set(l.productId, (left.get(l.productId) ?? 0) - l.quantity);
  return [...left.values()].every((v) => v === 0);
}

/**
 * Brings a cart up to date with the current products: refreshes name and price, and drops what can
 * no longer be sold (archived or deleted products). Returns the same array when nothing changed.
 */
export function reconcileCart(cart: Cart, products: Pick<Product, 'id' | 'name' | 'priceCents' | 'soldBy' | 'archivedAt'>[]): Cart {
  const byId = new Map(products.map((p) => [p.id, p]));
  let changed = false;
  const next: Cart = [];
  for (const line of cart) {
    const p = byId.get(line.productId);
    const problem = lineProblem(line, p);
    if (!p || problem === 'unavailable' || problem === 'sold_by') {
      changed = true;
      continue;
    }
    if (problem || p.name !== line.name) {
      changed = true;
      // A new price cancels an amount asked by the customer: the weighed quantity stays.
      next.push({ ...line, name: p.name, unitPriceCents: p.priceCents, fixedTotalCents: problem ? undefined : line.fixedTotalCents });
    } else {
      next.push(line);
    }
  }
  return changed ? next : cart;
}

const isLine = (l: unknown): l is CartLine =>
  typeof l === 'object' &&
  l !== null &&
  typeof (l as CartLine).productId === 'string' &&
  typeof (l as CartLine).name === 'string' &&
  Number.isInteger((l as CartLine).unitPriceCents) &&
  Number.isInteger((l as CartLine).quantity) &&
  (l as CartLine).quantity > 0 &&
  ((l as CartLine).soldBy === undefined || (l as CartLine).soldBy === 'weight' || (l as CartLine).soldBy === 'unit') &&
  ((l as CartLine).fixedTotalCents === undefined || Number.isInteger((l as CartLine).fixedTotalCents));

/** The valid lines of a cart read from somewhere it cannot be trusted (the phone's storage). */
export function parseLines(data: unknown): Cart {
  return Array.isArray(data) ? data.filter(isLine) : [];
}

/**
 * The sale being rung up, as it is kept on the phone. Its id is born with the cart and becomes
 * the id of the sale, so the same cart can never be recorded twice.
 */
export interface OpenSale {
  id?: string;
  lines: Cart;
}

/** Reads the sale kept on the phone; anything malformed is ignored. Older versions kept only the lines. */
export function parseOpenSale(raw: string | null): OpenSale {
  if (!raw) return { lines: [] };
  try {
    const data: unknown = JSON.parse(raw);
    if (Array.isArray(data)) return { lines: parseLines(data) };
    if (typeof data !== 'object' || data === null) return { lines: [] };
    const { id, lines } = data as { id?: unknown; lines?: unknown };
    return { ...(typeof id === 'string' ? { id } : {}), lines: parseLines(lines) };
  } catch {
    return { lines: [] };
  }
}

/** Reads a cart saved on the phone; anything malformed is ignored. */
export function parseStoredCart(raw: string | null): Cart {
  return parseOpenSale(raw).lines;
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
