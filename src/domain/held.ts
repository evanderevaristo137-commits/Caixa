import { parseStoredCart, type Cart } from './cart';

/** Sales put on hold: several customers served at once at busy times. Kept on the phone. */
export interface HeldCart {
  id: string;
  cart: Cart;
  /** When it was put on hold (ISO). */
  at: string;
}

export const MAX_HELD = 5;

export function parseHeld(raw: string | null): HeldCart[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((h): h is HeldCart => typeof h === 'object' && h !== null && typeof h.id === 'string' && typeof h.at === 'string')
      .map((h) => ({ id: h.id, at: h.at, cart: parseStoredCart(JSON.stringify(h.cart)) }))
      .filter((h) => h.cart.length > 0)
      .slice(0, MAX_HELD);
  } catch {
    return [];
  }
}

/** Puts a cart on hold (newest first). Returns null when the list is full or the cart is empty. */
export function hold(list: HeldCart[], cart: Cart, id: string, now: Date): HeldCart[] | null {
  if (cart.length === 0 || list.length >= MAX_HELD) return null;
  return [{ id, cart, at: now.toISOString() }, ...list];
}

/**
 * Takes a held sale back. The cart being served (if any) goes on hold in its place,
 * so nothing is ever lost by switching between customers.
 */
export function resume(list: HeldCart[], id: string, current: Cart, newId: string, now: Date): { cart: Cart; held: HeldCart[] } | null {
  const chosen = list.find((h) => h.id === id);
  if (!chosen) return null;
  const rest = list.filter((h) => h.id !== id);
  return { cart: chosen.cart, held: current.length > 0 ? [{ id: newId, cart: current, at: now.toISOString() }, ...rest] : rest };
}
