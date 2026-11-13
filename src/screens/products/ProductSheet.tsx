import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { formatBpAsPercent, parsePercentToBp } from '../../domain/tax';
import { formatKg, parseWeight } from '../../domain/quantity';
import { formatMargin, unitMargin } from '../../domain/profit';
import { isInternalBarcode, isValidEan13 } from '../../domain/barcode';
import { BarcodeSvg } from '../../ui/BarcodeSvg';
import { LabelsSheet } from './LabelsSheet';
import { Button, Field, Sheet } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { useConfirm } from '../../ui/confirm';
import { Scanner, scannerSupported } from '../sell/Scanner';
import { StockPanel } from './StockPanel';
import { PurchasePricesPanel } from './PurchasePricesPanel';
import { CategoryPicker, type CategoryChoice } from './CategoryPicker';
import { useBusy } from '../../ui/use-busy';
import { saveFailedText } from '../../lib/save-error';

const ERRORS: Record<string, string> = {
  name_required: t.products.nameRequired,
  invalid_price: t.products.invalidPrice,
  invalid_cost: t.products.invalidCost,
  invalid_stock: t.products.invalidNumber,
  duplicate_barcode: t.products.duplicateBarcode,
  invalid_tax: t.invoicing.rateInvalid,
  invalid_date: t.expiry.invalidDate,
};

const toInt = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

export function ProductSheet({
  productId,
  onClose,
  initialBarcode,
  onCreated,
}: {
  productId: string | null;
  onClose: () => void;
  initialBarcode?: string;
  onCreated?: (product: Product) => void;
}) {
  const { store, showToast } = useApp();
  const product = useLiveQuery(() => (productId ? store.products.get(productId) : undefined), [store, productId]);
  if (productId && !product) return null;
  return (
    <ProductForm
      key={product?.id ?? 'new'}
      product={product}
      initialBarcode={initialBarcode}
      onCreated={onCreated}
      onClose={onClose}
      store={store}
      showToast={showToast}
    />
  );
}

function ProductForm({
  product,
  initialBarcode,
  onCreated,
  onClose,
  store,
  showToast,
}: {
  product?: Product;
  initialBarcode?: string;
  onCreated?: (product: Product) => void;
  onClose: () => void;
  store: ReturnType<typeof useApp>['store'];
  showToast: (m: string) => void;
}) {
  const guard = usePinGuard();
  const [dialog, ask] = useConfirm();
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? formatKz(product.priceCents).replace(' Kz', '') : '');
  const [cost, setCost] = useState(product?.costCents !== undefined ? formatKz(product.costCents).replace(' Kz', '') : '');
  const [labels, setLabels] = useState(false);
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '');
  // How the product is sold is chosen once, when it is created (stock history depends on it).
  const [soldBy, setSoldBy] = useState<'unit' | 'weight'>(product?.soldBy ?? 'unit');
  const byWeight = soldBy === 'weight';
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState(
    product ? (product.soldBy === 'weight' ? formatKg(product.minStock) : String(product.minStock)) : '3',
  );
  const [place, setPlace] = useState<CategoryChoice | null>(
    product?.category ? { category: product.category, ...(product.subcategory ? { subcategory: product.subcategory } : {}) } : null,
  );
  const [tracks, setTracks] = useState(product?.tracksExpiry ?? false);
  const [initialExpiry, setInitialExpiry] = useState('');
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [rate, setRate] = useState(product?.taxRateBp === undefined ? '' : formatBpAsPercent(product.taxRateBp));
  const [exemption, setExemption] = useState(product?.taxExemption ?? '');
  const [error, setError] = useState<{ field: string; msg: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, runOnce] = useBusy();

  const submit = async () => {
    const priceCents = parseKz(price);
    if (priceCents === null) return setError({ field: 'price', msg: t.products.invalidPrice });
    // Cost price is optional: empty = not known.
    const costCents = cost.trim() === '' ? undefined : parseKz(cost);
    if (costCents === null) return setError({ field: 'cost', msg: t.products.invalidCost });
    // Weighed products: stock and minimum are typed in kg and kept in grams.
    const toQty = (text: string) => (byWeight ? parseWeight(text) : toInt(text));
    const qtyError = byWeight ? t.products.invalidWeight : t.products.invalidNumber;
    const min = toQty(minStock);
    if (min === null) return setError({ field: 'min', msg: qtyError });
    const initial = toQty(stock);
    if (!product && initial === null) return setError({ field: 'stock', msg: qtyError });
    const taxRateBp = parsePercentToBp(rate);
    if (taxRateBp === null) return setError({ field: 'tax', msg: t.invoicing.rateInvalid });
    const input = {
      name,
      priceCents,
      costCents,
      barcode,
      minStock: min,
      category: place?.category ?? '',
      subcategory: place?.subcategory ?? '',
      unit,
      taxRateBp,
      taxExemption: taxRateBp === 0 ? exemption : undefined,
      ...(byWeight ? { soldBy: 'weight' as const } : {}),
      tracksExpiry: tracks,
    };
    const persist = async () => {
      try {
        if (product) {
          await store.products.update(product.id, input);
        } else {
          // Note: `onCreated?.(await create())` would skip the create when there is no callback.
          const created = await store.products.create(input, initial ?? 0, tracks && initialExpiry ? initialExpiry : undefined);
          onCreated?.(created);
        }
        showToast(t.settings.saved);
        onClose();
      } catch (e) {
        const code = e instanceof DomainError ? e.code : 'unknown';
        const field =
          code === 'duplicate_barcode'
            ? 'barcode'
            : code === 'invalid_price'
              ? 'price'
              : code === 'invalid_cost'
                ? 'cost'
                : code === 'name_required'
                  ? 'name'
                  : code === 'invalid_date'
                    ? 'expiry'
                    : code === 'invalid_tax'
                      ? 'tax'
                      : 'min';
        setError({ field, msg: ERRORS[code] ?? saveFailedText(e) });
      }
    };
    // A new price on an existing product needs the owner code (when set).
    if (product && priceCents !== product.priceCents) await guard(persist);
    else await persist();
  };
  // One tap, one product: a second tap while it is being saved is ignored.
  const save = () => runOnce(submit);

  const archive = async () => {
    if (!product) return;
    const ok = await ask({
      title: t.products.archiveConfirm,
      message: t.products.archiveConfirmNote,
      confirmLabel: t.products.archiveYes,
      danger: true,
    });
    if (!ok) return;
    await guard(async () => {
      await store.products.archive(product.id);
      onClose();
    });
  };

  const err = (f: string) => (error?.field === f ? error.msg : null);

  return (
    <Sheet title={product ? t.products.edit : t.products.add} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t.products.name} value={name} onChange={(e) => setName(e.target.value)} error={err('name')} autoComplete="off" />
        {product ? (
          byWeight && <p className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">{t.products.soldByWeightNote}</p>
        ) : (
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-700">{t.products.soldByTitle}</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.products.soldByTitle}>
              {(['unit', 'weight'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={soldBy === s}
                  onClick={() => setSoldBy(s)}
                  className={`min-h-12 rounded-xl border-2 text-base font-semibold ${soldBy === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
                >
                  {s === 'unit' ? t.products.byUnit : t.products.byWeight}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field
          label={byWeight ? t.products.pricePerKg : t.products.price}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          error={err('price')}
        />
        <Field
          label={byWeight ? t.products.costPerKg : t.products.cost}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          inputMode="decimal"
          hint={t.products.costHint}
          error={err('cost')}
        />
        <MarginHint price={price} cost={cost} byWeight={byWeight} />
        <div className="space-y-2">
          <Field
            label={t.products.barcode}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            inputMode="numeric"
            hint={barcode.trim() ? undefined : t.products.barcodeHint}
            error={err('barcode')}
          />
          <div className="grid grid-cols-2 gap-2">
            {scannerSupported() && (
              <Button variant="secondary" onClick={() => setScanning(true)}>
                {t.sell.scan}
              </Button>
            )}
            {!barcode.trim() && (
              <Button variant="secondary" onClick={() => void store.products.nextInternalBarcode().then(setBarcode)}>
                {t.products.generateBarcode}
              </Button>
            )}
          </div>
          {isValidEan13(barcode.trim()) && (
            <div className="rounded-xl bg-white p-3 text-center">
              <BarcodeSvg code={barcode.trim()} className="mx-auto h-auto w-56" />
              {isInternalBarcode(barcode.trim()) && <p className="mt-1 text-sm text-slate-600">{t.products.internalBarcode}</p>}
            </div>
          )}
        </div>
        {!product && (
          <Field
            label={byWeight ? t.products.stockKg : t.products.stock}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode={byWeight ? 'decimal' : 'numeric'}
            error={err('stock')}
          />
        )}
        <Field
          label={byWeight ? t.products.minStockKg : t.products.minStock}
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
          inputMode="numeric"
          error={err('min')}
        />
        <CategoryPicker value={place} onChange={setPlace} />
        <label className="flex min-h-12 items-start gap-3 rounded-xl bg-white px-3 py-2">
          <input
            type="checkbox"
            className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
            checked={tracks}
            onChange={(e) => setTracks(e.target.checked)}
          />
          <span>
            <span className="block font-semibold">{t.expiry.track}</span>
            <span className="text-sm text-slate-600">{t.expiry.trackHint}</span>
          </span>
        </label>
        {!product && tracks && (
          <Field
            label={t.expiry.initialDate}
            type="date"
            value={initialExpiry}
            onChange={(e) => setInitialExpiry(e.target.value)}
            error={err('expiry')}
          />
        )}
        <details className="rounded-xl bg-white p-3" open={err('tax') !== null}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.invoicing.title}</summary>
          <div className="mt-2 space-y-3">
            <Field label={t.invoicing.unit} value={unit} onChange={(e) => setUnit(e.target.value)} autoComplete="off" />
            <Field label={t.invoicing.rate} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" error={err('tax')} />
            {parsePercentToBp(rate) === 0 && (
              <Field label={t.invoicing.exemption} value={exemption} onChange={(e) => setExemption(e.target.value)} autoComplete="off" />
            )}
            <p className="text-sm text-slate-600">{t.invoicing.rateHint}</p>
          </div>
        </details>
        <Button big className="w-full" disabled={busy} onClick={() => void save()}>
          {t.common.save}
        </Button>
      </div>

      {product?.barcode && isValidEan13(product.barcode) && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setLabels(true)}>
          {t.products.labels}
        </Button>
      )}

      {product && <StockPanel product={product} />}
      {product && <PurchasePricesPanel product={product} />}

      {product && (
        <Button variant="danger" className="mt-6 w-full" onClick={() => void archive()}>
          {t.products.archive}
        </Button>
      )}

      {labels && product && <LabelsSheet initialIds={[product.id]} onClose={() => setLabels(false)} />}
      {dialog}

      {scanning && (
        <Scanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setBarcode(c);
            setScanning(false);
          }}
        />
      )}
    </Sheet>
  );
}

/** Live "what you earn on each unit" line while the price and cost are typed. */
function MarginHint({ price, cost, byWeight }: { price: string; cost: string; byWeight: boolean }) {
  const priceCents = parseKz(price);
  const costCents = cost.trim() ? parseKz(cost) : null;
  if (priceCents === null || costCents === null) return null;
  const m = unitMargin(priceCents, costCents);
  if (m.profitCents < 0)
    return <p className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-800">{t.products.belowCost(formatKz(-m.profitCents))}</p>;
  const pct = m.marginBp === undefined ? '—' : formatMargin(m.marginBp);
  return (
    <p className="rounded-lg bg-brand-50 p-2 text-sm font-semibold text-brand-800">
      {byWeight ? t.products.marginKg(formatKz(m.profitCents), pct) : t.products.marginUnit(formatKz(m.profitCents), pct)}
    </p>
  );
}
