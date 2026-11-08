import { useState } from 'react';
import { formatKg, gramsForAmount, lineTotalFor, parseWeight } from '../../domain/quantity';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Money, Sheet } from '../../ui/kit';

const WEIGHTS = [250, 500, 1_000, 2_000];
const AMOUNTS = [10_000, 20_000, 50_000, 100_000]; // 100, 200, 500 and 1.000 Kz

/**
 * Selling by weight: type the weight (or tap 250 g … 2 kg), or the amount the customer asks for
 * ("500 Kz de feijão") and the app says how much to weigh.
 */
export function WeightSheet({
  product,
  initialGrams,
  onConfirm,
  onClose,
}: {
  product: Pick<Product, 'id' | 'name' | 'priceCents'>;
  initialGrams?: number;
  onConfirm: (grams: number, fixedTotalCents?: number) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'weight' | 'amount'>('weight');
  const [weightText, setWeightText] = useState(initialGrams ? formatKg(initialGrams) : '');
  const [amountText, setAmountText] = useState('');

  const grams = mode === 'weight' ? parseWeight(weightText) : null;
  const amount = mode === 'amount' ? parseKz(amountText) : null;
  const amountGrams = amount ? gramsForAmount(amount, product.priceCents) : 0;
  const valid = mode === 'weight' ? grams !== null && grams > 0 : amount !== null && amount > 0 && amountGrams > 0;

  const confirm = () => {
    if (!valid) return;
    if (mode === 'weight') onConfirm(grams!);
    else onConfirm(amountGrams, amount!);
  };

  const chip = (selected: boolean) =>
    `min-h-12 rounded-xl border-2 px-2 text-base font-semibold ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

  return (
    <Sheet title={product.name} onClose={onClose}>
      <p className="mb-3 text-center text-lg font-semibold text-slate-700">{t.weight.perKg(formatKz(product.priceCents))}</p>
      <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label={product.name}>
        {(['weight', 'amount'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={chip(mode === m)}>
            {m === 'weight' ? t.weight.byWeight : t.weight.byAmount}
          </button>
        ))}
      </div>

      {mode === 'weight' ? (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {WEIGHTS.map((g) => (
              <button key={g} type="button" onClick={() => setWeightText(formatKg(g))} className={chip(grams === g)}>
                {g < 1_000 ? `${g} g` : `${g / 1_000} kg`}
              </button>
            ))}
          </div>
          <Field
            label={t.weight.weightLabel}
            placeholder={t.weight.weightPlaceholder}
            value={weightText}
            onChange={(e) => setWeightText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            inputMode="decimal"
            autoComplete="off"
            error={weightText && grams === null ? t.weight.invalidWeight : null}
          />
          {grams !== null && grams > 0 && (
            <p className="mt-3 text-center text-2xl font-extrabold">
              {t.weight.costs} <Money cents={lineTotalFor(product.priceCents, grams, 'weight')} />
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" onClick={() => setAmountText(formatKz(a).replace(' Kz', ''))} className={chip(amount === a)}>
                {formatKz(a)}
              </button>
            ))}
          </div>
          <Field
            label={t.weight.amountLabel}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            inputMode="numeric"
            autoComplete="off"
            error={amountText && (amount === null || amount <= 0) ? t.weight.invalidAmount : null}
          />
          {amount !== null && amountGrams > 0 && (
            <p className="mt-3 text-center text-2xl font-extrabold">
              {t.weight.gives} {formatKg(amountGrams)} kg
            </p>
          )}
        </>
      )}

      <Button big className="mt-4 w-full" disabled={!valid} onClick={confirm}>
        {initialGrams ? t.weight.update : t.weight.add}
      </Button>
      {initialGrams !== undefined && (
        <Button variant="danger" className="mt-2 w-full" onClick={() => onConfirm(0)}>
          {t.weight.remove}
        </Button>
      )}
    </Sheet>
  );
}
