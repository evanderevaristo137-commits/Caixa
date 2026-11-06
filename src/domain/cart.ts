import { lineTotal, sumCents } from '../lib/money';
import type { Cents, Product, SaleItem } from './types';

export interface CartLine {
  productId: string;
  name: string;
  unitPriceCents: Cents;
  quantity: number;
}

export type Cart = CartLine[];

export function addToCart(cart: Cart, product: Pick<Product, 'id' | 'name' | 'priceCents'>, qty = 1): Cart {
  const existing = cart.find((l) => l.productId === product.id);
  if (existing) {
    return cart.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + qty } : l));
  }
  return [...cart, { productId: product.id, name: product.name, unitPriceCents: product.priceCents, quantity: qty }];
}

/** Sets a line's quantity; 0 or less removes the line. */
export function setQuantity(cart: Cart, productId: string, quantity: number): Cart {
  if (!Number.isInteger(quantity)) throw new Error('Quantity must be a whole number');
  if (quantity <= 0) return cart.filter((l) => l.productId !== productId);
  return cart.map((l) => (l.productId === productId ? { ...l, quantity } : l));
}

export function cartItems(cart: Cart): SaleItem[] {
  return cart.map((l) => ({
    productId: l.productId,
    name: l.name,
    unitPriceCents: l.unitPriceCents,
    quantity: l.quantity,
    lineTotalCents: lineTotal(l.unitPriceCents, l.quantity),
  }));
}

export function cartTotal(cart: Cart): Cents {
  return sumCents(cartItems(cart).map((i) => i.lineTotalCents));
}

export function cartCount(cart: Cart): number {
  return cart.reduce((acc, l) => acc + l.quantity, 0);
}

/** Change to give back for a cash payment; null if the customer handed over too little. */
export function changeDue(totalCents: Cents, receivedCents: Cents): Cents | null {
  return receivedCents >= totalCents ? receivedCents - totalCents : null;
}
