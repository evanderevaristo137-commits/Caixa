import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { productsCsv, productsTemplateCsv } from '../../data/backup';
import { MAX_IMPORT_ROWS, planImport, type ImportPlan, type SheetRow } from '../../domain/import-products';
import { formatQuantity } from '../../domain/quantity';
import { t } from '../../i18n/pt-AO';
import { dateStamp } from '../../lib/download';
import { formatKz } from '../../lib/money';
import { shareOrDownload } from '../../lib/share';
import { MAX_FILE_BYTES, readSpreadsheet, SpreadsheetError } from '../../lib/spreadsheet';
import { Button, Card, Sheet, Skeleton } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';

/** How many lines each list shows before "e mais N…". */
const SHOWN = 30;

// Android names spreadsheets and CSV files in many ways; .xls is listed so the app can explain it.
const ACCEPT = [
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'text/plain',
].join(',');

/** Import a product list from Excel or CSV: choose the file, see what changes, then save it all at once. */
export function ImportProductsSheet({ onClose }: { onClose: () => void }) {
  const { store, mode, showToast } = useApp();
  const guard = usePinGuard();
  const products = useLiveQuery(() => store.products.list(), [store]);
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<{ name: string; rows: SheetRow[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Recomputed when the products change, so what is saved is always what is shown.
  const plan = useMemo(() => (sheet && products ? planImport(sheet.rows, products) : null), [sheet, products]);
  const toSave = plan ? plan.rows.filter((r) => r.action !== 'same') : [];

  const choose = async (file: File | undefined) => {
    // Clear the input so the same file can be chosen again after fixing it.
    if (input.current) input.current.value = '';
    if (!file) return;
    setProblem(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new SpreadsheetError('too_big');
      setSheet({ name: file.name, rows: await readSpreadsheet(new Uint8Array(await file.arrayBuffer())) });
    } catch (e) {
      setSheet(null);
      const code = e instanceof SpreadsheetError ? e.code : 'unreadable';
      setProblem(
        code === 'old_excel' ? t.importProducts.oldExcel : code === 'too_big' ? t.importProducts.tooBig : t.importProducts.unreadable,
      );
    }
  };

  const save = async () => {
    const run = async () => {
      setBusy(true);
      try {
        const done = await store.products.importMany(toSave);
        showToast(t.importProducts.done(done.created, done.updated));
        onClose();
      } catch {
        setBusy(false);
        setSheet(null);
        setProblem(t.importProducts.failed);
      }
    };
    // New prices are protected by the owner's code, as in the product form.
    if (toSave.some((r) => r.priceChanged)) await guard(run);
    else await run();
  };

  const download = async () => {
    const withProducts = (products?.length ?? 0) > 0;
    const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
    const content = withProducts ? await productsCsv(store.db) : productsTemplateCsv();
    await shareOrDownload(`${prefix}-produtos-${dateStamp()}.csv`, content, 'text/csv', t.importProducts.templateName);
  };

  const pick = () => input.current?.click();

  return (
    <Sheet title={t.importProducts.title} onClose={onClose}>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
      {!products ? (
        <Skeleton rows={3} />
      ) : sheet && plan ? (
        <div className="space-y-3">
          <p className="truncate text-sm text-slate-600">{sheet.name}</p>
          <Preview plan={plan} />
          {toSave.length > 0 ? (
            <Button big className="w-full" disabled={busy} onClick={() => void save()}>
              {busy ? t.importProducts.importing : t.importProducts.import(toSave.length)}
            </Button>
          ) : (
            plan.rows.length > 0 && <p className="rounded-xl bg-white p-3 text-slate-700">{t.importProducts.nothing}</p>
          )}
          <Button variant="secondary" className="w-full" disabled={busy} onClick={pick}>
            {t.importProducts.pickOther}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-700">{t.importProducts.intro}</p>
          <Card>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {t.importProducts.how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Card>
          {problem && <Problem>{problem}</Problem>}
          <Button big className="w-full" onClick={pick}>
            {t.importProducts.pick}
          </Button>
          <Button variant="secondary" className="w-full text-sm" onClick={() => void download()}>
            {products.length > 0 ? t.importProducts.templateList : t.importProducts.template}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-50 p-3 font-medium text-red-800">
      {children}
    </p>
  );
}

/** A list that shows the first lines and says how many more there are. */
function ShortList<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  return (
    <>
      <ul className="divide-y divide-slate-100">{items.slice(0, SHOWN).map(render)}</ul>
      {items.length > SHOWN && <p className="pt-2 text-sm text-slate-600">{t.importProducts.more(items.length - SHOWN)}</p>}
    </>
  );
}

function Preview({ plan }: { plan: ImportPlan }) {
  const ip = t.importProducts;
  if (plan.missingColumns.length > 0) return <Problem>{ip.missingColumns(plan.missingColumns)}</Problem>;
  if (plan.tooMany) return <Problem>{ip.tooMany(MAX_IMPORT_ROWS)}</Problem>;
  if (plan.rows.length === 0 && plan.errors.length === 0) return <Problem>{ip.noRows}</Problem>;
  const created = plan.rows.filter((r) => r.action === 'create');
  const updated = plan.rows.filter((r) => r.action === 'update');
  return (
    <>
      <Card>
        <ul className="space-y-1 text-lg font-semibold" aria-live="polite">
          <li className={plan.created ? 'text-brand-800' : 'text-slate-500'}>{ip.created(plan.created)}</li>
          <li className={plan.updated ? 'text-brand-800' : 'text-slate-500'}>{ip.updated(plan.updated)}</li>
          {plan.unchanged > 0 && <li className="text-base font-medium text-slate-600">{ip.unchanged(plan.unchanged)}</li>}
        </ul>
      </Card>
      {plan.errors.length > 0 && (
        <Card className="border-2 border-red-200 bg-red-50">
          <h3 className="font-bold text-red-800">{ip.errorsTitle(plan.errors.length)}</h3>
          <ShortList
            items={plan.errors}
            render={(e) => (
              <li key={e.line} className="py-1 text-sm text-red-900">
                {ip.errorLine(e.line, e.message)}
              </li>
            )}
          />
          <p className="pt-2 text-sm text-red-900">{ip.errorsHint}</p>
        </Card>
      )}
      {plan.stockKept > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{ip.stockKept(plan.stockKept)}</p>}
      {created.length > 0 && (
        <Card>
          <h3 className="font-bold">{ip.newTitle}</h3>
          <ShortList
            items={created}
            render={(r) => (
              <li key={r.line} className="py-2">
                <span className="block font-semibold">{r.product.name}</span>
                <span className="text-sm text-slate-600 tabular-nums">
                  {r.product.soldBy === 'weight' ? t.weight.perKg(formatKz(r.product.priceCents)) : formatKz(r.product.priceCents)}
                  {r.product.stock !== undefined && ` · ${t.products.inStock(formatQuantity(r.product.stock, r.product.soldBy))}`}
                  {r.product.category && ` · ${r.product.category}`}
                </span>
              </li>
            )}
          />
        </Card>
      )}
      {updated.length > 0 && (
        <Card>
          <h3 className="font-bold">{ip.updateTitle}</h3>
          <ShortList
            items={updated}
            render={(r) => (
              <li key={r.line} className="py-2">
                <span className="block font-semibold">{r.currentName}</span>
                <span className="text-sm text-slate-600 tabular-nums">{r.changes.join(' · ')}</span>
              </li>
            )}
          />
        </Card>
      )}
    </>
  );
}
