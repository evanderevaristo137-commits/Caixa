import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { formatBpAsPercent, parsePercentToBp } from '../../domain/tax';
import { formatKg, parseWeight } from '../../domain/quantity';
import { Button, Field, Sheet } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { Scanner, scannerSupported } from '../sell/Scanner';
import { StockPanel } from './StockPanel';

const ERRORS: Record<string, string> = {
  name_required: t.products.nameRequired,
  invalid_price: t.products.invalidPrice,
  invalid_stock: t.products.invalidNumber,
  duplicate_barcode: t.products.duplicateBarcode,
  invalid_tax: t.invoicing.rateInvalid,
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
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? formatKz(product.priceCents).replace(' Kz', '') : '');
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '');
  // How the product is sold is chosen once, when it is created (stock history depends on it).
  const [soldBy, setSoldBy] = useState<'unit' | 'weight'>(product?.soldBy ?? 'unit');
  const byWeight = soldBy === 'weight';
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState(
    product ? (product.soldBy === 'weight' ? formatKg(product.minStock) : String(product.minStock)) : '3',
  );
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [rate, setRate] = useState(product?.taxRateBp === undefined ? '' : formatBpAsPercent(product.taxRateBp));
  const [exemption, setExemption] = useState(product?.taxExemption ?? '');
  const [error, setError] = useState<{ field: string; msg: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  const save = async () => {
    const priceCents = parseKz(price);
    if (priceCents === null) return setError({ field: 'price', msg: t.products.invalidPrice });
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
      barcode,
      minStock: min,
      unit,
      taxRateBp,
      taxExemption: taxRateBp === 0 ? exemption : undefined,
      ...(byWeight ? { soldBy: 'weight' as const } : {}),
    };
    const persist = async () => {
      try {
        if (product) {
          await store.products.update(product.id, input);
        } else {
          // Note: `onCreated?.(await create())` would skip the create when there is no callback.
          const created = await store.products.create(input, initial ?? 0);
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
              : code === 'name_required'
                ? 'name'
                : code === 'invalid_tax'
                  ? 'tax'
                  : 'min';
        setError({ field, msg: ERRORS[code] ?? t.errors.saveFailed });
      }
    };
    // A new price on an existing product needs the owner code (when set).
    if (product && priceCents !== product.priceCents) await guard(persist);
    else await persist();
  };

  const archive = async () => {
    if (!product || !window.confirm(t.products.archiveConfirm)) return;
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
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label={t.products.barcode}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              inputMode="numeric"
              error={err('barcode')}
            />
          </div>
          {scannerSupported() && (
            <Button variant="secondary" onClick={() => setScanning(true)}>
              {t.sell.scan}
            </Button>
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
        <Button big className="w-full" onClick={() => void save()}>
          {t.common.save}
        </Button>
      </div>

      {product && <StockPanel product={product} />}

      {product && (
        <Button variant="danger" className="mt-6 w-full" onClick={() => void archive()}>
          {t.products.archive}
        </Button>
      )}

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
