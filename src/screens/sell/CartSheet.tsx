import { useState } from 'react';
import { cartTotal, lineTotalOf, setQuantity, type Cart, type CartLine } from '../../domain/cart';
import { formatKg } from '../../domain/quantity';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Money, Sheet } from '../../ui/kit';
import { CartIcon } from '../../ui/icons';

export function CartSheet({
  cart,
  setCart,
  onClose,
  onCharge,
  onEditWeight,
  onHold,
}: {
  cart: Cart;
  setCart: (fn: (c: Cart) => Cart) => void;
  onClose: () => void;
  onCharge: () => void;
  /** Puts this sale on hold to serve another customer. */
  onHold?: () => void;
  /** Opens the weighing sheet for a product sold by weight. */
  onEditWeight: (productId: string) => void;
}) {
  const step = (id: string, qty: number) => setCart((c) => setQuantity(c, id, qty));
  if (cart.length === 0) {
    return (
      <Sheet title={t.sell.cart} onClose={onClose}>
        <div className="py-6 text-center">
          <CartIcon className="mx-auto h-12 w-12 text-slate-400" />
          <p className="mt-3 text-lg font-semibold">{t.sell.cartEmpty}</p>
          <p className="mt-1 text-slate-600">{t.sell.cartEmptyHint}</p>
          <Button big className="mt-5 w-full" onClick={onClose}>
            {t.sell.keepSelling}
          </Button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={t.sell.cart} onClose={onClose}>
      <ul className="divide-y divide-slate-200">
        {cart.map((l) => (
          <li key={l.productId} className="flex items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{l.name}</p>
              <p className="text-slate-600">
                {l.soldBy === 'weight' && `${formatKg(l.quantity)} kg × ${t.weight.perKg(formatKz(l.unitPriceCents))} = `}
                <Money cents={lineTotalOf(l)} />
              </p>
            </div>
            {l.soldBy === 'weight' ? (
              <Button variant="secondary" onClick={() => onEditWeight(l.productId)}>
                {t.weight.change}
              </Button>
            ) : (
              <UnitStepper line={l} onChange={(qty) => step(l.productId, qty)} />
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button
          variant="danger"
          onClick={() => {
            setCart(() => []);
            onClose();
          }}
        >
          {t.sell.clear}
        </Button>
        <Button big className="flex-1" onClick={onCharge}>
          {t.sell.charge} <Money cents={cartTotal(cart)} />
        </Button>
      </div>
      {onHold && (
        <Button variant="secondary" className="mt-2 w-full" onClick={onHold}>
          {t.sell.hold}
        </Button>
      )}
    </Sheet>
  );
}

/** − / quantity / + for products sold by the unit; tap the number to type it. */
function UnitStepper({ line, onChange }: { line: CartLine; onChange: (qty: number) => void }) {
  const [editing, setEditing] = useState(false);
  const commit = (text: string) => {
    if (/^\d{1,4}$/.test(text.trim())) onChange(Number(text.trim()));
    setEditing(false);
  };
  const stepButton = 'h-12 w-12 rounded-xl border-2 border-slate-300 bg-white text-2xl font-bold active:bg-slate-100';
  return (
    <>
      <button type="button" aria-label="Menos" onClick={() => onChange(line.quantity - 1)} className={stepButton}>
        −
      </button>
      {editing ? (
        <input
          autoFocus
          inputMode="numeric"
          aria-label={t.sell.typeQty}
          defaultValue={line.quantity}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-12 w-16 rounded-xl border-2 border-brand-700 text-center text-xl font-bold"
        />
      ) : (
        <button
          type="button"
          aria-label={t.sell.typeQty}
          onClick={() => setEditing(true)}
          className="h-12 w-12 rounded-xl text-center text-xl font-bold tabular-nums underline decoration-dotted underline-offset-4"
        >
          {line.quantity}
        </button>
      )}
      <button type="button" aria-label="Mais" onClick={() => onChange(line.quantity + 1)} className={stepButton}>
        +
      </button>
    </>
  );
}
