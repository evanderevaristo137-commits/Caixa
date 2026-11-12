import { useCallback, useEffect, useState } from 'react';
import type { Store } from '../../data/store';
import type { DataMode } from '../../data/db';
import { parseOpenSale, reconcileCart, sameLines, type Cart } from '../../domain/cart';
import { hold, parseHeld, resume, type HeldCart } from '../../domain/held';
import type { Product, Sale } from '../../domain/types';
import { isUuid, uuid } from '../../lib/ids';

interface OpenSale {
  /** Becomes the id of the sale: the same cart can never be recorded twice. */
  id: string;
  lines: Cart;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable: nothing was saved
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the cart just isn't saved */
  }
};

function readOpen(key: string): OpenSale {
  const saved = parseOpenSale(read(key));
  return { id: isUuid(saved.id) ? saved.id : uuid(), lines: saved.lines };
}

/** Held sales, each under a valid id that no other one uses (older versions and edits by hand are repaired). */
function readHeld(key: string): HeldCart[] {
  const seen = new Set<string>();
  return parseHeld(read(key)).map((h) => {
    const id = isUuid(h.id) && !seen.has(h.id) ? h.id : uuid();
    seen.add(id);
    return { ...h, id };
  });
}

/**
 * The sale being rung up and the sales on hold. Both are kept on the phone, so they survive if
 * Android closes the app mid-sale. Each cart has an id from its first product to the moment it is
 * recorded: if the app closes just after a sale was saved, the cart that comes back is recognised
 * as already sold instead of being charged again.
 */
export function useOpenSale(store: Store, mode: DataMode, products: Product[] | undefined) {
  const cartKey = `caixa.cart.${mode}`;
  const heldKey = `caixa.held.${mode}`;
  const [initial] = useState(() => readOpen(cartKey));
  const [open, setOpen] = useState<OpenSale>(initial);
  const [held, setHeld] = useState<HeldCart[]>(() => readHeld(heldKey));
  /** A sale found already recorded: the shopkeeper is told, so nobody wonders where the cart went. */
  const [alreadySaved, setAlreadySaved] = useState<Sale | null>(null);

  useEffect(() => {
    write(cartKey, open.lines.length === 0 ? null : JSON.stringify(open));
  }, [open, cartKey]);
  useEffect(() => {
    write(heldKey, held.length === 0 ? null : JSON.stringify(held));
  }, [held, heldKey]);

  const setCart = useCallback((change: (cart: Cart) => Cart) => {
    setOpen((o) => {
      const lines = change(o.lines);
      return lines === o.lines ? o : { ...o, lines };
    });
  }, []);

  // Keep names and prices current if a product is edited or archived while it is in the cart.
  useEffect(() => {
    if (products) setCart((c) => reconcileCart(c, products));
  }, [products, setCart]);

  /**
   * Was this cart already recorded? If so it is emptied (and the shopkeeper told); a cart that only
   * shares the id of another sale gets a new id. Returns true when the cart was emptied.
   */
  const settle = useCallback(
    async (candidate: OpenSale): Promise<boolean> => {
      const sale = await store.sales.get(candidate.id);
      if (!sale) return false;
      const sold = sameLines(candidate.lines, sale.items);
      const nextId = uuid();
      setOpen((o) => (o.id !== candidate.id ? o : { id: nextId, lines: sold ? [] : o.lines }));
      if (sold) setAlreadySaved(sale);
      return sold;
    },
    [store],
  );

  // The cart that was on the phone when the screen opened: Android may have closed the app just after it was sold.
  useEffect(() => {
    if (initial.lines.length > 0) void settle(initial).catch(() => undefined);
  }, [initial, settle]);

  /** The sale was recorded: a new, empty one starts. */
  const finish = useCallback(() => setOpen({ id: uuid(), lines: [] }), []);

  /** Reads the products again and brings the cart up to date (the Store refused it as it was). */
  const refresh = useCallback(async () => {
    const current = await store.products.list();
    setCart((c) => reconcileCart(c, current));
  }, [store, setCart]);

  /** Puts the cart on hold and starts a new sale. False when there is no room (or nothing to hold). */
  const putOnHold = (): boolean => {
    const next = hold(held, open.lines, open.id, new Date());
    if (!next) return false;
    setHeld(next);
    finish();
    return true;
  };

  /** Takes a held sale back; the one being served goes on hold in its place. */
  const takeBack = (id: string) => {
    const r = resume(held, id, open.lines, open.id, new Date());
    if (!r) return false;
    setHeld(r.held);
    setOpen({ id: r.id, lines: products ? reconcileCart(r.cart, products) : r.cart });
    return true;
  };

  return {
    cart: open.lines,
    saleId: open.id,
    setCart,
    held,
    putOnHold,
    takeBack,
    finish,
    refresh,
    /** The Store said this sale already exists: empty the cart if it is the same one. */
    settle: () => settle(open),
    alreadySaved,
    dismissAlreadySaved: () => setAlreadySaved(null),
  };
}
