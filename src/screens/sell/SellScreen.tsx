import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { ShowMore, usePaged } from '../../ui/paged';
import { addToCart, cartCount, cartTotal, setWeightLine } from '../../domain/cart';
import { formatKg, formatQuantity } from '../../domain/quantity';
import { formatKz } from '../../lib/money';
import { sortByFrequency } from '../../domain/ranking';
import { useFrozenRanking } from './use-ranking';
import type { Customer, Product, Sale } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatTime } from '../../lib/dates';
import type { HeldCart } from '../../domain/held';
import { Button, Empty, Money, normalise, Sheet, Skeleton } from '../../ui/kit';
import { ProductSheet } from '../products/ProductSheet';
import { CartIcon, PlusIcon } from '../../ui/icons';
import { promptInstall, useCanInstall } from '../../lib/install';
import { CartSheet } from './CartSheet';
import { WeightSheet } from './WeightSheet';
import { CheckoutSheet } from './CheckoutSheet';
import { ReceiptSheet } from './ReceiptSheet';
import { useOpenSale } from './use-open-sale';
import { Scanner, scannerSupported } from './Scanner';
import { activeCategory, CategoryChips } from '../../ui/CategoryChips';
import { inCategory } from '../../domain/categories';

/** Products drawn at once on Vender (300 products drawn at once are slow on a cheap phone). */
const SELL_PAGE = 60;

export function SellScreen() {
  const { store, mode, setMode, showToast } = useApp();
  const canInstall = useCanInstall();
  const products = useLiveQuery(() => store.products.list(), [store]);
  // The shop details, ready for the receipt the moment a sale is recorded.
  const settings = useLiveQuery(() => store.settings.get(), [store]);
  // Best sellers of the last 30 days first, fixed when the screen opens.
  const ranking = useFrozenRanking(store, mode, products);
  const ordered = useMemo(() => (products && ranking ? sortByFrequency(products, ranking) : undefined), [products, ranking]);
  // The sale being rung up and the ones on hold, kept on the phone.
  const { cart, saleId, setCart, held, putOnHold, takeBack, finish, refresh, settle, alreadySaved, dismissAlreadySaved } = useOpenSale(
    store,
    mode,
    products,
  );
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<'none' | 'cart' | 'checkout' | 'scan'>('none');
  // The sale just recorded, while its receipt is on the screen.
  const [receipt, setReceipt] = useState<{ sale: Sale; customer: Customer | null } | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState<string | null>(null);

  const [category, setCategory] = useState<string | null>(null);
  const shownCategory = products ? activeCategory(products, category) : null;
  const filtered = useMemo(() => {
    if (!ordered) return [];
    const q = normalise(query);
    // A search looks in every category.
    if (q) return ordered.filter((p) => normalise(p.name).includes(q) || (p.barcode ?? '').startsWith(q));
    return ordered.filter((p) => inCategory(p, shownCategory));
  }, [ordered, query, shownCategory]);
  // The best sellers come first, so a few dozen cover most sales; the rest with «Ver mais».
  const paged = usePaged(filtered, SELL_PAGE, `${query}|${shownCategory}`);

  useEffect(() => {
    if (cart.length === 0 && sheet === 'checkout') setSheet('none');
  }, [cart.length, sheet]);

  const qtyIn = useMemo(() => new Map(cart.map((l) => [l.productId, l.quantity])), [cart]);
  // Products sold by weight open the weighing sheet; the others go straight into the cart.
  const [weighing, setWeighing] = useState<Product | null>(null);
  const add = (p: Product) => {
    if (p.soldBy === 'weight') return setWeighing(p);
    setCart((c) => addToCart(c, p));
    navigator.vibrate?.(15);
  };

  const onCode = useCallback(
    async (code: string) => {
      setSheet('none');
      const p = await store.products.findByBarcode(code);
      if (p?.soldBy === 'weight') {
        setWeighing(p);
      } else if (p) {
        setCart((c) => addToCart(c, p));
        showToast(`+1 ${p.name}`);
      } else {
        setUnknownCode(code);
      }
    },
    [store, showToast, setCart],
  );

  const onSearchEnter = async () => {
    const code = query.trim();
    if (!/^\d{6,}$/.test(code)) return;
    const p = await store.products.findByBarcode(code);
    if (p) {
      add(p);
      setQuery('');
    } else {
      setUnknownCode(code);
    }
  };

  const count = cartCount(cart);
  const total = cartTotal(cart);

  const onHold = () => {
    if (!putOnHold()) return showToast(t.sell.heldFull);
    setSheet('none');
    setQuery('');
    showToast(t.sell.heldDone);
  };
  const onResume = (id: string) => {
    if (takeBack(id)) showToast(t.sell.resumed);
  };
  // The sale is recorded: the cart empties at once (so it can never be charged again) and the receipt shows.
  const onSaved = (sale: Sale, customer: Customer | null) => {
    finish();
    setQuery('');
    setSheet('none');
    setReceipt({ sale, customer });
  };
  // The Store refused the cart as it was (a price or a product changed): show it again, up to date.
  const onOutdated = async () => {
    await refresh();
    setSheet('cart');
    showToast(t.sell.cartChanged);
  };
  // The Store says this sale already exists: empty the cart if it is that sale, otherwise let them try again.
  const onDuplicate = async () => {
    setSheet('none');
    if (!(await settle())) showToast(t.errors.saveFailed);
  };
  const heldText = (h: HeldCart) => [formatTime(h.at), t.sell.cartItems(cartCount(h.cart)), formatKz(cartTotal(h.cart))] as const;

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
        <button
          type="button"
          onClick={() => setSheet('cart')}
          aria-label={t.sell.openCart(count === 0 ? t.sell.cartEmpty : `${t.sell.cartItems(count)}, ${formatKz(total)}`)}
          className={`relative flex min-h-14 min-w-14 items-center justify-center rounded-xl border-2 ${count > 0 ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700'} active:opacity-80`}
        >
          <CartIcon />
          {count > 0 && (
            <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-sm font-bold text-amber-950">
              {count}
            </span>
          )}
        </button>
      </div>

      {alreadySaved && (
        <div role="alert" className="mx-3 mb-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-amber-950">
          <p className="font-semibold">{t.sell.alreadySaved(alreadySaved.number, formatKz(alreadySaved.totalCents))}</p>
          <Button variant="secondary" className="mt-2 w-full" onClick={dismissAlreadySaved}>
            {t.sell.alreadySavedOk}
          </Button>
        </div>
      )}

      {held.length > 0 && (
        <div className="-mt-1 flex items-center gap-2 overflow-x-auto px-3 pb-2" role="group" aria-label={t.sell.heldTitle}>
          <span className="shrink-0 text-sm font-bold text-amber-800">{t.sell.heldTitle}:</span>
          {held.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onResume(h.id)}
              aria-label={t.sell.resumeHeld(...heldText(h))}
              className="min-h-11 shrink-0 rounded-full border-2 border-amber-400 bg-amber-50 px-3 text-sm font-semibold whitespace-nowrap text-amber-950 active:bg-amber-100"
            >
              {t.sell.heldChip(...heldText(h))}
            </button>
          ))}
        </div>
      )}

      {products && products.length > 0 && !query.trim() && (
        <CategoryChips products={products} value={shownCategory} onChange={setCategory} className="px-3 pb-2" />
      )}

      {!products || !ordered ? (
        <Skeleton rows={6} />
      ) : products.length === 0 ? (
        <Empty
          action={
            <div className="space-y-2">
              <Button className="w-full" onClick={() => setCreatingCode('')}>
                + {t.sell.firstProduct}
              </Button>
              {mode === 'store' && (
                <Button variant="secondary" className="w-full" onClick={() => void setMode('demo')}>
                  {t.settings.demoOn}
                </Button>
              )}
              {canInstall && (
                <Button variant="secondary" className="w-full" onClick={() => void promptInstall()}>
                  {t.install.button}
                </Button>
              )}
            </div>
          }
        >
          {t.sell.empty}
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>{t.sell.noResults}</Empty>
      ) : (
        <ul className={`grid grid-cols-2 gap-2 px-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${count > 0 ? 'pb-24' : 'pb-3'}`}>
          {paged.visible.map((p) => {
            const inCart = qtyIn.get(p.id) ?? 0;
            const low = p.stock <= p.minStock;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  className={`relative flex min-h-24 w-full flex-col justify-between rounded-xl border-2 bg-white p-3 text-left active:bg-brand-50 ${inCart ? 'border-brand-600' : 'border-transparent'} shadow-sm`}
                >
                  <span className="line-clamp-2 pr-6 text-base leading-snug font-semibold">{p.name}</span>
                  <span className="mt-1 flex items-end justify-between gap-1">
                    <span className="text-lg font-bold text-brand-800 tabular-nums">
                      {p.soldBy === 'weight' ? t.weight.perKg(formatKz(p.priceCents)) : formatKz(p.priceCents)}
                    </span>
                    <span
                      className={`text-xs ${p.stock <= 0 ? 'font-bold text-red-700' : low ? 'font-semibold text-amber-700' : 'text-slate-600'}`}
                    >
                      {p.stock <= 0 ? t.sell.outOfStock : t.sell.stockLeft(formatQuantity(p.stock, p.soldBy))}
                    </span>
                  </span>
                  {inCart === 0 && (
                    <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                      <PlusIcon />
                    </span>
                  )}
                  {inCart > 0 && (
                    <span className="absolute -top-2 -right-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-700 px-2 text-sm font-bold text-white">
                      {p.soldBy === 'weight' ? `${formatKg(inCart)} kg` : inCart}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {paged.rest > 0 && (
            <li className="col-span-2">
              <ShowMore rest={paged.rest} page={SELL_PAGE} onClick={paged.more} />
            </li>
          )}
        </ul>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 mb-[env(safe-area-inset-bottom)] px-3 pb-2">
          <div className="mx-auto flex max-w-lg gap-2 rounded-2xl bg-slate-900 p-2 shadow-xl md:max-w-xl">
            <button
              type="button"
              onClick={() => setSheet('cart')}
              className="flex-1 rounded-xl px-3 text-left text-white active:bg-slate-800"
            >
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <CartIcon className="h-5 w-5" />
                {t.sell.cart} · {t.sell.cartItems(count)}
              </span>
              <Money cents={total} className="text-xl font-bold" />
            </button>
            <Button big onClick={() => setSheet('checkout')} className="px-8">
              {t.sell.charge}
            </Button>
          </div>
        </div>
      )}

      {sheet === 'scan' && <Scanner onCode={onCode} onClose={() => setSheet('none')} />}

      {unknownCode && (
        <Sheet title={t.scanner.notFoundTitle} onClose={() => setUnknownCode(null)}>
          <p className="text-lg font-semibold">{t.scanner.notFound(unknownCode)}</p>
          <p className="mt-1 text-slate-600">{t.scanner.notFoundHint}</p>
          <Button
            big
            className="mt-4 w-full"
            onClick={() => {
              setCreatingCode(unknownCode);
              setUnknownCode(null);
            }}
          >
            {t.scanner.createProduct}
          </Button>
        </Sheet>
      )}
      {creatingCode !== null && (
        <ProductSheet
          productId={null}
          initialBarcode={creatingCode || undefined}
          onClose={() => setCreatingCode(null)}
          onCreated={(p) => {
            setQuery('');
            if (p.soldBy === 'weight') setWeighing(p);
            else setCart((c) => addToCart(c, p));
          }}
        />
      )}
      {sheet === 'cart' && (
        <CartSheet
          cart={cart}
          setCart={setCart}
          onClose={() => setSheet('none')}
          onCharge={() => setSheet('checkout')}
          onHold={onHold}
          onEditWeight={(productId) => {
            const p = products?.find((x) => x.id === productId);
            if (p) setWeighing(p);
          }}
        />
      )}
      {sheet === 'checkout' && (
        <CheckoutSheet
          cart={cart}
          saleId={saleId}
          onClose={() => setSheet('none')}
          onSaved={onSaved}
          onOutdated={() => void onOutdated()}
          onDuplicate={() => void onDuplicate()}
        />
      )}
      {receipt && <ReceiptSheet sale={receipt.sale} customer={receipt.customer} settings={settings} onClose={() => setReceipt(null)} />}
      {/* Last on purpose: it opens on top of the cart ("Mudar peso"). */}
      {weighing && (
        <WeightSheet
          product={weighing}
          initialGrams={cart.find((l) => l.productId === weighing.id)?.quantity}
          onClose={() => setWeighing(null)}
          onConfirm={(grams, fixedTotalCents) => {
            setCart((c) => setWeightLine(c, weighing, grams, fixedTotalCents));
            setWeighing(null);
            navigator.vibrate?.(15);
          }}
        />
      )}
    </div>
  );
}
