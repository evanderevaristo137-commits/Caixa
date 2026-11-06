import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { addToCart, cartCount, cartTotal, parseStoredCart, reconcileCart, type Cart } from '../../domain/cart';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Button, Empty, Money, normalise, Skeleton } from '../../ui/kit';
import { CartSheet } from './CartSheet';
import { CheckoutSheet } from './CheckoutSheet';
import { Scanner, scannerSupported } from './Scanner';

export function SellScreen() {
  const { store, mode, setMode, showToast } = useApp();
  const products = useLiveQuery(() => store.products.list(), [store]);
  // The cart is saved on the phone, so it survives if Android closes the app mid-sale.
  const cartKey = `caixa.cart.${mode}`;
  const [cart, setCart] = useState<Cart>(() => {
    try {
      return parseStoredCart(localStorage.getItem(cartKey));
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<'none' | 'cart' | 'checkout' | 'scan'>('none');

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = normalise(query);
    if (!q) return products;
    return products.filter((p) => normalise(p.name).includes(q) || (p.barcode ?? '').startsWith(q));
  }, [products, query]);

  useEffect(() => {
    if (cart.length === 0 && (sheet === 'cart' || sheet === 'checkout')) setSheet('none');
  }, [cart.length, sheet]);

  useEffect(() => {
    try {
      if (cart.length === 0) localStorage.removeItem(cartKey);
      else localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      /* storage unavailable: the cart just isn't saved */
    }
  }, [cart, cartKey]);

  // Keep names/prices current if a product is edited or archived while it is in the cart.
  useEffect(() => {
    if (products) setCart((c) => reconcileCart(c, products));
  }, [products]);

  const qtyIn = useMemo(() => new Map(cart.map((l) => [l.productId, l.quantity])), [cart]);
  const add = (p: Product) => {
    setCart((c) => addToCart(c, p));
    navigator.vibrate?.(15);
  };

  const onCode = useCallback(
    async (code: string) => {
      setSheet('none');
      const p = await store.products.findByBarcode(code);
      if (p) {
        setCart((c) => addToCart(c, p));
        showToast(`+1 ${p.name}`);
      } else {
        showToast(t.scanner.notFound(code));
      }
    },
    [store, showToast],
  );

  const onSearchEnter = async () => {
    const code = query.trim();
    if (!/^\d{6,}$/.test(code)) return;
    const p = await store.products.findByBarcode(code);
    if (p) {
      add(p);
      setQuery('');
    }
  };

  const count = cartCount(cart);
  const total = cartTotal(cart);

  return (
    <div>
      <div className="sticky top-0 z-10 flex gap-2 bg-slate-100 p-3">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void onSearchEnter()}
          placeholder={t.sell.searchPlaceholder}
          aria-label={t.sell.searchPlaceholder}
          className="min-h-14 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-brand-700 focus:outline-none"
        />
        {scannerSupported() && (
          <Button variant="secondary" onClick={() => setSheet('scan')} aria-label={t.sell.scan} className="min-h-14 min-w-14">
            <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M14 8v8M17 8v8" />
            </svg>
          </Button>
        )}
      </div>

      {!products ? (
        <Skeleton rows={6} />
      ) : products.length === 0 ? (
        <Empty
          action={
            mode === 'store' ? (
              <Button variant="secondary" onClick={() => void setMode('demo')}>
                {t.settings.demoOn}
              </Button>
            ) : undefined
          }
        >
          {t.sell.empty}
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>{t.sell.noResults}</Empty>
      ) : (
        <ul className={`grid grid-cols-2 gap-2 px-3 ${count > 0 ? 'pb-24' : 'pb-3'}`}>
          {filtered.map((p) => {
            const inCart = qtyIn.get(p.id) ?? 0;
            const low = p.stock <= p.minStock;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  className={`relative flex min-h-24 w-full flex-col justify-between rounded-xl border-2 bg-white p-3 text-left active:bg-brand-50 ${inCart ? 'border-brand-600' : 'border-transparent'} shadow-sm`}
                >
                  <span className="line-clamp-2 text-base leading-snug font-semibold">{p.name}</span>
                  <span className="mt-1 flex items-end justify-between gap-1">
                    <Money cents={p.priceCents} className="text-lg font-bold text-brand-800" />
                    <span
                      className={`text-xs ${p.stock <= 0 ? 'font-bold text-red-700' : low ? 'font-semibold text-amber-700' : 'text-slate-500'}`}
                    >
                      {p.stock <= 0 ? t.sell.outOfStock : t.sell.stockLeft(p.stock)}
                    </span>
                  </span>
                  {inCart > 0 && (
                    <span className="absolute -top-2 -right-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-700 px-2 text-sm font-bold text-white">
                      {inCart}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 mb-[env(safe-area-inset-bottom)] px-3 pb-2">
          <div className="mx-auto flex max-w-lg gap-2 rounded-2xl bg-slate-900 p-2 shadow-xl">
            <button
              type="button"
              onClick={() => setSheet('cart')}
              className="flex-1 rounded-xl px-3 text-left text-white active:bg-slate-800"
            >
              <span className="block text-sm text-slate-300">{t.sell.cartItems(count)}</span>
              <Money cents={total} className="text-xl font-bold" />
            </button>
            <Button big onClick={() => setSheet('checkout')} className="px-8">
              {t.sell.charge}
            </Button>
          </div>
        </div>
      )}

      {sheet === 'scan' && <Scanner onCode={onCode} onClose={() => setSheet('none')} />}
      {sheet === 'cart' && (
        <CartSheet cart={cart} setCart={setCart} onClose={() => setSheet('none')} onCharge={() => setSheet('checkout')} />
      )}
      {sheet === 'checkout' && (
        <CheckoutSheet
          cart={cart}
          onClose={() => setSheet('none')}
          onDone={() => {
            setCart([]);
            setQuery('');
            setSheet('none');
          }}
        />
      )}
    </div>
  );
}
