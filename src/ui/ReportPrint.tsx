import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../app/context';
import { cellText, reportCsv, type ReportDoc, type ReportHead } from '../domain/report-doc';
import { DEMO_NOTE } from '../domain/store-sheet';
import { t } from '../i18n/pt-AO';
import { formatDateTime } from '../lib/dates';
import { dateStamp } from '../lib/download';
import { shareOrDownload } from '../lib/share';
import { registerBackHandler } from './back';
import { ICON, LineIcon } from './icons';
import { Button } from './kit';
import { useBusy } from './use-busy';
import { Modal } from './modal';

/** Tables with more rows than this may go on to the next page when printed. */
const LONG_TABLE = 12;

/** "Contas da loja" → "contas-da-loja" (for the file name). */
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * «Guardar ou enviar (PDF ou Excel)»: builds the report with the shop's name on top (read when the
 * button is pressed, so it is always the current name) and opens it, ready to print or send.
 */
export function ReportButton({ build, className = '' }: { build: (head: ReportHead) => ReportDoc; className?: string }) {
  const { store, mode } = useApp();
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [busy, run] = useBusy();
  const open = () =>
    run(async () => {
      const settings = await store.settings.get();
      setDoc(
        build({
          storeName: settings.storeName,
          ...(settings.nif ? { nif: settings.nif } : {}),
          demo: mode === 'demo',
          madeAt: formatDateTime(new Date().toISOString()),
        }),
      );
    });
  return (
    <>
      <Button
        variant="secondary"
        className={`flex w-full items-center justify-center gap-2 ${className}`}
        disabled={busy}
        onClick={() => void open()}
      >
        <LineIcon d={ICON.file} />
        {t.reportDoc.open}
      </Button>
      {doc && <ReportPrint doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

/**
 * A report ready to keep or send: «Imprimir ou guardar em PDF» (the phone's print screen) or
 * «Enviar para o Excel» (a spreadsheet, shared or saved). Rendered straight into <body>, so only the
 * report prints. The shop's name on top; the notice that it is not a fiscal document below.
 */
export function ReportPrint({ doc, onClose }: { doc: ReportDoc; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => registerBackHandler(() => close.current()), []);

  const excel = () => void shareOrDownload(`${slug(doc.title)}-${dateStamp()}.csv`, reportCsv(doc), 'text/csv', doc.title);

  return createPortal(
    <Modal className="print-area fixed inset-0 z-50 overflow-y-auto bg-white p-4 text-black" aria-label={t.reportDoc.dialog}>
      <div className="mx-auto mb-4 max-w-2xl space-y-2 print:hidden">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button className="flex-1" onClick={() => window.print()}>
            {t.reportDoc.pdf}
          </Button>
        </div>
        <Button variant="secondary" className="w-full" onClick={excel}>
          {t.reportDoc.excel}
        </Button>
        <p className="text-sm text-slate-600">{t.reportDoc.hint}</p>
      </div>
      <article className="mx-auto max-w-2xl space-y-4">
        {doc.demo && (
          <p className="rounded-lg border-2 border-amber-500 bg-amber-50 p-2 text-center font-bold text-amber-900">{DEMO_NOTE}</p>
        )}
        <header className="border-b-2 border-black pb-2">
          <p className="text-xl font-extrabold">{doc.storeName}</p>
          {doc.nif && <p className="text-sm">NIF {doc.nif}</p>}
          <h1 className="mt-1 text-lg font-bold">{doc.title}</h1>
          {doc.period && <p>{doc.period}</p>}
          <p className="text-sm text-slate-700">{t.reportDoc.madeAt(doc.madeAt)}</p>
        </header>
        {doc.tables.map((table) => {
          const left = (i: number) => i === 0 || (table.textColumns?.includes(i) ?? false);
          return (
            // A short table stays on one page; a long one goes on to the next (its header repeats).
            <section key={table.title} className={table.rows.length <= LONG_TABLE ? 'break-inside-avoid' : ''}>
              <h2 className="mb-1 font-bold break-after-avoid">{table.title}</h2>
              {/* Wide tables scroll sideways on a phone (also with the keyboard: it can take the focus); on paper they fit the page. */}
              <div
                role="region"
                aria-label={table.title}
                tabIndex={0}
                className="overflow-x-auto rounded focus-visible:outline-2 focus-visible:outline-brand-700 print:overflow-visible"
              >
                <table className="w-full border-collapse text-sm">
                  {table.header && (
                    <thead>
                      <tr>
                        {table.header.map((h, i) => (
                          <th
                            key={h}
                            scope="col"
                            className={`border-b border-slate-400 px-1 py-1 align-bottom ${left(i) ? 'text-left' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {table.rows.map((row, r) => (
                      <tr key={r} className="break-inside-avoid border-b border-slate-200">
                        {row.map((cell, i) => (
                          <td
                            key={i}
                            colSpan={row.length === 1 ? Math.max(1, table.header?.length ?? 2) : undefined}
                            className={`px-1 py-1 ${left(i) ? 'text-left whitespace-pre-wrap' : 'text-right whitespace-nowrap tabular-nums'}`}
                          >
                            {cellText(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        <footer className="space-y-1 border-t border-slate-400 pt-2 text-xs text-slate-700">
          {doc.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </footer>
      </article>
    </Modal>,
    document.body,
  );
}
