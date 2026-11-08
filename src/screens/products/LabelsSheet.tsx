import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { isValidEan13 } from '../../domain/barcode';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Sheet, Skeleton } from '../../ui/kit';
import { LabelsPrint, type LabelItem } from './LabelsPrint';

const MAX_COPIES = 50;
const printable = (p: Product) => !!p.barcode && isValidEan13(p.barcode);
const priceText = (p: Product) => (p.soldBy === 'weight' ? t.weight.perKg(formatKz(p.priceCents)) : formatKz(p.priceCents));

/** Choose products and copies, make codes for products without one, then print the labels. */
export function LabelsSheet({ onClose, initialIds }: { onClose: () => void; initialIds?: string[] }) {
  const { store, showToast } = useApp();
  const products = useLiveQuery(() => store.products.list(), [store]);
  // null = every product with a printable code.
  const [picked, setPicked] = useState<Set<string> | null>(initialIds ? new Set(initialIds) : null);
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState<LabelItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = products ?? [];
  const withoutCode = useMemo(() => list.filter((p) => !p.barcode), [list]);
  const isPicked = (p: Product) => printable(p) && (picked === null || picked.has(p.id));

  const toggle = (p: Product) => {
    const next = new Set(picked ?? list.filter(printable).map((x) => x.id));
    if (next.has(p.id)) next.delete(p.id);
    else next.add(p.id);
    setPicked(next);
    setError(null);
  };

  const generate = async () => {
    const ids = withoutCode.map((p) => p.id);
    const n = await store.products.assignInternalBarcodes(ids);
    // The products that just got a code are ticked too.
    if (picked !== null) setPicked(new Set([...picked, ...ids]));
    showToast(t.labels.generated(n));
  };

  const print = () => {
    const chosen = list.filter(isPicked);
    if (chosen.length === 0) return setError(t.labels.pickOne);
    const labels: LabelItem[] = [];
    for (const p of chosen) {
      for (let i = 0; i < copies; i++) labels.push({ key: `${p.id}-${i}`, name: p.name, price: priceText(p), code: p.barcode! });
    }
    setPrinting(labels);
  };

  return (
    <Sheet title={t.labels.title} onClose={onClose}>
      {!products ? (
        <Skeleton rows={3} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t.labels.hint}</p>
          {withoutCode.length > 0 && (
            <Button variant="secondary" className="w-full" onClick={() => void generate()}>
              {t.labels.generateMissing(withoutCode.length)}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPicked(null)}>
              {t.labels.all}
            </Button>
            <Button variant="ghost" onClick={() => setPicked(new Set())}>
              {t.labels.none}
            </Button>
          </div>
          <ul className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white">
            {list.map((p) => (
              <li key={p.id}>
                <label className={`flex min-h-12 items-center gap-3 px-3 py-2 ${printable(p) ? '' : 'opacity-60'}`}>
                  <input
                    type="checkbox"
                    className="h-6 w-6 accent-brand-700"
                    checked={isPicked(p)}
                    disabled={!printable(p)}
                    onChange={() => toggle(p)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="text-sm text-slate-600 tabular-nums">
                      {priceText(p)} · {printable(p) ? p.barcode : t.labels.noCode}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-3">
            <span className="font-semibold">{t.labels.copies}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" aria-label={t.labels.fewer} onClick={() => setCopies((c) => Math.max(1, c - 1))}>
                −
              </Button>
              <span className="min-w-8 text-center text-xl font-bold tabular-nums" aria-live="polite">
                {copies}
              </span>
              <Button variant="secondary" aria-label={t.labels.more} onClick={() => setCopies((c) => Math.min(MAX_COPIES, c + 1))}>
                +
              </Button>
            </div>
          </div>
          {error && <p className="font-medium text-red-700">{error}</p>}
          <Button big className="w-full" onClick={print}>
            {t.labels.print}
          </Button>
        </div>
      )}
      {printing && <LabelsPrint labels={printing} onClose={() => setPrinting(null)} />}
    </Sheet>
  );
}
