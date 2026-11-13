import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { ALL_CATEGORIES, inFilter, type CategoryFilter } from '../../domain/categories';
import { formatKg, formatQuantity, parseWeight } from '../../domain/quantity';
import { countLines, emptyCount, parseCountDraft, setCount, summariseCount, type CountDraft } from '../../domain/stock-count';
import type { Product } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { activeFilter, CategoryChips } from '../../ui/CategoryChips';
import { Button, normalise, Sheet, Skeleton } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { useConfirm } from '../../ui/confirm';
import { Scanner, scannerSupported } from '../sell/Scanner';
import { CountReview } from './CountReview';

/** Rows shown at a time (a long list of inputs is slow on cheap phones). */
const PAGE = 80;

const draftKey = (mode: string) => `caixa.count.${mode}`;

function loadDraft(mode: string): CountDraft | null {
  try {
    return parseCountDraft(localStorage.getItem(draftKey(mode)));
  } catch {
    return null;
  }
}

/** Products counted in an unfinished count (0 when there is none). */
export const countedSoFar = (mode: string) => Object.keys(loadDraft(mode)?.lines ?? {}).length;

const quantityText = (q: number, p: Pick<Product, 'soldBy'>) => (p.soldBy === 'weight' ? formatKg(q) : String(q));
const parseQuantity = (text: string, p: Pick<Product, 'soldBy'>): number | null =>
  p.soldBy === 'weight' ? parseWeight(text) : /^\d{1,9}$/.test(text) ? Number(text) : null;

/** Count the stock on the shelves, then see the differences and adjust everything at once. */
export function StockCountSheet({ onClose }: { onClose: () => void }) {
  const { store, mode, showToast } = useApp();
  const guard = usePinGuard();
  const [dialog, ask] = useConfirm();
  const products = useLiveQuery(() => store.products.list(), [store]);
  const [draft, setDraft] = useState<CountDraft>(() => loadDraft(mode) ?? emptyCount(new Date()));
  // What is typed in each field (maybe half-typed); the draft keeps only valid counts.
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [scanning, setScanning] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (Object.keys(draft.lines).length === 0) localStorage.removeItem(draftKey(mode));
      else localStorage.setItem(draftKey(mode), JSON.stringify(draft));
    } catch {
      /* storage unavailable: the count just isn't kept if the app closes */
    }
  }, [draft, mode]);

  const shown = products ? activeFilter(products, filter) : ALL_CATEGORIES;
  const list = useMemo(() => {
    if (!products) return [];
    const q = normalise(query);
    if (q) return products.filter((p) => normalise(p.name).includes(q) || (p.barcode ?? '').startsWith(q));
    return products.filter((p) => inFilter(p, shown));
  }, [products, query, shown]);
  const summary = useMemo(() => (products ? summariseCount(draft, products) : null), [draft, products]);

  // A scanned code shows that product alone: the cursor goes to its field.
  useEffect(() => {
    if (/^\d{6,}$/.test(query) && list.length === 1) document.getElementById(`count-${list[0]!.id}`)?.focus();
  }, [query, list]);

  const type = (p: Product, text: string) => {
    setTexts((x) => ({ ...x, [p.id]: text }));
    const q = text.trim() === '' ? null : parseQuantity(text.trim(), p);
    // A wrong value is not counted until it is fixed.
    setDraft((d) => setCount(d, p, q));
  };

  const discard = async () => {
    const ok = await ask({
      title: t.stockCount.discardConfirm,
      message: t.stockCount.discardConfirmNote,
      confirmLabel: t.stockCount.discardYes,
      danger: true,
    });
    if (!ok) return;
    setDraft(emptyCount(new Date()));
    setTexts({});
  };

  const apply = async () => {
    if (!products || !summary) return;
    const run = async () => {
      setBusy(true);
      try {
        const result = await store.products.applyCount(countLines(draft, products));
        try {
          localStorage.removeItem(draftKey(mode));
        } catch {
          /* nothing saved */
        }
        showToast(t.stockCount.done(result.adjusted));
        onClose();
      } catch {
        setBusy(false);
        showToast(t.stockCount.failed);
      }
    };
    // Changing stock asks for the owner's code, as an adjustment does.
    if (summary.differences.length > 0) await guard(run);
    else await run();
  };

  const sc = t.stockCount;
  return (
    <Sheet title={reviewing ? sc.reviewTitle : sc.title} onClose={onClose}>
      {!products || !summary ? (
        <Skeleton rows={4} />
      ) : reviewing ? (
        <CountReview summary={summary} busy={busy} onApply={() => void apply()} onBack={() => setReviewing(false)} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{sc.intro}</p>
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder={sc.search}
              aria-label={sc.search}
              className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
            />
            {scannerSupported() && (
              <Button variant="secondary" className="px-3 text-sm" onClick={() => setScanning(true)}>
                {sc.scan}
              </Button>
            )}
          </div>
          {!query.trim() && <CategoryChips products={products} value={shown} onChange={setFilter} className="-mx-4 px-4" />}
          {list.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-slate-600">{sc.noneFound}</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
              {list.slice(0, limit).map((p) => (
                <CountRow key={p.id} product={p} line={draft.lines[p.id]} text={texts[p.id]} onType={(text) => type(p, text)} />
              ))}
            </ul>
          )}
          {list.length > limit && (
            <Button variant="secondary" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
              {sc.showMore}
            </Button>
          )}
          {summary.counted > 0 && (
            <Button variant="ghost" className="w-full" onClick={() => void discard()}>
              {sc.discard}
            </Button>
          )}
          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50 px-4 pt-3">
            <p className="mb-2 text-sm font-semibold text-slate-700" aria-live="polite">
              {sc.progress(summary.counted, products.length)}
              {summary.differences.length > 0 && ` · ${sc.withDiff(summary.differences.length)}`}
            </p>
            <Button big className="w-full" disabled={summary.counted === 0} onClick={() => setReviewing(true)}>
              {sc.review}
            </Button>
          </div>
        </div>
      )}
      {scanning && (
        <Scanner
          onClose={() => setScanning(false)}
          onCode={(code) => {
            setScanning(false);
            setQuery(code);
          }}
        />
      )}
      {dialog}
    </Sheet>
  );
}

function CountRow({
  product: p,
  line,
  text,
  onType,
}: {
  product: Product;
  line?: { counted: number; expected: number };
  text?: string;
  onType: (text: string) => void;
}) {
  const value = text ?? (line ? quantityText(line.counted, p) : '');
  const invalid = value.trim() !== '' && parseQuantity(value.trim(), p) === null;
  const delta = line ? line.counted - line.expected : 0;
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-sm text-slate-600 tabular-nums">
          {t.stockCount.inApp(formatQuantity(line ? line.expected : p.stock, p.soldBy))}
          {line && delta === 0 && <span className="font-bold text-brand-800"> · ✓</span>}
          {line && delta !== 0 && (
            <span className={`font-bold ${delta < 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {' · '}
              {delta < 0 ? '−' : '+'}
              {formatQuantity(Math.abs(delta), p.soldBy)}
            </span>
          )}
        </p>
      </div>
      <input
        id={`count-${p.id}`}
        inputMode={p.soldBy === 'weight' ? 'decimal' : 'numeric'}
        autoComplete="off"
        aria-label={t.stockCount.counted(p.name)}
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onType(e.target.value)}
        className={`h-12 w-20 rounded-xl border-2 bg-white px-2 text-right text-lg tabular-nums ${invalid ? 'border-red-600' : line ? 'border-brand-600' : 'border-slate-300'}`}
      />
      <button
        type="button"
        aria-label={t.stockCount.same(formatQuantity(p.stock, p.soldBy))}
        disabled={p.stock < 0}
        onClick={() => onType(quantityText(p.stock, p))}
        className="h-12 w-12 shrink-0 rounded-xl border-2 border-slate-300 bg-white text-xl font-bold active:bg-slate-100 disabled:opacity-40"
      >
        =
      </button>
    </li>
  );
}
