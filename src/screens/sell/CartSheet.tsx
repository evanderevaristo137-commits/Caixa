import { cartTotal, setQuantity, type Cart } from '../../domain/cart';
import { lineTotal } from '../../lib/money';
import { t } from '../../i18n/pt-AO';
import { Button, Money, Sheet } from '../../ui/kit';

export function CartSheet({
  cart,
  setCart,
  onClose,
  onCharge,
}: {
  cart: Cart;
  setCart: (fn: (c: Cart) => Cart) => void;
  onClose: () => void;
  onCharge: () => void;
}) {
  const step = (id: string, qty: number) => setCart((c) => setQuantity(c, id, qty));
  return (
    <Sheet title={t.sell.cart} onClose={onClose}>
      <ul className="divide-y divide-slate-200">
        {cart.map((l) => (
          <li key={l.productId} className="flex items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{l.name}</p>
              <Money cents={lineTotal(l.unitPriceCents, l.quantity)} className="text-slate-600" />
            </div>
            <button type="button" aria-label="Menos" onClick={() => step(l.productId, l.quantity - 1)} className="h-12 w-12 rounded-xl border-2 border-slate-300 bg-white text-2xl font-bold active:bg-slate-100">
              −
            </button>
            <span className="w-8 text-center text-xl font-bold tabular-nums">{l.quantity}</span>
            <button type="button" aria-label="Mais" onClick={() => step(l.productId, l.quantity + 1)} className="h-12 w-12 rounded-xl border-2 border-slate-300 bg-white text-2xl font-bold active:bg-slate-100">
              +
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button variant="danger" onClick={() => {
            setCart(() => []);
            onClose();
          }}>
          {t.sell.clear}
        </Button>
        <Button big className="flex-1" onClick={onCharge}>
          {t.sell.charge} <Money cents={cartTotal(cart)} />
        </Button>
      </div>
    </Sheet>
  );
}
