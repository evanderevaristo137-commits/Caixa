import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Field, Sheet } from '../../ui/kit';
import { Scanner, scannerSupported } from '../sell/Scanner';
import { StockPanel } from './StockPanel';

const ERRORS: Record<string, string> = {
  name_required: t.products.nameRequired,
  invalid_price: t.products.invalidPrice,
  invalid_stock: t.products.invalidNumber,
  duplicate_barcode: t.products.duplicateBarcode,
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
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? formatKz(product.priceCents).replace(' Kz', '') : '');
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState(String(product?.minStock ?? 3));
  const [error, setError] = useState<{ field: string; msg: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  const save = async () => {
    const priceCents = parseKz(price);
    if (priceCents === null) return setError({ field: 'price', msg: t.products.invalidPrice });
    const min = toInt(minStock);
    if (min === null) return setError({ field: 'min', msg: t.products.invalidNumber });
    const initial = toInt(stock);
    if (!product && initial === null) return setError({ field: 'stock', msg: t.products.invalidNumber });
    const input = { name, priceCents, barcode, minStock: min };
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
        code === 'duplicate_barcode' ? 'barcode' : code === 'invalid_price' ? 'price' : code === 'name_required' ? 'name' : 'min';
      setError({ field, msg: ERRORS[code] ?? String(e) });
    }
  };

  const archive = async () => {
    if (!product || !window.confirm(t.products.archiveConfirm)) return;
    await store.products.archive(product.id);
    onClose();
  };

  const err = (f: string) => (error?.field === f ? error.msg : null);

  return (
    <Sheet title={product ? t.products.edit : t.products.add} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t.products.name} value={name} onChange={(e) => setName(e.target.value)} error={err('name')} autoComplete="off" />
        <Field label={t.products.price} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" error={err('price')} />
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
            label={t.products.stock}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode="numeric"
            error={err('stock')}
          />
        )}
        <Field
          label={t.products.minStock}
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
          inputMode="numeric"
          error={err('min')}
        />
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
